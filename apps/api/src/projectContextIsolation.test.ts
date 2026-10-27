import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GenerationRequest, GenerationResult, ImageProvider } from "@bearridge/shared";
import { afterEach, describe, expect, it } from "vitest";
import { projectDbManager } from "./db.js";
import { generateFrame, type GenerationServiceDependencies } from "./services/generationService.js";
import { resolveFrameGenerationReadinessForProject } from "./services/frameGenerationReadinessService.js";
import { createChatGPTExport, prepareManualChatGPTExport } from "./services/chatGPTExportService.js";

const roots: string[] = [];

afterEach(async () => {
  await projectDbManager.closeProject();
  expect(projectDbManager.getContextLifecycleSnapshot()).toEqual([]);
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Context isolation "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100
  })));
});

describe("async project context isolation", () => {
  it("keeps A context when switching to copied B before provider invocation", async () => {
    const fixture = await copiedFixture();
    const provider = controlledProvider();
    const beforeProvider = barrier();
    let readinessCalls = 0;
    const generation = generateFrame(fixture.frameId, "production", "INITIAL", {
      createProvider: provider.factory,
      async resolveReadiness(prisma, projectPath, frameId) {
        readinessCalls += 1;
        if (readinessCalls === 2) {
          beforeProvider.enter();
          await beforeProvider.waitForRelease();
        }
        return resolveFrameGenerationReadinessForProject(prisma, projectPath, frameId);
      }
    });
    await beforeProvider.waitForEntry();
    const b = await projectDbManager.openProject({ projectPath: fixture.b });
    const bBefore = await counts(b.prisma, fixture.frameId);
    beforeProvider.release();
    await provider.waitForCalls(1);
    await provider.succeed(0);
    const result = await generation;

    expect(provider.requests[0]?.prompt).toContain("marker: A-target");
    expect(provider.options[0]?.rootPath).toBe(fixture.a);
    await expect(fs.access(path.join(fixture.a, result!.outputFilePath))).resolves.toBeUndefined();
    expect(await counts(b.prisma, fixture.frameId)).toEqual(bBefore);
    await expect(fs.access(path.join(fixture.b, result!.outputFilePath))).rejects.toThrow();
  });

  it("finishes SUCCESS in A when switching to B during provider execution", async () => {
    const fixture = await copiedFixture();
    const provider = controlledProvider();
    const generation = generateFrame(fixture.frameId, "production", "INITIAL", dependencies(provider));
    await provider.waitForCalls(1);
    const b = await projectDbManager.openProject({ projectPath: fixture.b });
    const bBefore = await counts(b.prisma, fixture.frameId);
    await provider.succeed(0);
    const result = await generation;

    expect(result?.status).toBe("SUCCESS");
    expect(await counts(b.prisma, fixture.frameId)).toEqual(bBefore);
    await expect(fs.access(path.join(fixture.a, result!.outputFilePath))).resolves.toBeUndefined();
    await expect(fs.access(path.join(fixture.a, result!.outputFilePath.replace(/\.png$/u, ".json")))).resolves.toBeUndefined();
    expect(lifecycleForFixture(fixture.root)).toEqual([
      expect.objectContaining({ projectPath: fixture.b, active: true, leaseCount: 0, closed: false })
    ]);
  });

  it("marks A FAILED after a provider error while B remains unchanged", async () => {
    const fixture = await copiedFixture();
    const aLease = projectDbManager.acquireActiveProject();
    const provider = controlledProvider();
    const generation = generateFrame(fixture.frameId, "production", "INITIAL", dependencies(provider));
    await provider.waitForCalls(1);
    const b = await projectDbManager.openProject({ projectPath: fixture.b });
    const bBefore = await counts(b.prisma, fixture.frameId);
    provider.fail(0, new Error("controlled failure"));
    await expect(generation).rejects.toThrow("controlled failure");

    expect(await counts(b.prisma, fixture.frameId)).toEqual(bBefore);
    const failed = await aLease.prisma.generation.findFirstOrThrow({ where: { frameId: fixture.frameId } });
    expect(failed.status).toBe("FAILED");
    expect(JSON.parse(failed.rawMetadata!)).toMatchObject({ message: "controlled failure" });
    await aLease.release();
  });

  it("keeps two A leases alive and releases them in reverse completion order", async () => {
    const fixture = await copiedFixture(true);
    const provider = controlledProvider();
    const first = generateFrame(fixture.frameId, "draft", "INITIAL", dependencies(provider));
    const second = generateFrame(fixture.secondFrameId!, "draft", "INITIAL", dependencies(provider));
    await provider.waitForCalls(2);
    const b = await projectDbManager.openProject({ projectPath: fixture.b });
    expect(lifecycleFor(fixture.a)).toMatchObject({ active: false, leaseCount: 2, closed: false });
    await provider.succeed(1);
    await second;
    expect(lifecycleFor(fixture.a)).toMatchObject({ active: false, leaseCount: 1, closed: false });
    await provider.succeed(0);
    await first;
    expect(lifecycleForFixture(fixture.root)).toEqual([
      expect.objectContaining({ projectPath: fixture.b, active: true, leaseCount: 0 })
    ]);
    expect((await counts(b.prisma, fixture.frameId)).generations).toBe(0);
  });

  it("keeps the original A lease valid through A to B to A", async () => {
    const fixture = await copiedFixture();
    const provider = controlledProvider();
    const generation = generateFrame(fixture.frameId, "production", "INITIAL", dependencies(provider));
    await provider.waitForCalls(1);
    await projectDbManager.openProject({ projectPath: fixture.b });
    const reopenedA = await projectDbManager.openProject({ projectPath: fixture.a });
    expect(projectDbManager.getContextLifecycleSnapshot().filter((item) => item.projectPath === fixture.a)).toHaveLength(2);
    await provider.succeed(0);
    const result = await generation;
    expect(result?.status).toBe("SUCCESS");
    expect(await reopenedA.prisma.generation.count({ where: { frameId: fixture.frameId } })).toBe(1);
    expect(lifecycleForFixture(fixture.root)).toEqual([
      expect.objectContaining({ projectPath: fixture.a, active: true, leaseCount: 0, closed: false })
    ]);
  });

  it("makes lease release idempotent and defers disconnect until the last release", async () => {
    const fixture = await copiedFixture();
    const first = projectDbManager.acquireActiveProject();
    const second = projectDbManager.acquireActiveProject();
    await projectDbManager.openProject({ projectPath: fixture.b });
    expect(lifecycleFor(fixture.a)?.leaseCount).toBe(2);
    await first.release();
    await first.release();
    expect(lifecycleFor(fixture.a)?.leaseCount).toBe(1);
    await second.release();
    expect(lifecycleFor(fixture.a)).toBeUndefined();
  });

  it("publishes a delayed ChatGPT export only in its leased project", async () => {
    const fixture = await copiedFixture();
    const beforePublish = barrier();
    const exporting = createChatGPTExport(fixture.frameId, new Date("2026-10-26T00:00:00.000Z"), {
      async prepare(frameId, context) {
        const prepared = await prepareManualChatGPTExport(frameId, context);
        return {
          ...prepared,
          async revalidate() {
            beforePublish.enter();
            await beforePublish.waitForRelease();
            await prepared.revalidate();
          }
        };
      }
    });
    await beforePublish.waitForEntry();
    await projectDbManager.openProject({ projectPath: fixture.b });
    beforePublish.release();
    const result = await exporting;

    await expect(fs.access(path.join(fixture.a, "exports", "chatgpt", `${result.exportId}.json`))).resolves.toBeUndefined();
    await expect(fs.access(path.join(fixture.b, "exports", "chatgpt", `${result.exportId}.json`))).rejects.toThrow();
    expect(lifecycleForFixture(fixture.root)).toEqual([
      expect.objectContaining({ projectPath: fixture.b, active: true, leaseCount: 0 })
    ]);
  });
});

function dependencies(provider: ReturnType<typeof controlledProvider>): GenerationServiceDependencies {
  return { createProvider: provider.factory, resolveReadiness: resolveFrameGenerationReadinessForProject };
}

function controlledProvider() {
  const pending: Array<{ resolve: (result: GenerationResult) => void; reject: (error: Error) => void; request: GenerationRequest; output: string; root: string }> = [];
  const callWaiters: Array<{ count: number; resolve: () => void }> = [];
  const options: Array<{ rootPath: string; outputFilePath: string }> = [];
  const factory: GenerationServiceDependencies["createProvider"] = (providerOptions) => {
    options.push({ rootPath: providerOptions.rootPath, outputFilePath: providerOptions.outputFilePath });
    const call = (request: GenerationRequest) => new Promise<GenerationResult>((resolve, reject) => {
      pending.push({ resolve, reject, request, output: providerOptions.outputFilePath, root: providerOptions.rootPath });
      for (let index = callWaiters.length - 1; index >= 0; index -= 1) {
        if (callWaiters[index]!.count <= pending.length) callWaiters.splice(index, 1)[0]!.resolve();
      }
    });
    return { capabilities: { generate: true, trueEdit: true }, generate: call, edit: call } as ImageProvider;
  };
  return {
    factory,
    options,
    get requests() { return pending.map((item) => item.request); },
    async waitForCalls(count: number) {
      if (pending.length >= count) return;
      await new Promise<void>((resolve) => callWaiters.push({ count, resolve }));
    },
    async succeed(index: number) {
      const item = pending[index]!;
      await fs.mkdir(path.dirname(item.output), { recursive: true });
      await fs.writeFile(item.output, png());
      item.resolve({ provider: "controlled", model: "controlled", outputFilePath: path.relative(item.root, item.output).replaceAll("\\", "/"), rawMetadata: {}, createdAt: new Date() });
    },
    fail(index: number, error: Error) { pending[index]!.reject(error); }
  };
}

function barrier() {
  let entered = deferred<void>();
  const released = deferred<void>();
  return {
    enter: () => entered.resolve(),
    waitForEntry: () => entered.promise,
    resetEntry: () => { entered = deferred<void>(); },
    release: () => released.resolve(),
    waitForRelease: () => released.promise
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function copiedFixture(withSecondFrame = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-context-isolation-"));
  roots.push(root);
  const a = path.join(root, "A");
  const b = path.join(root, "B");
  const created = await projectDbManager.createProject({ name: `Context isolation ${path.basename(root)}`, rootPath: a });
  const scene = await created.prisma.scene.create({ data: { projectId: created.project.id, sequence: 1, name: "Scene A" } });
  await created.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id, "A-live")) } });
  const frame = await created.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001" } });
  await created.prisma.frameStoryState.create({ data: { frameId: frame.id, document: JSON.stringify(state(scene.id, "A-target")), originType: "EXPLICIT" } });
  const second = withSecondFrame
    ? await created.prisma.frame.create({ data: { sceneId: scene.id, sequence: 2, frameCode: "S001_F002" } })
    : null;
  if (second) {
    await created.prisma.frameStoryState.create({
      data: { frameId: second.id, document: JSON.stringify(state(scene.id, "A-second-target")), originType: "EXPLICIT" }
    });
  }
  await projectDbManager.closeProject();
  await fs.cp(a, b, { recursive: true });
  const copied = await projectDbManager.openProject({ projectPath: b });
  await copied.prisma.storyState.update({ where: { sceneId: scene.id }, data: { document: JSON.stringify(state(scene.id, "B-live")) } });
  await copied.prisma.frameStoryState.update({ where: { frameId: frame.id }, data: { document: JSON.stringify(state(scene.id, "B-target")) } });
  await projectDbManager.openProject({ projectPath: a });
  return { root, a, b, frameId: frame.id, secondFrameId: second?.id };
}

async function counts(prisma: ReturnType<typeof projectDbManager.getActiveProject>["prisma"], frameId: string) {
  return {
    generations: await prisma.generation.count({ where: { frameId } }),
    status: (await prisma.frame.findUniqueOrThrow({ where: { id: frameId } })).status
  };
}

function lifecycleFor(projectPath: string) {
  return projectDbManager.getContextLifecycleSnapshot().find((item) => item.projectPath === projectPath);
}

function lifecycleForFixture(root: string) {
  return projectDbManager.getContextLifecycleSnapshot().filter((item) => item.projectPath.startsWith(root));
}

function state(sceneId: string, marker: string) {
  return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [] };
}

function png() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
