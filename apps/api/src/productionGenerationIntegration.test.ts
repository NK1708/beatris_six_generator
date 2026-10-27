import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { EditRequest, GenerationRequest, ImageProvider } from "@bearridge/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { generateFrame, previewProductionFrame, type GenerationServiceDependencies } from "./services/generationService.js";
import { resolveFrameGenerationReadinessForProject } from "./services/frameGenerationReadinessService.js";
import { FrameStoryStateService } from "./services/frameStoryStateService.js";
import { MockImageProvider } from "./providers/mockImageProvider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const testEntries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Gate "));
  for (const entry of testEntries) {
    await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  }
  await projectDbManager.closeProject();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("production generation readiness integration", () => {
  it("uses one persisted target for NEW_COMPOSITION prompt, preview, snapshot and later Scene changes", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "target");
    const provider = fakeProvider(fixture.directory);

    const preview = await previewProductionFrame(frame.id);
    await fixture.prisma.storyState.update({
      where: { sceneId: fixture.sceneId },
      data: { document: JSON.stringify(state(fixture.sceneId, "live-changed")) }
    });
    const generation = await generateFrame(frame.id, "production", "INITIAL", dependencies(provider));

    expect(generation).toMatchObject({ status: "SUCCESS", frameId: frame.id });
    expect(provider.calls).toEqual({ generate: 1, edit: 0 });
    expect(provider.requests.generate[0]?.prompt).toBe(preview.prompt);
    expect(provider.requests.generate[0]?.prompt).toContain("marker: target");
    expect(provider.requests.generate[0]?.prompt).not.toContain("live-changed");
    expect(JSON.parse(generation!.storyStateSnapshot)).toMatchObject({ environment: { marker: "target" } });
    await fixture.prisma.storyState.update({ where: { sceneId: fixture.sceneId }, data: { document: JSON.stringify(state(fixture.sceneId, "after")) } });
    expect(JSON.parse((await fixture.prisma.generation.findUniqueOrThrow({ where: { id: generation!.id } })).storyStateSnapshot))
      .toMatchObject({ environment: { marker: "target" } });
    expect((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).revision).toBe(1);
  });

  it.each([
    ["missing", "TARGET_NOT_INITIALIZED"],
    ["invalid", "TARGET_INVALID"]
  ] as const)("blocks NEW_COMPOSITION with %s target without side effects", async (kind, reason) => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    if (kind === "invalid") {
      await fixture.prisma.frameStoryState.create({ data: { frameId: frame.id, document: "not-json", originType: "EXPLICIT" } });
    }
    const frameBefore = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } });
    const sceneStateBefore = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });
    const targetBefore = await fixture.prisma.frameStoryState.findUnique({ where: { frameId: frame.id } });
    const provider = fakeProvider(fixture.directory);

    await expect(generateFrame(frame.id, "production", "INITIAL", dependencies(provider))).rejects.toMatchObject({
      code: "PRODUCTION_GENERATION_BLOCKED",
      reasons: [reason]
    });
    expect(provider.calls).toEqual({ generate: 0, edit: 0 });
    expect(await fixture.prisma.generation.count({ where: { frameId: frame.id } })).toBe(0);
    expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).toEqual(frameBefore);
    expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneStateBefore);
    expect(await fixture.prisma.frameStoryState.findUnique({ where: { frameId: frame.id } })).toEqual(targetBefore);
  });

  it("runs READY CONTINUE through provider.edit", async () => {
    const fixture = await createFixture();
    const { frame, predecessor, selected } = await createContinuation(fixture);
    await createTarget(fixture, predecessor.id, "predecessor-target");
    const latestPath = "generations/latest.png";
    await writePng(path.join(fixture.directory, latestPath));
    await createGeneration(fixture, predecessor.id, latestPath);
    const preview = await previewProductionFrame(frame.id);
    const provider = fakeProvider(fixture.directory);
    const generation = await generateFrame(frame.id, "production", "INITIAL", dependencies(provider));
    expect(generation).toMatchObject({ status: "SUCCESS", generationType: "EDIT", parentGenerationId: selected.id });
    expect(provider.calls).toEqual({ generate: 0, edit: 1 });
    expect(provider.requests.edit[0]?.baseImagePath).toBe(selected.outputFilePath);
    expect(provider.requests.edit[0]?.repairInstructions).toContain('"marker":"target"');
    expect(preview.detectedContinuityChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "environment", entityId: "marker", previousValue: "baseline", currentValue: "target" })
    ]));
    expect(JSON.stringify(preview.detectedContinuityChanges)).not.toContain("predecessor-target");
    expect(JSON.parse(generation!.storyStateSnapshot)).toMatchObject({ environment: { marker: "target" } });
  });

  it("uses target outfit for references while retaining explicit Frame character selection", async () => {
    const fixture = await createFixture();
    const character = await fixture.prisma.character.create({
      data: { projectId: fixture.project.id, name: "Hero", slug: "hero", status: "LOCKED" }
    });
    const identity = await fixture.prisma.characterReference.create({
      data: { characterId: character.id, type: "MASTER", version: 1, code: "HERO_MASTER_V1", filePath: "references/hero.png", status: "LOCKED", isCanonical: true }
    });
    await fixture.prisma.character.update({ where: { id: character.id }, data: { masterReferenceId: identity.id } });
    const liveOutfit = await fixture.prisma.outfit.create({ data: { characterId: character.id, name: "Live Outfit", slug: "live", status: "LOCKED" } });
    const targetOutfit = await fixture.prisma.outfit.create({ data: { characterId: character.id, name: "Target Outfit", slug: "target", status: "LOCKED" } });
    const liveRef = await fixture.prisma.outfitReference.create({
      data: { outfitId: liveOutfit.id, type: "MASTER", version: 1, code: "LIVE_MASTER_V1", filePath: "references/live.png", status: "LOCKED", isCanonical: true }
    });
    const targetRef = await fixture.prisma.outfitReference.create({
      data: { outfitId: targetOutfit.id, type: "MASTER", version: 1, code: "TARGET_MASTER_V1", filePath: "references/target.png", status: "LOCKED", isCanonical: true }
    });
    await fixture.prisma.outfit.update({ where: { id: liveOutfit.id }, data: { masterReferenceId: liveRef.id } });
    await fixture.prisma.outfit.update({ where: { id: targetOutfit.id }, data: { masterReferenceId: targetRef.id } });
    await fixture.prisma.storyState.update({
      where: { sceneId: fixture.sceneId },
      data: { document: JSON.stringify(characterState(fixture.sceneId, character.id, liveOutfit.id)) }
    });
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await fixture.prisma.frameCharacter.create({ data: { frameId: frame.id, characterId: character.id, order: 1 } });
    await fixture.prisma.frameStoryState.create({
      data: { frameId: frame.id, document: JSON.stringify(characterState(fixture.sceneId, character.id, targetOutfit.id)), originType: "EXPLICIT" }
    });
    const provider = fakeProvider(fixture.directory);

    await generateFrame(frame.id, "production", "INITIAL", dependencies(provider));

    expect(provider.requests.generate[0]?.references.map((reference) => reference.id)).toEqual([identity.id, targetRef.id]);
    expect(provider.requests.generate[0]?.references.map((reference) => reference.id)).not.toContain(liveRef.id);
    expect(provider.requests.generate[0]?.prompt).toContain("Target Outfit");
  });

  it.each([
    ["no selection", "PREDECESSOR_SELECTION_MISSING"],
    ["review predecessor", "PREDECESSOR_NOT_LOCKED"],
    ["missing image", "VISUAL_BASE_FILE_UNAVAILABLE"]
  ] as const)("blocks CONTINUE for %s", async (condition, reason) => {
    const fixture = await createFixture();
    const setup = await createContinuation(fixture);
    if (condition === "no selection") await fixture.prisma.frame.update({ where: { id: setup.predecessor.id }, data: { selectedGenerationId: null } });
    if (condition === "review predecessor") await fixture.prisma.frame.update({ where: { id: setup.predecessor.id }, data: { status: "REVIEW" } });
    if (condition === "missing image") await fs.rm(path.join(fixture.directory, setup.selected.outputFilePath));
    const provider = fakeProvider(fixture.directory);
    await expect(generateFrame(setup.frame.id, "production", "INITIAL", dependencies(provider))).rejects.toMatchObject({ reasons: [reason] });
    expect(provider.calls).toEqual({ generate: 0, edit: 0 });
    expect(await fixture.prisma.generation.count({ where: { frameId: setup.frame.id } })).toBe(0);
    expect((await fixture.prisma.frame.findUniqueOrThrow({ where: { id: setup.frame.id } })).status).toBe("DRAFT");
  });

  it.each(["target revision", "target document", "selected Generation", "frame status", "visual base file"] as const)(
    "aborts stale production when %s changes between checks",
    async (change) => {
      const fixture = await createFixture();
      const setup = await createContinuation(fixture);
      const provider = fakeProvider(fixture.directory);
      let checks = 0;
      const deps = dependencies(provider, async (prisma, projectPath, frameId) => {
        checks += 1;
        if (checks === 2) {
          if (change === "target revision") {
            await prisma.frameStoryState.update({ where: { frameId }, data: { revision: { increment: 1 } } });
          } else if (change === "target document") {
            await prisma.frameStoryState.update({ where: { frameId }, data: { document: JSON.stringify(state(fixture.sceneId, "direct-write")) } });
          } else if (change === "selected Generation") {
            const otherPath = "generations/other.png";
            await writePng(path.join(projectPath, otherPath));
            const other = await createGeneration(fixture, setup.predecessor.id, otherPath);
            await prisma.frame.update({ where: { id: setup.predecessor.id }, data: { selectedGenerationId: other.id } });
          } else if (change === "frame status") {
            await prisma.frame.update({ where: { id: frameId }, data: { status: "LOCKED" } });
          } else {
            await fs.rm(path.join(projectPath, setup.selected.outputFilePath));
          }
        }
        return resolveFrameGenerationReadinessForProject(prisma, projectPath, frameId);
      });

      await expect(generateFrame(setup.frame.id, "production", "INITIAL", deps)).rejects.toMatchObject({
        code: "GENERATION_READINESS_STALE",
        reasons: expect.arrayContaining(["GENERATION_READINESS_STALE"])
      });
      expect(provider.calls).toEqual({ generate: 0, edit: 0 });
      expect(await fixture.prisma.generation.count({ where: { frameId: setup.frame.id } })).toBe(0);
    }
  );

  it("linearizes Target PUT before generation claim and rejects the stale generation input", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "before");
    const provider = fakeProvider(fixture.directory);
    const claimBarrier = barrier();
    const generation = generateFrame(frame.id, "draft", "INITIAL", {
      ...dependencies(provider),
      beforeGenerationClaim: async () => {
        claimBarrier.enter();
        await claimBarrier.waitForRelease();
      }
    });
    await claimBarrier.waitForEntry();
    await new FrameStoryStateService(fixture.prisma).updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "after"), 1);
    claimBarrier.release();

    await expect(generation).rejects.toMatchObject({ code: "GENERATION_START_CONFLICT", statusCode: 409 });
    expect(provider.calls).toEqual({ generate: 0, edit: 0 });
    expect(await fixture.prisma.generation.count({ where: { frameId: frame.id } })).toBe(0);
    expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).toMatchObject({ status: "DRAFT" });
    expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).toMatchObject({ revision: 2 });
  });

  it("rejects generation when cast revision changes after preview and before claim", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "before");
    const provider = fakeProvider(fixture.directory);
    await expect(generateFrame(frame.id, "draft", "INITIAL", {
      ...dependencies(provider),
      beforeGenerationClaim: async () => {
        await fixture.prisma.frame.update({ where: { id: frame.id }, data: { characterCastRevision: { increment: 1 } } });
      }
    })).rejects.toMatchObject({ code: "GENERATION_START_CONFLICT", statusCode: 409 });
    expect(provider.calls).toEqual({ generate: 0, edit: 0 });
    expect(await fixture.prisma.generation.count({ where: { frameId: frame.id } })).toBe(0);
  });

  it("rejects Target PUT after generation claims the Frame", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "before");
    const provider = fakeProvider(fixture.directory);
    const providerBarrier = barrier();
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (request) => {
      providerBarrier.enter();
      await providerBarrier.waitForRelease();
      return originalGenerate(request);
    };
    const generation = generateFrame(frame.id, "production", "INITIAL", dependencies(provider));
    await providerBarrier.waitForEntry();

    await expect(new FrameStoryStateService(fixture.prisma).updateFrameTargetStoryState(
      frame.id,
      state(fixture.sceneId, "after"),
      1
    )).rejects.toMatchObject({ code: "FRAME_GENERATING", statusCode: 409 });
    expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).toMatchObject({ revision: 1 });
    providerBarrier.release();
    await expect(generation).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("keeps Draft generation available for a legacy Frame without target", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    const provider = fakeProvider(fixture.directory);
    await expect(generateFrame(frame.id, "draft", "INITIAL", dependencies(provider))).resolves.toMatchObject({ status: "SUCCESS" });
    expect(provider.calls.generate).toBe(1);
  });

  it("uses the opened project directory instead of stale persisted rootPath", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    const externalSentinel = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-external-sentinel-"));
    temporaryDirectories.push(externalSentinel);
    const sentinelPath = path.join(externalSentinel, "sentinel.txt");
    await fs.writeFile(sentinelPath, "unchanged");
    await fixture.prisma.project.update({ where: { id: fixture.project.id }, data: { rootPath: externalSentinel } });
    const before = await fs.readFile(path.join(fixture.directory, "project.sqlite"));

    const generation = await generateFrame(frame.id, "draft", "INITIAL", {
      createProvider(options) {
        expect(options.rootPath).toBe(fixture.directory);
        expect(options.outputFilePath.startsWith(`${fixture.directory}${path.sep}`)).toBe(true);
        return new MockImageProvider(options.model, options.outputFilePath, options.rootPath);
      },
      resolveReadiness: resolveFrameGenerationReadinessForProject
    });

    expect(generation?.outputFilePath).toMatch(/^generations\//u);
    await expect(fs.access(path.join(fixture.directory, generation!.outputFilePath))).resolves.toBeUndefined();
    await expect(fs.access(path.join(externalSentinel, "generations"))).rejects.toThrow();
    expect(await fs.readFile(sentinelPath, "utf8")).toBe("unchanged");
    expect((await fixture.prisma.project.findUniqueOrThrow({ where: { id: fixture.project.id } })).rootPath).toBe(externalSentinel);
    expect((await fs.readFile(path.join(fixture.directory, "project.sqlite"))).equals(before)).toBe(false);
  });

  it("preserves target snapshot and provenance when the provider fails", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "target");
    const provider = fakeProvider(fixture.directory);
    provider.generate = async (request) => {
      provider.calls.generate += 1;
      provider.requests.generate.push(request);
      throw new Error("Synthetic provider failure");
    };

    await expect(generateFrame(frame.id, "production", "INITIAL", dependencies(provider)))
      .rejects.toThrow("Synthetic provider failure");

    const generation = await fixture.prisma.generation.findFirstOrThrow({ where: { frameId: frame.id } });
    expect(generation.status).toBe("FAILED");
    expect(JSON.parse(generation.storyStateSnapshot)).toMatchObject({ environment: { marker: "target" } });
    expect(JSON.parse(generation.rawMetadata!)).toMatchObject({
      message: "Synthetic provider failure",
      productionTarget: { revision: 1, provenance: { origin: "EXPLICIT" } }
    });
    expect((await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).status).toBe("DRAFT");
  });

  it("returns machine-readable readiness reasons through POST /api/generations", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server address unavailable.");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/generations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frameId: frame.id, mode: "production" })
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "PRODUCTION_GENERATION_BLOCKED",
        reasons: ["TARGET_NOT_INITIALIZED"],
        diagnostics: [{ reason: "TARGET_NOT_INITIALIZED", frameId: frame.id }]
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

function dependencies(
  provider: ReturnType<typeof fakeProvider>,
  resolveReadiness: GenerationServiceDependencies["resolveReadiness"] = resolveFrameGenerationReadinessForProject
): GenerationServiceDependencies {
  return { createProvider: () => provider, resolveReadiness };
}

function barrier() {
  const entered = deferred<void>();
  const released = deferred<void>();
  return { enter: () => entered.resolve(), waitForEntry: () => entered.promise, release: () => released.resolve(), waitForRelease: () => released.promise };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function fakeProvider(rootPath: string): ImageProvider & {
  calls: { generate: number; edit: number };
  requests: { generate: GenerationRequest[]; edit: EditRequest[] };
} {
  const calls = { generate: 0, edit: 0 };
  const requests = { generate: [] as GenerationRequest[], edit: [] as EditRequest[] };
  const write = async (frameId: string) => {
    const outputFilePath = `generations/${frameId}/fake.png`;
    await writePng(path.join(rootPath, outputFilePath));
    return { provider: "fake", model: "fake", outputFilePath, rawMetadata: {}, createdAt: new Date(), estimatedCost: 0 };
  };
  return {
    capabilities: { generate: true, trueEdit: true },
    calls,
    requests,
    async generate(request) { calls.generate += 1; requests.generate.push(request); return write(request.frameId); },
    async edit(request) { calls.edit += 1; requests.edit.push(request); return write(request.frameId); }
  };
}

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-production-gate-"));
  temporaryDirectories.push(directory);
  const context = await projectDbManager.createProject({ name: `Gate ${path.basename(directory)}`, rootPath: directory });
  const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  await context.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id, "live")) } });
  return { ...context, directory, sceneId: scene.id };
}

async function createFrame(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  sequence: number,
  generationStrategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME",
  previousFrameId: string | null = null,
  status = "DRAFT"
) {
  return fixture.prisma.frame.create({
    data: { sceneId: fixture.sceneId, sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`, generationStrategy, previousFrameId, status }
  });
}

async function createTarget(fixture: Awaited<ReturnType<typeof createFixture>>, frameId: string, marker = "target") {
  return fixture.prisma.frameStoryState.create({
    data: { frameId, document: JSON.stringify(state(fixture.sceneId, marker)), originType: "EXPLICIT" }
  });
}

async function createGeneration(fixture: Awaited<ReturnType<typeof createFixture>>, frameId: string, outputFilePath: string) {
  return fixture.prisma.generation.create({
    data: {
      frameId, provider: "test", model: "test", prompt: "test", status: "SUCCESS", outputFilePath,
      resolution: "1K", aspectRatio: "16:9", storyStateSnapshot: JSON.stringify(state(fixture.sceneId, "baseline")), frameSnapshot: "{}"
    }
  });
}

async function createContinuation(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const predecessor = await createFrame(fixture, 1, "NEW_COMPOSITION", null, "LOCKED");
  const outputFilePath = "generations/base.png";
  await writePng(path.join(fixture.directory, outputFilePath));
  const selected = await createGeneration(fixture, predecessor.id, outputFilePath);
  await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
  const frame = await createFrame(fixture, 2, "CONTINUE_PREVIOUS_FRAME", predecessor.id);
  await createTarget(fixture, frame.id);
  return { predecessor, selected, frame };
}

async function writePng(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function state(sceneId: string, marker: string) {
  return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [] };
}

function characterState(sceneId: string, characterId: string, outfitId: string) {
  return {
    sceneId,
    time: { description: "day" },
    environment: {},
    characters: { [characterId]: { present: true, outfitId, locationPosition: "center" } },
    props: {},
    storyFacts: []
  };
}
