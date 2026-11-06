import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { projectDbManager } from "./db.js";
import {
  createChatGPTExport,
  prepareManualChatGPTExport,
  type ChatGPTExportDependencies
} from "./services/chatGPTExportService.js";
import { importChatGPTResult } from "./services/chatGPTImportService.js";
import { FrameStoryStateService } from "./services/frameStoryStateService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Export target "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("manual ChatGPT export target integration", () => {
  it("uses one persisted NEW_COMPOSITION target for prompt, receipt and import history", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    await createTarget(fixture, frame.id, "target");

    const first = await createChatGPTExport(frame.id);
    const firstReceipt = await readReceipt(fixture.directory, first.exportId);
    expect(first.prompt).toContain("marker: target");
    expect(first.prompt).not.toContain("marker: live");
    expect(firstReceipt.storyStateSnapshot).toMatchObject({ environment: { marker: "target" } });
    expect(firstReceipt.fullTargetPrompt).toBe(first.prompt.slice(first.prompt.indexOf("# ORIGINAL BEARRIDGE PRODUCTION PROMPT") + "# ORIGINAL BEARRIDGE PRODUCTION PROMPT\n\n".length));
    expect(firstReceipt.bearridgeMetadata.targetStoryState).toMatchObject({ revision: 1, provenance: { origin: "EXPLICIT" } });

    await fixture.prisma.storyState.update({
      where: { sceneId: fixture.sceneId },
      data: { document: JSON.stringify(state(fixture.sceneId, "live-changed")) }
    });
    const second = await createChatGPTExport(frame.id);
    expect(second.prompt).toBe(first.prompt);

    await fixture.prisma.frameStoryState.update({
      where: { frameId: frame.id },
      data: { document: JSON.stringify(state(fixture.sceneId, "target-after-export")), revision: { increment: 1 } }
    });
    const imported = await importChatGPTResult({
      frameId: frame.id,
      exportId: first.exportId,
      fileName: "render.png",
      dataUrl: "data:image/png;base64,iVBORw0KGgo="
    });
    expect(imported).not.toBeNull();
    if (!imported) throw new Error("Expected imported Generation.");
    expect(JSON.parse(imported.storyStateSnapshot)).toMatchObject({ environment: { marker: "target" } });
    expect(imported.prompt).toBe(firstReceipt.fullTargetPrompt);
  });

  it.each([
    ["missing", "TARGET_NOT_INITIALIZED"],
    ["invalid", "TARGET_INVALID"]
  ] as const)("blocks NEW_COMPOSITION with %s target and publishes no receipt", async (kind, reason) => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
    if (kind === "invalid") {
      await fixture.prisma.frameStoryState.create({ data: { frameId: frame.id, document: "not-json", originType: "EXPLICIT" } });
    }
    const frameBefore = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } });
    await expect(createChatGPTExport(frame.id)).rejects.toMatchObject({ code: "CHATGPT_EXPORT_BLOCKED", reasons: [reason] });
    expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).toEqual(frameBefore);
    expect(await fixture.prisma.generation.count({ where: { frameId: frame.id } })).toBe(0);
    expect(await receiptNames(fixture.directory)).toEqual([]);
  });

  it("uses the selected predecessor snapshot and image without falling back to latest SUCCESS or predecessor target", async () => {
    const fixture = await createFixture();
    const continuation = await createContinuation(fixture);
    await fixture.prisma.frameStoryState.create({
      data: { frameId: continuation.predecessor.id, document: JSON.stringify(state(fixture.sceneId, "predecessor-target-not-baseline")), originType: "EXPLICIT" }
    });
    const latestPath = "generations/latest.png";
    await writePng(path.join(fixture.directory, latestPath), 0x22);
    const latest = await createGeneration(fixture, continuation.predecessor.id, latestPath, "latest-snapshot");

    const preparation = await prepareManualChatGPTExport(continuation.frame.id);
    const exported = await createChatGPTExport(continuation.frame.id);
    const entries = unzipSync(exported.buffer);
    const receipt = await readReceipt(fixture.directory, exported.exportId);
    const baseName = exported.manifest.base?.filename;
    expect(exported.manifest.base).toMatchObject({ generationId: continuation.selected.id });
    expect(exported.manifest.base?.generationId).not.toBe(latest.id);
    expect(baseName).toBeTruthy();
    expect(Buffer.from(entries[`S001_F002_CHATGPT/${baseName}`]!)).toEqual(pngBytes(0x11));
    expect(receipt.bearridgeMetadata.selectedPredecessorGenerationId).toBe(continuation.selected.id);
    expect(receipt.storyStateSnapshot).toMatchObject({ environment: { marker: "target" } });
    expect(receipt.fullTargetPrompt).toContain("marker: target");
    expect(preparation.target.context.previousStoryState).toMatchObject({ environment: { marker: "selected-baseline" } });
    expect(preparation.preview.detectedContinuityChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "environment", previousValue: "selected-baseline", currentValue: "target" })
    ]));
    expect(receipt.fullTargetPrompt).not.toContain("latest-snapshot");
    expect(receipt.fullTargetPrompt).not.toContain("predecessor-target-not-baseline");
    expect(exported.prompt).not.toContain(receipt.fullTargetPrompt);
    expect(exported.manifest.references).toEqual([]);
  });

  it.each([true, false])("exports exactly the saved Webster pose/position diff (changed=%s)", async changed => {
    const fixture = await createFixture();
    const { frame, predecessor, selected } = await createContinuation(fixture);
    const webster = await fixture.prisma.character.create({ data: { projectId: fixture.project.id, name: "Webster", slug: "webster", status: "LOCKED" } });
    const identity = await fixture.prisma.characterReference.create({ data: { characterId: webster.id, type: "MASTER", version: 1, code: "WEBSTER_MASTER_V1", filePath: "generations/selected.png", status: "LOCKED", isCanonical: true } });
    await fixture.prisma.character.update({ where: { id: webster.id }, data: { masterReferenceId: identity.id } });
    const outfit = await fixture.prisma.outfit.create({ data: { characterId: webster.id, name: "Suit", slug: "suit", status: "LOCKED" } });
    const outfitRef = await fixture.prisma.outfitReference.create({ data: { outfitId: outfit.id, type: "MASTER", version: 1, code: "WEBSTER_SUIT_V1", filePath: "generations/selected.png", status: "LOCKED", isCanonical: true } });
    await fixture.prisma.outfit.update({ where: { id: outfit.id }, data: { masterReferenceId: outfitRef.id } });
    for (const id of [predecessor.id, frame.id]) await fixture.prisma.frameCharacter.create({ data: { frameId: id, characterId: webster.id, order: 1 } });
    const baseline = { ...state(fixture.sceneId, "same"), characters: { [webster.id]: { present: true, outfitId: outfit.id, pose: "Sitting on the sofa.", locationPosition: "At the centre of the sofa.", emotion: "calm", heldProps: ["Key"] } } };
    await fixture.prisma.generation.update({ where: { id: selected.id }, data: { storyStateSnapshot: JSON.stringify(baseline) } });
    await fixture.prisma.frameStoryState.create({ data: { frameId: predecessor.id, document: JSON.stringify({ ...baseline, time: { description: "WRONG MUTABLE TARGET" } }), originType: "EXPLICIT" } });
    await fixture.prisma.frameStoryState.update({ where: { frameId: frame.id }, data: { document: JSON.stringify(baseline) } });
    const pose = "Standing upright just inside the room, arms relaxed at his sides, facing Birdman.";
    const position = "Just inside the office lounge, near the left end of the brown sofa, a short distance from the open doorway.";
    const target = structuredClone(baseline);
    if (changed) { target.characters[webster.id]!.pose = pose; target.characters[webster.id]!.locationPosition = position; }
    const saved = await new FrameStoryStateService(fixture.prisma).updateFrameTargetStoryState(frame.id, target, 1);
    expect(saved.revision).toBe(changed ? 2 : 1);
    const historicalBefore = await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } });
    const frameBefore = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } });
    const exported = await createChatGPTExport(frame.id);
    const entries = unzipSync(exported.buffer);
    const zipPrompt = strFromU8(entries["S001_F002_CHATGPT/01_CHATGPT_PROMPT.txt"]!);
    const zipManifest = JSON.parse(strFromU8(entries["S001_F002_CHATGPT/manifest.json"]!)) as { continuityEditContract: { changes: string[]; allowedChanges: string[]; forbidden: string[] } };
    const contract = zipManifest.continuityEditContract;
    expect(contract).toEqual(exported.manifest.continuityEditContract);
    expect(contract.changes).toHaveLength(changed ? 2 : 0);
    const changeOnly = zipPrompt.split("## CHANGE ONLY\n")[1]!.split("\n## DECLARED PROP CONTEXT")[0]!;
    if (changed) {
      expect(contract.changes.filter(line => line.includes(": pose:"))).toHaveLength(1);
      expect(contract.changes.filter(line => line.includes(": position:"))).toHaveLength(1);
      expect(changeOnly).toContain(pose); expect(changeOnly).toContain(position);
      expect(contract.allowedChanges).toEqual(["character.position", "character.pose"]);
      expect(changeOnly).not.toContain("None specified.");
    } else { expect(changeOnly.trim()).toBe("- None specified."); expect(contract.allowedChanges).toEqual([]); }
    expect(changeOnly).not.toContain("calm"); expect(changeOnly).not.toContain("Key"); expect(zipPrompt).not.toContain("WRONG MUTABLE TARGET");
    expect(zipPrompt).toContain("Everything not explicitly listed under CHANGE ONLY must remain visually unchanged.");
    expect(zipManifest.continuityEditContract.forbidden).toEqual([]);
    expect(exported.manifest.base?.generationId).toBe(selected.id);
    expect(await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } })).toEqual(historicalBefore);
    expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).toEqual(frameBefore);
    const receipt = JSON.parse(await fs.readFile(path.join(fixture.directory, "exports", "chatgpt", `${exported.exportId}.json`), "utf8")) as { manifest: { continuityEditContract: unknown } };
    expect(receipt.manifest.continuityEditContract).toEqual(contract);
  });

  it.each(["revision", "document", "selection", "base"] as const)("rejects stale %s without publishing a receipt", async (kind) => {
    const fixture = await createFixture();
    const continuation = await createContinuation(fixture);
    const dependencies: ChatGPTExportDependencies = {
      async prepare(frameId) {
        const prepared = await prepareManualChatGPTExport(frameId);
        return {
          ...prepared,
          async revalidate() {
            if (kind === "revision") {
              await fixture.prisma.frameStoryState.update({ where: { frameId }, data: { revision: { increment: 1 } } });
            } else if (kind === "document") {
              await fixture.prisma.frameStoryState.update({ where: { frameId }, data: { document: JSON.stringify(state(fixture.sceneId, "changed-without-revision")) } });
            } else if (kind === "selection") {
              const otherPath = "generations/other.png";
              await writePng(path.join(fixture.directory, otherPath), 0x33);
              const other = await createGeneration(fixture, continuation.predecessor.id, otherPath, "other");
              await fixture.prisma.frame.update({ where: { id: continuation.predecessor.id }, data: { selectedGenerationId: other.id } });
            } else {
              await fs.rm(path.join(fixture.directory, continuation.selected.outputFilePath!));
            }
            await prepared.revalidate();
          }
        };
      }
    };

    await expect(createChatGPTExport(continuation.frame.id, new Date(), dependencies)).rejects.toMatchObject({
      code: "CHATGPT_EXPORT_READINESS_STALE",
      reasons: expect.arrayContaining(["GENERATION_READINESS_STALE"])
    });
    expect(await receiptNames(fixture.directory)).toEqual([]);
  });
});

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-export-target-"));
  temporaryDirectories.push(directory);
  const context = await projectDbManager.createProject({ name: `Export target ${path.basename(directory)}`, rootPath: directory });
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

async function createTarget(fixture: Awaited<ReturnType<typeof createFixture>>, frameId: string, marker: string) {
  return fixture.prisma.frameStoryState.create({
    data: { frameId, document: JSON.stringify(state(fixture.sceneId, marker)), originType: "EXPLICIT" }
  });
}

async function createGeneration(fixture: Awaited<ReturnType<typeof createFixture>>, frameId: string, outputFilePath: string, marker: string) {
  return fixture.prisma.generation.create({
    data: {
      frameId,
      provider: "test",
      model: "test",
      prompt: "test",
      status: "SUCCESS",
      outputFilePath,
      resolution: "1K",
      aspectRatio: "16:9",
      storyStateSnapshot: JSON.stringify(state(fixture.sceneId, marker)),
      frameSnapshot: "{}"
    }
  });
}

async function createContinuation(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const predecessor = await createFrame(fixture, 1, "NEW_COMPOSITION", null, "LOCKED");
  const selectedPath = "generations/selected.png";
  await writePng(path.join(fixture.directory, selectedPath), 0x11);
  const selected = await createGeneration(fixture, predecessor.id, selectedPath, "selected-baseline");
  await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
  const frame = await createFrame(fixture, 2, "CONTINUE_PREVIOUS_FRAME", predecessor.id);
  await createTarget(fixture, frame.id, "target");
  return { predecessor, selected, frame };
}

async function readReceipt(projectPath: string, exportId: string) {
  return JSON.parse(await fs.readFile(path.join(projectPath, "exports", "chatgpt", `${exportId}.json`), "utf8")) as {
    fullTargetPrompt: string;
    storyStateSnapshot: { environment: { marker: string } };
    bearridgeMetadata: {
      targetStoryState: { revision: number; fingerprint: string; provenance: { origin: string } };
      selectedPredecessorGenerationId: string | null;
    };
  };
}

async function receiptNames(projectPath: string): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(projectPath, "exports", "chatgpt"))).filter((name) => name.endsWith(".json") || name.endsWith(".tmp"));
  } catch {
    return [];
  }
}

async function writePng(filePath: string, marker: number) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, pngBytes(marker));
}

function pngBytes(marker: number) {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, marker]);
}

function state(sceneId: string, marker: string) {
  return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [] };
}
