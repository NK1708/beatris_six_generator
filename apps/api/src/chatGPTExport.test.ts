import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  previewFrame: vi.fn(),
  generationCreate: vi.fn(),
  providerGenerate: vi.fn(),
  providerEdit: vi.fn(),
  projectPath: ""
}));

vi.mock("./services/generationService.js", () => ({ previewFrameContext: mocks.previewFrame }));
vi.mock("./db.js", () => ({
  projectDbManager: {
    acquireActiveProject: () => ({
      projectPath: mocks.projectPath,
      prisma: { generation: { create: mocks.generationCreate } },
      release: vi.fn()
    })
  }
}));
vi.mock("./providers/providerFactory.js", () => ({
  createImageProvider: () => ({ generate: mocks.providerGenerate, edit: mocks.providerEdit })
}));

import { createChatGPTExport, type ChatGPTExportDependencies } from "./services/chatGPTExportService.js";

function exportDependencies(): ChatGPTExportDependencies {
  return {
    async prepare(frameId: string) {
      const preview = await mocks.previewFrame(frameId);
      const storyState = preview.context.storyState ?? { time: "", characters: {}, environment: {}, props: {}, storyFacts: [] };
      return {
        preview,
        readiness: {
          status: "READY",
          frameId,
          strategy: preview.strategy,
          targetRevision: 1,
          targetFingerprint: JSON.stringify(storyState),
          selectedPredecessorGenerationId: preview.context.previousLockedFrame?.generationId
        },
        target: {
          context: preview.context,
          targetStoryState: storyState,
          targetRevision: 1,
          targetFingerprint: JSON.stringify(storyState),
          targetProvenance: { origin: "EXPLICIT" },
          selectedPredecessorGenerationId: preview.context.previousLockedFrame?.generationId
        },
        async revalidate() {}
      };
    }
  } as unknown as ChatGPTExportDependencies;
}

describe("ChatGPT export", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-chatgpt-export-"));
    await fs.mkdir(path.join(mocks.projectPath, "references"), { recursive: true });
    await fs.writeFile(path.join(mocks.projectPath, "references", "character.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(mocks.projectPath, "references", "character-profile.png"), Buffer.from([7, 8, 9]));
    await fs.writeFile(path.join(mocks.projectPath, "references", "style.webp"), Buffer.from([4, 5, 6]));
    await fs.writeFile(path.join(mocks.projectPath, "references", "outfit.png"), Buffer.from([10]));
    await fs.writeFile(path.join(mocks.projectPath, "references", "location.png"), Buffer.from([11]));
    await fs.writeFile(path.join(mocks.projectPath, "references", "angle.png"), Buffer.from([12]));
  });

  it("packages the prepared production prompt, ordered references and geometry without generation side effects", async () => {
    const originalPrompt = "PROJECT:\nTest Project\n\nFRAME:\nS001_F001\n\nPRESERVE EVERYTHING.";
    mocks.previewFrame.mockResolvedValue({
      strategy: "NEW_COMPOSITION",
      prompt: originalPrompt,
      warnings: [],
      references: [
        {
          id: "character-reference-id",
          code: "CHAR_HERO_MASTER_V1",
          kind: "character",
          filePath: "references/character.png",
          status: "LOCKED",
          priority: 10,
          label: "Character: Hero / MASTER V1",
          role: "Canonical identity reference for Hero."
        },
        {
          id: "character-profile-reference-id",
          code: "CHAR_HERO_PROFILE_LEFT_V1",
          kind: "character",
          filePath: "references/character-profile.png",
          status: "LOCKED",
          priority: 11,
          label: "Character: Hero / PROFILE_LEFT / CHAR_HERO_PROFILE_LEFT_V1",
          role: "Additional canonical left-profile reference for Hero. This supplements the MASTER and must not redesign the character."
        },
        {
          id: "style-reference-id",
          code: "STYLE_FLAT_REF_V1",
          kind: "style",
          filePath: "references/style.webp",
          status: "LOCKED",
          priority: 40,
          label: "Style: Flat / REF V1",
          role: "Canonical visual style guidance. Use for style consistency only, not as source of scene content."
        }
      ],
      geometry: {
        requestedAspectRatio: "16:9",
        requestedResolution: "1536x864",
        requestedImageSize: "1K",
        targetAspectRatio: 16 / 9,
        requiresCrop: false,
        cropStrategy: "NONE",
        aspectRatioDifference: 0
      },
      context: {
        project: { id: "project-id", name: "Test Project" },
        frame: { id: "frame-id", frameCode: "S001_F001", targetWidth: 1200, targetHeight: 675 }
      }
    });

    const result = await createChatGPTExport("frame-id", new Date("2026-09-22T12:00:00.000Z"), exportDependencies());
    const entries = unzipSync(result.buffer);
    const promptPath = "S001_F001_CHATGPT/01_CHATGPT_PROMPT.txt";
    const manifestPath = "S001_F001_CHATGPT/manifest.json";
    const prompt = strFromU8(entries[promptPath]!);
    const manifestText = strFromU8(entries[manifestPath]!);
    const manifest = JSON.parse(manifestText) as { exportId: string; references: Array<{ code: string; kind: string; role: string; filename: string }> };
    const header = prompt.slice(0, prompt.indexOf("# ORIGINAL BEARRIDGE PRODUCTION PROMPT"));

    expect(result.fileName).toBe("S001_F001_CHATGPT.zip");
    expect(manifest.exportId).toBe(result.exportId);
    await expect(fs.access(path.join(mocks.projectPath, "exports", "chatgpt", `${result.exportId}.json`))).resolves.toBeUndefined();
    expect(Object.keys(entries)).toEqual([
      "S001_F001_CHATGPT/00_README.txt",
      promptPath,
      "S001_F001_CHATGPT/CHATGPT_INSTRUCTIONS.md",
      manifestPath,
      "S001_F001_CHATGPT/02_CHARACTER_REFERENCE_HERO_MASTER_V1.png",
      "S001_F001_CHATGPT/03_CHARACTER_REFERENCE_HERO_PROFILE_LEFT.png",
      "S001_F001_CHATGPT/04_STYLE_REFERENCE_FLAT_REF_V1.webp",
      "S001_F001_CHATGPT/receipt.json"
    ]);
    expect(prompt.endsWith(originalPrompt)).toBe(true);
    expect(prompt.startsWith("BEARRIDGE PORTABLE RENDER REQUEST\n\nMODE: NEW_COMPOSITION\nREQUIRES_CONVERSATION_CONTEXT: FALSE")).toBe(true);
    expect(prompt).not.toContain("AUTHORITATIVE_BASE");
    expect(prompt).toContain("02_CHARACTER_REFERENCE_HERO_MASTER_V1.png\nROLE: CHARACTER_REFERENCE");
    expect(strFromU8(entries["S001_F001_CHATGPT/00_README.txt"]!)).toContain("Do NOT upload the ZIP itself.");
    expect(strFromU8(entries["S001_F001_CHATGPT/CHATGPT_INSTRUCTIONS.md"]!)).toContain("01_CHATGPT_PROMPT.txt MUST BE USED AS WRITTEN.");
    expect(result.manifest.renderProtocol).toEqual({
      version: 1,
      promptPolicy: "verbatim",
      basePolicy: "none",
      referencePolicy: "canonical-visual-guidance",
      allowPromptRewrite: false,
      allowSceneReinterpretation: false
    });
    expect(prompt).not.toContain("CONTINUITY EDIT CONTRACT");
    expect(manifest.references.map((reference) => reference.code)).toEqual(["CHAR_HERO_MASTER_V1", "CHAR_HERO_PROFILE_LEFT_V1", "STYLE_FLAT_REF_V1"]);
    expect(manifest.references.map((reference) => reference.kind)).toEqual(["character", "character", "style"]);
    expect(manifest.references[1]?.role).toContain("supplements the MASTER");
    expect(manifest.references[2]?.role).toContain("not as source of scene content");
    expect(Buffer.from(entries["S001_F001_CHATGPT/02_CHARACTER_REFERENCE_HERO_MASTER_V1.png"]!)).toEqual(Buffer.from([1, 2, 3]));
    expect(Buffer.from(entries["S001_F001_CHATGPT/03_CHARACTER_REFERENCE_HERO_PROFILE_LEFT.png"]!)).toEqual(Buffer.from([7, 8, 9]));
    expect(Buffer.from(entries["S001_F001_CHATGPT/04_STYLE_REFERENCE_FLAT_REF_V1.webp"]!)).toEqual(Buffer.from([4, 5, 6]));
    expect(result.manifest).toMatchObject({ packageType: "CHATGPT_PORTABLE_RENDER", packageVersion: 1, uploadMode: "INDIVIDUAL_ATTACHMENTS", requiresConversationContext: false });
    expect(result.manifest.attachments.map((attachment) => attachment.role)).toEqual(["CHARACTER_REFERENCE", "CHARACTER_REFERENCE", "STYLE_REFERENCE"]);
    expect(mocks.previewFrame).toHaveBeenCalledWith("frame-id");
    expect(mocks.generationCreate).not.toHaveBeenCalled();
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
    expect(mocks.providerEdit).not.toHaveBeenCalled();
    expect(`${header}\n${manifestText}`).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|data:image|base64,/u);
    expect(manifestText).not.toContain(mocks.projectPath);
  });

  it("packages continuation base separately from the shared supporting references", async () => {
    await fs.mkdir(path.join(mocks.projectPath, "generations", "S001_F001"), { recursive: true });
    await fs.writeFile(path.join(mocks.projectPath, "generations", "S001_F001", "base.png"), Buffer.from([9, 9, 9]));
    mocks.previewFrame.mockResolvedValue({
      strategy: "CONTINUE_PREVIOUS_FRAME",
      prompt: "FULL TARGET",
      deltaInstructions: "MOVE HERO ONLY",
      detectedContinuityChanges: [
        { category: "character.position", entityId: "hero", label: "Hero: position", previousValue: "sofa", currentValue: "coffee maker" },
        { category: "character.pose", entityId: "hero", label: "Hero: pose", previousValue: "seated", currentValue: "standing" }
      ],
      allowedContinuityChanges: ["character.position", "character.pose", "camera"],
      warnings: [],
      baseReference: { id: "frame-1", code: "S001_F001", kind: "previous-frame", filePath: "generations/S001_F001/base.png", status: "LOCKED", priority: 60 },
      references: [
        { id: "character-reference-id", code: "CHAR_HERO_MASTER_V1", kind: "character", filePath: "references/character.png", status: "LOCKED", priority: 10 },
        { id: "duplicate-full-body-id", code: "CHAR_HERO_FULL_BODY_FRONT_V1", kind: "character", filePath: "references/character.png", status: "LOCKED", priority: 11 },
        { id: "profile-id", code: "CHAR_HERO_PROFILE_LEFT_V1", kind: "character", filePath: "references/character-profile.png", status: "LOCKED", priority: 12 },
        { id: "outfit-id", code: "OUTFIT_MASTER_V1", kind: "outfit", filePath: "references/outfit.png", status: "LOCKED", priority: 20 },
        { id: "location-id", code: "LOCATION_MASTER_V1", kind: "location", filePath: "references/location.png", status: "LOCKED", priority: 30 },
        { id: "angle-id", code: "LOCATION_ANGLE_VIEW_V1", kind: "location-angle", filePath: "references/angle.png", status: "LOCKED", priority: 35 },
        { id: "style-id", code: "STYLE_REF_V1", kind: "style", filePath: "references/style.webp", status: "LOCKED", priority: 40 }
      ],
      geometry: { requestedAspectRatio: "16:9", requestedResolution: "1536x864", requestedImageSize: "1K", targetAspectRatio: 16 / 9, requiresCrop: false, cropStrategy: "NONE", aspectRatioDifference: 0 },
      context: {
        project: { id: "project-id", name: "Test Project" },
        frame: {
          id: "frame-2", frameCode: "S001_F002", targetWidth: 1200, targetHeight: 675,
          characterIds: ["hero"],
          continuityEditContract: {
            changes: ["Hero moves beside the coffee maker"],
            forbidden: ["Do not add props"],
            allowedChanges: ["camera"]
          }
        },
        scene: { characterIds: ["hero"] },
        continuityBaseline: { status: "UNAVAILABLE", reason: "NOT_LOCKED" },
        storyState: { sceneId: "scene", time: { description: "Morning" }, environment: {}, storyFacts: [], characters: { hero: { present: true, outfitId: "outfit", heldProps: ["Key"] } }, props: { Key: { holderCharacterId: "hero", location: "shelf" } } },
        characters: [{
          id: "hero",
          name: "Hero",
          description: "A recognizable middle-aged man.",
          bodyDescription: "Tall and broad-shouldered.",
          faceDescription: "Rectangular glasses and thick moustache.",
          hairDescription: "Short black side-parted hair.",
          immutableFeatures: "NO VISIBLE EYES. Do not draw pupils or eye whites.",
          references: [{ id: "character-reference-id" }, { id: "duplicate-full-body-id" }, { id: "profile-id" }],
          outfits: [{ id: "outfit", name: "Black Overcoat", description: "Long black overcoat.", immutableFeatures: "Do not redesign or replace the outfit." }]
        }],
        location: { name: "Office Lounge", architectureDescription: "Fixed room geometry.", immutableFeatures: "Furniture remains fixed." },
        styleProfile: { name: "Minimal Flat", description: "Flat graphic rendering.", linework: "Simple lines.", anatomy: "Simplified anatomy.", faces: "Minimal faces.", shading: "Flat shadows.", negativeRules: "NO VISIBLE EYES." },
        previousLockedFrame: { id: "frame-1", frameCode: "S001_F001", generationId: "generation-1", outputFilePath: "generations/S001_F001/base.png" }
      }
    });

    const result = await createChatGPTExport("frame-2", new Date(), exportDependencies());
    const entries = unzipSync(result.buffer);
    const names = Object.keys(entries);
    const manifest = result.manifest;

    expect(names).toContain("S001_F002_CHATGPT/02_AUTHORITATIVE_BASE_S001_F001.png");
    expect(names).toContain("S001_F002_CHATGPT/CHATGPT_INSTRUCTIONS.md");
    expect(names).toContain("S001_F002_CHATGPT/03_IDENTITY_REFERENCE_CHAR_HERO_MASTER_V1.png");
    expect(names).toContain("S001_F002_CHATGPT/04_IDENTITY_REFERENCE_CHAR_HERO_PROFILE_LEFT_V1.png");
    expect(names.filter((name) => name.includes("IDENTITY_REFERENCE"))).toHaveLength(2);
    expect(manifest.base).toMatchObject({ frameId: "frame-1", generationId: "generation-1" });
    expect(result.prompt).toContain('Holder association: "Hero" [Character ID: "hero"]');
    expect(result.prompt).toContain('Recorded location: "shelf"');
    expect(result.prompt).toContain('Recorded heldProps for "Hero" [Character ID: "hero"]: ["Key"]');
    expect(result.prompt).toContain("It does not authorize edits outside CHANGE ONLY");
    expect(manifest.exportPolicy).toBe("CHATGPT_CONTINUATION_V2");
    expect(manifest.consumer).toBe("chatgpt-manual");
    expect(manifest.requestedAction).toBe("render");
    expect(manifest.renderProtocol).toEqual({
      version: 1,
      promptPolicy: "verbatim",
      basePolicy: "authoritative",
      referencePolicy: "identity-only",
      allowPromptRewrite: false,
      allowSceneReinterpretation: false
    });
    expect(manifest.references.map((reference) => reference.code)).toEqual(["CHAR_HERO_MASTER_V1", "CHAR_HERO_PROFILE_LEFT_V1"]);
    expect(manifest.visualReferencesActuallyExported).toEqual(["character-reference-id", "profile-id"]);
    expect(manifest.attachments).toEqual([
      expect.objectContaining({ fileName: "02_AUTHORITATIVE_BASE_S001_F001.png", role: "AUTHORITATIVE_BASE", assetId: "generation-1" }),
      expect.objectContaining({ fileName: "03_IDENTITY_REFERENCE_CHAR_HERO_MASTER_V1.png", role: "IDENTITY_REFERENCE", assetId: "character-reference-id", subjectId: "hero", subjectName: "Hero" }),
      expect.objectContaining({ fileName: "04_IDENTITY_REFERENCE_CHAR_HERO_PROFILE_LEFT_V1.png", role: "IDENTITY_REFERENCE", assetId: "profile-id", subjectId: "hero", subjectName: "Hero" })
    ]);
    expect(manifest.productionReferenceIds).toEqual(["character-reference-id", "duplicate-full-body-id", "profile-id", "outfit-id", "location-id", "angle-id", "style-id"]);
    expect(manifest.canonicalConstraints?.characters[0]?.immutableFeatures).toContain("NO VISIBLE EYES");
    expect(result.prompt).toContain("# CONTINUATION EDIT");
    expect(result.prompt.startsWith("BEARRIDGE PORTABLE RENDER REQUEST\n\nMODE: CONTINUE_PREVIOUS_FRAME\nREQUIRES_CONVERSATION_CONTEXT: FALSE")).toBe(true);
    expect(result.prompt).toContain("02_AUTHORITATIVE_BASE_S001_F001.png\nROLE: AUTHORITATIVE_BASE");
    expect(result.prompt).toContain("03_IDENTITY_REFERENCE_CHAR_HERO_MASTER_V1.png\nROLE: IDENTITY_REFERENCE");
    const instructions = strFromU8(entries["S001_F002_CHATGPT/CHATGPT_INSTRUCTIONS.md"]!);
    expect(instructions).toContain("filename contains AUTHORITATIVE_BASE");
    expect(instructions).toContain("01_CHATGPT_PROMPT.txt MUST BE USED AS WRITTEN.");
    expect(result.prompt).toContain("## BASE IMAGE");
    expect(result.prompt).toContain("## VISUAL IDENTITY REFERENCES");
    expect(result.prompt).toContain("## CANONICAL CONSTRAINTS");
    expect(result.prompt).toContain("MATCH THE BASE IMAGE'S ABSTRACTION LEVEL.");
    expect(result.prompt).toContain("Do not make the image brighter, darker, more saturated, more realistic, or more dimensional unless explicitly allowed.");
    expect(result.prompt).toContain("- Hero moves beside the coffee maker");
    expect(result.prompt).toContain("## ALLOWED CHANGE CATEGORIES");
    expect(result.prompt).toContain("- character.position");
    expect(result.prompt).toContain("- character.pose");
    expect(result.prompt).toContain("- camera");
    expect(result.prompt).toContain("- Do not add props");
    expect(result.prompt).toContain("NO VISIBLE EYES");
    expect(result.prompt).toContain("Black Overcoat");
    expect(result.prompt).toContain("Office Lounge");
    expect(result.prompt).toContain("Minimal Flat");
    expect(result.prompt).not.toContain("FULL TARGET");
    expect(result.prompt).not.toContain("MOVE HERO ONLY");
    expect(names.filter((name) => /\.(png|jpe?g|webp)$/iu.test(name)).some((name) => /outfit|location|angle|style/iu.test(name))).toBe(false);

    const receipt = JSON.parse(await fs.readFile(path.join(mocks.projectPath, "exports", "chatgpt", `${result.exportId}.json`), "utf8")) as {
      fullTargetPrompt: string;
      renderProtocol: { version: number; basePolicy: string; referencePolicy: string };
      supportingReferences: Array<{ id: string }>;
      visualReferencesActuallyExported: string[];
    };
    expect(receipt.fullTargetPrompt).toBe("FULL TARGET");
    expect(receipt.renderProtocol).toMatchObject({ version: 1, basePolicy: "authoritative", referencePolicy: "identity-only" });
    expect(receipt.supportingReferences.map((reference) => reference.id)).toEqual(manifest.productionReferenceIds);
    expect(receipt.visualReferencesActuallyExported).toEqual(manifest.visualReferencesActuallyExported);
  });

  it("rejects continuation export without an authoritative locked base and never falls back", async () => {
    mocks.previewFrame.mockResolvedValue({
      strategy: "CONTINUE_PREVIOUS_FRAME",
      prompt: "FULL TARGET",
      allowedContinuityChanges: [],
      warnings: [],
      references: [],
      geometry: { requestedAspectRatio: "16:9", requestedResolution: "1536x864", targetAspectRatio: 16 / 9, requiresCrop: false, cropStrategy: "NONE" },
      context: {
        project: { id: "project-id", name: "Test Project" },
        frame: { id: "frame-2", frameCode: "S001_F002", characterIds: [], targetWidth: 1200, targetHeight: 675, continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] } },
        storyState: { characters: {} },
        characters: [],
        location: null,
        styleProfile: null
      }
    });

    await expect(createChatGPTExport("frame-2", new Date(), exportDependencies())).rejects.toMatchObject({ code: "INVALID_CONTINUATION_BASE" });
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
    expect(mocks.providerEdit).not.toHaveBeenCalled();
  });
});
