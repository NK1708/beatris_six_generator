import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectDbManager } from "./db.js";
import { MockImageProvider } from "./providers/mockImageProvider.js";
import { createFrameWithTargetStoryState } from "./services/frameCreationService.js";
import { generateFrame, type GenerationServiceDependencies } from "./services/generationService.js";
import { resolveFrameGenerationReadinessForProject } from "./services/frameGenerationReadinessService.js";
import { lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";
import { FrameStoryStateService } from "./services/frameStoryStateService.js";
import { loadFrameContext } from "./services/contextService.js";
import { lockReferenceAsCanonical, setReferenceStatus, uploadReferenceVersion } from "./services/referenceService.js";

const roots: string[] = [];
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

afterEach(async () => {
  await projectDbManager.closeProject();
  expect(projectDbManager.getContextLifecycleSnapshot()).toEqual([]);
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Final E2E "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

describe("final production lifecycle", () => {
  it("persists an eight-frame cast/target/generation/review/lock/continuation sequence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-final-e2e-"));
    roots.push(root);
    const project = await projectDbManager.createProject({ name: `Final E2E ${path.basename(root)}`, rootPath: root });
    const birdman = await project.prisma.character.create({ data: { projectId: project.project.id, name: "Birdman", slug: "birdman" } });
    const webster = await project.prisma.character.create({ data: { projectId: project.project.id, name: "Webster", slug: "webster" } });
    const birdmanOutfit = await project.prisma.outfit.create({ data: { characterId: birdman.id, name: "Birdman Outfit", slug: "birdman-outfit" } });
    const websterOutfit = await project.prisma.outfit.create({ data: { characterId: webster.id, name: "Webster Outfit", slug: "webster-outfit" } });
    const location = await project.prisma.location.create({ data: { projectId: project.project.id, name: "Office Lounge", slug: "office-lounge" } });
    const style = await project.prisma.styleProfile.create({ data: { projectId: project.project.id, name: "Minimal 2D", slug: "minimal-2d", description: "flat colors", negativeRules: "no glow; no photorealism; featureless faces" } });
    await Promise.all([
      uploadAndLock(project.prisma, root, "character", birdman.id, "MASTER", "birdman.png"),
      uploadAndLock(project.prisma, root, "character", webster.id, "MASTER", "webster.png"),
      uploadAndLock(project.prisma, root, "outfit", birdmanOutfit.id, "MASTER", "birdman-outfit.png"),
      uploadAndLock(project.prisma, root, "outfit", websterOutfit.id, "MASTER", "webster-outfit.png"),
      uploadAndLock(project.prisma, root, "location", location.id, "MASTER", "lounge.png"),
      uploadAndLock(project.prisma, root, "style", style.id, "REF", "style.png")
    ]);
    const scene = await project.prisma.scene.create({ data: { projectId: project.project.id, sequence: 1, name: "Waiting in the Office Lounge", locationId: location.id, styleProfileId: style.id } });
    await project.prisma.sceneCharacter.createMany({ data: [
      { sceneId: scene.id, characterId: birdman.id, order: 1 },
      { sceneId: scene.id, characterId: webster.id, order: 2 }
    ] });
    const initialState = state(scene.id, birdman.id, webster.id, birdmanOutfit.id, websterOutfit.id, "closed", "coffee table");
    await project.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(initialState) } });

    const specs: Array<{ ids?: string[]; strategy?: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME" }> = [
      { ids: [birdman.id, webster.id] },
      {},
      { ids: [birdman.id] },
      { ids: [] },
      { ids: [birdman.id] },
      { ids: [birdman.id] },
      { ids: [birdman.id, webster.id] },
      { strategy: "CONTINUE_PREVIOUS_FRAME" }
    ];
    const frames = [];
    const generations = [];
    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index]!;
      const created = await createFrameWithTargetStoryState(project.prisma, {
        sceneId: scene.id,
        ...(spec.ids === undefined ? {} : { characterIds: spec.ids }),
        type: "CG",
        generationStrategy: spec.strategy ?? "NEW_COMPOSITION",
        continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
        description: "",
        action: `Frame ${index + 1}`,
        camera: "",
        composition: "",
        lighting: "",
        expressionNotes: "",
        continuityNotes: ""
      });
      if (index === 5) {
        const target = await new FrameStoryStateService(project.prisma).getFrameTargetStoryState(created.frame.id);
        if (target.status !== "AVAILABLE") throw new Error("Expected persisted F006 target.");
        await new FrameStoryStateService(project.prisma).updateFrameTargetStoryState(
          created.frame.id,
          state(scene.id, birdman.id, webster.id, birdmanOutfit.id, websterOutfit.id, "open", "doorway"),
          target.revision
        );
      }
      const generation = await generateFrame(created.frame.id, "production", "INITIAL", dependencies());
      if (!generation) throw new Error("Expected successful mock generation.");
      await selectGenerationForFrame(project.prisma, created.frame.id, generation.id);
      await lockFrameWithSelectedGeneration(project.prisma, root, created.frame.id);
      frames.push(created.frame);
      generations.push(generation);
    }

    expect(frames.map((frame) => frame.characterCastSource)).toEqual([
      "EXPLICIT", "INHERITED_PREVIOUS", "EXPLICIT", "EXPLICIT", "EXPLICIT", "EXPLICIT", "EXPLICIT", "INHERITED_PREVIOUS"
    ]);
    expect(frames[1]!.characters.map((item) => item.characterId)).toEqual([birdman.id, webster.id]);
    expect(frames[3]!.characters).toEqual([]);
    const emptyContext = await loadFrameContext(frames[3]!.id, projectDbManager.getActiveProject());
    expect(emptyContext.frame.effectiveCharacterIds).toEqual([]);
    expect(generations[3]!.prompt).toContain("CHARACTERS:\nNone");
    expect(generations[3]!.prompt).toContain("No character canon selected.");
    const emptyReferences = await project.prisma.generationReference.findMany({ where: { generationId: generations[3]!.id } });
    expect(emptyReferences.some((reference) => ["character", "outfit"].includes(reference.referenceKind))).toBe(false);
    expect(emptyReferences.map((reference) => reference.referenceKind)).toEqual(expect.arrayContaining(["location", "style"]));
    expect(JSON.parse(generations[5]!.storyStateSnapshot)).toMatchObject({ environment: { door: "open" }, characters: { [birdman.id]: { locationPosition: "doorway" } } });
    expect(generations[7]).toMatchObject({ generationType: "EDIT", parentGenerationId: generations[6]!.id });
    expect((await project.prisma.frame.findMany({ orderBy: { sequence: "asc" } })).every((frame) => frame.status === "LOCKED")).toBe(true);

    await projectDbManager.closeProject();
    const reopened = await projectDbManager.openProject({ projectPath: root });
    expect(await reopened.prisma.frame.count()).toBe(8);
    expect(await reopened.prisma.generation.count({ where: { status: "SUCCESS" } })).toBe(8);
    expect((await reopened.prisma.frame.findUniqueOrThrow({ where: { id: frames[7]!.id } })).selectedGenerationId).toBe(generations[7]!.id);
    await expect(fs.access(path.join(root, generations[7]!.outputFilePath))).resolves.toBeUndefined();
  }, 30_000);
});

function dependencies(): GenerationServiceDependencies {
  return {
    createProvider: ({ model, outputFilePath, rootPath }) => new MockImageProvider(model, outputFilePath, rootPath),
    resolveReadiness: resolveFrameGenerationReadinessForProject
  };
}

async function uploadAndLock(prisma: Parameters<typeof uploadReferenceVersion>[0], root: string, ownerType: "character" | "outfit" | "location" | "style", ownerId: string, type: string, fileName: string) {
  const reference = await uploadReferenceVersion(prisma, root, ownerType, ownerId, { type, fileName, dataUrl: tinyPng, description: "E2E fixture" });
  await setReferenceStatus(prisma, ownerType, reference.id, "APPROVED");
  return lockReferenceAsCanonical(prisma, ownerType, reference.id);
}

function state(sceneId: string, birdmanId: string, websterId: string, birdmanOutfitId: string, websterOutfitId: string, door: string, birdmanPosition: string) {
  return {
    sceneId,
    time: { description: "day" },
    environment: { door },
    characters: {
      [birdmanId]: { present: true, outfitId: birdmanOutfitId, locationPosition: birdmanPosition, pose: "standing" },
      [websterId]: { present: true, outfitId: websterOutfitId, locationPosition: "sofa", pose: "sitting" }
    },
    props: { folder: { location: "coffee table" } },
    storyFacts: []
  };
}
