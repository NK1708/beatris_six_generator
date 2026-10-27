import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectDbManager } from "./db.js";
import { MockImageProvider } from "./providers/mockImageProvider.js";
import { generateFrame } from "./services/generationService.js";
import { resolveFrameGenerationReadinessForProject } from "./services/frameGenerationReadinessService.js";

const roots: string[] = [];

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Portability "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("project copy and move portability", () => {
  it("keeps generation writes in the opened copy and moved directory", async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-portability-"));
    roots.push(sandbox);
    const source = path.join(sandbox, "source-project");
    const copy = path.join(sandbox, "copied-project");
    const moved = path.join(sandbox, "moved-project");
    const sentinel = path.join(sandbox, "external-sentinel");
    await fs.mkdir(sentinel);
    await fs.writeFile(path.join(sentinel, "sentinel.txt"), "sentinel");

    const created = await projectDbManager.createProject({ name: `Portability ${path.basename(sandbox)}`, rootPath: source });
    const scene = await created.prisma.scene.create({ data: { projectId: created.project.id, sequence: 1, name: "Scene" } });
    await created.prisma.storyState.create({
      data: { sceneId: scene.id, document: JSON.stringify({ sceneId: scene.id, time: {}, environment: {}, characters: {}, props: {}, storyFacts: [] }) }
    });
    const first = await created.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001" } });
    await fs.writeFile(path.join(source, "references", "canonical.png"), png());
    await projectDbManager.closeProject();
    const sourceBefore = await treeHashes(source);
    const sentinelBefore = await treeHashes(sentinel);

    await fs.cp(source, copy, { recursive: true });
    const copied = await projectDbManager.openProject({ projectPath: copy });
    expect(copied.project.rootPath).toBe(source);
    const copiedGeneration = await generateWithMock(first.id, copy);
    await expect(fs.access(path.join(copy, copiedGeneration.outputFilePath))).resolves.toBeUndefined();
    expect(await treeHashes(source)).toEqual(sourceBefore);
    expect(await treeHashes(sentinel)).toEqual(sentinelBefore);

    await projectDbManager.closeProject();
    await fs.rename(copy, moved);
    const movedContext = await projectDbManager.openProject({ projectPath: moved });
    const second = await movedContext.prisma.frame.create({ data: { sceneId: scene.id, sequence: 2, frameCode: "S001_F002" } });
    const movedGeneration = await generateWithMock(second.id, moved);
    await expect(fs.access(path.join(moved, movedGeneration.outputFilePath))).resolves.toBeUndefined();
    expect((await movedContext.prisma.project.findUniqueOrThrow({ where: { id: created.project.id } })).rootPath).toBe(source);
    expect(await treeHashes(source)).toEqual(sourceBefore);
    expect(await treeHashes(sentinel)).toEqual(sentinelBefore);
  });
});

async function generateWithMock(frameId: string, expectedRoot: string) {
  const result = await generateFrame(frameId, "draft", "INITIAL", {
    createProvider(options) {
      expect(options.rootPath).toBe(expectedRoot);
      return new MockImageProvider(options.model, options.outputFilePath, options.rootPath);
    },
    resolveReadiness: resolveFrameGenerationReadinessForProject
  });
  if (!result?.outputFilePath) throw new Error("Synthetic generation did not produce an output path.");
  return result;
}

async function treeHashes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result[path.relative(root, absolute).replaceAll("\\", "/")] = crypto.createHash("sha256").update(await fs.readFile(absolute)).digest("hex");
    }
  }
  await visit(root);
  return result;
}

function png(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
