import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ReferenceResolver } from "@bearridge/core";
import { describe, expect, it } from "vitest";
import { projectDbManager, sqliteUrl } from "./db.js";
import { loadFrameContext } from "./services/contextService.js";
import { createLocationAngle, lockReferenceAsCanonical, setReferenceStatus, uploadReferenceVersion } from "./services/referenceService.js";
import { importChatGPTResult } from "./services/chatGPTImportService.js";
import { createChatGPTExport } from "./services/chatGPTExportService.js";
import { updateFrameContext } from "./services/frameContextService.js";
import { lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";

const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("architectural refactor", () => {
  it("creates and opens a self-contained project database", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-project-"));
    const context = await projectDbManager.createProject({ name: "Bearridge Six", rootPath: projectPath });

    await expect(fs.access(path.join(projectPath, "project.sqlite"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectPath, "project.json"))).resolves.toBeUndefined();

    await projectDbManager.closeProject();
    const reopened = await projectDbManager.openProject({ projectPath });

    expect(reopened.project.id).toBe(context.project.id);
    expect(reopened.databasePath).toBe(path.join(projectPath, "project.sqlite"));
  });

  it("migrates legacy project databases when they are opened", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-legacy-open-"));
    const databasePath = path.join(projectPath, "project.sqlite");
    await fs.writeFile(path.join(projectPath, "project.json"), JSON.stringify({ id: "legacy-project", name: "Legacy Project", database: "project.sqlite" }), "utf8");
    const legacyPrisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(databasePath) } } });
    try {
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "Project" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "rootPath" TEXT NOT NULL,
        "defaultAspectRatio" TEXT NOT NULL DEFAULT '16:9',
        "defaultResolution" TEXT NOT NULL DEFAULT '1536x864',
        "defaultProvider" TEXT NOT NULL DEFAULT 'gemini',
        "defaultDraftModel" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-image',
        "defaultProductionModel" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-image',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "Frame" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sceneId" TEXT NOT NULL,
        "sequence" INTEGER NOT NULL,
        "frameCode" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'CG',
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "description" TEXT NOT NULL DEFAULT '',
        "action" TEXT NOT NULL DEFAULT '',
        "camera" TEXT NOT NULL DEFAULT '',
        "composition" TEXT NOT NULL DEFAULT '',
        "lighting" TEXT NOT NULL DEFAULT '',
        "expressionNotes" TEXT NOT NULL DEFAULT '',
        "continuityNotes" TEXT NOT NULL DEFAULT '',
        "previousFrameId" TEXT,
        "selectedGenerationId" TEXT,
        "targetWidth" INTEGER,
        "targetHeight" INTEGER,
        "targetAspectRatio" REAL
      )`);
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "Scene" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "chapterId" TEXT NOT NULL DEFAULT '',
        "sequence" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "locationId" TEXT,
        "timeDescription" TEXT NOT NULL DEFAULT '',
        "previousSceneId" TEXT
      )`);
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "Outfit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "characterId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "masterReferenceId" TEXT
      )`);
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "StyleProfile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "linework" TEXT NOT NULL DEFAULT '',
        "anatomy" TEXT NOT NULL DEFAULT '',
        "faces" TEXT NOT NULL DEFAULT '',
        "shading" TEXT NOT NULL DEFAULT '',
        "colorPalette" TEXT NOT NULL DEFAULT '',
        "backgroundDetail" TEXT NOT NULL DEFAULT '',
        "lighting" TEXT NOT NULL DEFAULT '',
        "cameraLanguage" TEXT NOT NULL DEFAULT '',
        "negativeRules" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'DRAFT'
      )`);
      await legacyPrisma.$executeRawUnsafe(`CREATE TABLE "StyleReference" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "styleProfileId" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "code" TEXT NOT NULL,
        "filePath" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "isCanonical" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await legacyPrisma.project.create({ data: { id: "legacy-project", name: "Legacy Project", slug: "legacy-project", rootPath: projectPath } });
      await legacyPrisma.$executeRawUnsafe(`INSERT INTO "Scene" ("id", "projectId", "sequence", "name") VALUES ('legacy-scene', 'legacy-project', 1, 'Legacy Scene')`);
      await legacyPrisma.$executeRawUnsafe(`INSERT INTO "StyleProfile" ("id", "projectId", "name", "slug") VALUES ('legacy-style', 'legacy-project', 'Legacy Style', 'legacy-style')`);
      await legacyPrisma.$executeRawUnsafe(`INSERT INTO "StyleReference" ("id", "styleProfileId", "code", "filePath") VALUES ('legacy-style-ref', 'legacy-style', 'STYLE_LEGACY_V1', 'style/legacy.png')`);
    } finally {
      await legacyPrisma.$disconnect();
    }

    const opened = await projectDbManager.openProject({ projectPath });
    const frameColumns = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Frame")`);
    const sceneColumns = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Scene")`);
    const outfitColumns = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Outfit")`);
    const styleReferenceColumns = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("StyleReference")`);
    const sceneCharacterTables = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'SceneCharacter'`);
    const frameCharacterReferenceSelectionTables = await opened.prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'FrameCharacterReferenceSelection'`);

    expect(frameColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["locationId", "locationAngleId", "styleProfileId", "generationStrategy", "continuityEditContract"]));
    expect(frameCharacterReferenceSelectionTables).toHaveLength(1);
    expect(sceneColumns.map((column) => column.name)).toContain("styleProfileId");
    expect(outfitColumns.map((column) => column.name)).toContain("immutableFeatures");
    expect(styleReferenceColumns.map((column) => column.name)).toContain("updatedAt");
    expect(sceneCharacterTables).toHaveLength(1);
  });

  it("keeps upload draft, promotes through lifecycle, and versions canonical slots", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-lifecycle-"));
    const context = await projectDbManager.createProject({ name: "Generic Test", rootPath: projectPath });
    const { prisma } = context;
    const character = await prisma.character.create({
      data: {
        projectId: context.project.id,
        name: "Max",
        slug: "max"
      }
    });

    const v1 = await uploadReferenceVersion(prisma, projectPath, "character", character.id, {
      type: "MASTER",
      fileName: "max-v1.png",
      dataUrl: tinyPng,
      description: ""
    });
    expect(v1.status).toBe("DRAFT");
    expect(v1.version).toBe(1);

    const approved = await setReferenceStatus(prisma, "character", v1.id, "APPROVED");
    expect(approved.status).toBe("APPROVED");

    const lockedV1 = await lockReferenceAsCanonical(prisma, "character", v1.id);
    expect(lockedV1.status).toBe("LOCKED");

    const v2 = await uploadReferenceVersion(prisma, projectPath, "character", character.id, {
      type: "MASTER",
      fileName: "max-v2.png",
      dataUrl: tinyPng,
      description: ""
    });
    expect(v2.status).toBe("DRAFT");
    expect(v2.version).toBe(2);
    expect(await prisma.characterReference.findUnique({ where: { id: v1.id } })).toMatchObject({ status: "LOCKED" });

    const generation = await prisma.generation.create({
      data: {
        frameId: await createFrameId(prisma, context.project.id),
        provider: "mock",
        model: "mock",
        prompt: "test",
        status: "SUCCESS",
        outputFilePath: "generations/test.png",
        resolution: "1x1",
        aspectRatio: "1:1",
        storyStateSnapshot: "{}",
        frameSnapshot: "{}"
      }
    });
    await prisma.generationReference.create({
      data: {
        generationId: generation.id,
        referenceKind: "character",
        referenceId: v1.id,
        code: v1.code,
        filePath: v1.filePath,
        priority: 10
      }
    });

    await setReferenceStatus(prisma, "character", v2.id, "APPROVED");
    const lockedV2 = await lockReferenceAsCanonical(prisma, "character", v2.id);
    const refreshedV1 = await prisma.characterReference.findUniqueOrThrow({ where: { id: v1.id } });
    const provenance = await prisma.generationReference.findFirstOrThrow({ where: { generationId: generation.id } });

    expect(lockedV2.status).toBe("LOCKED");
    expect(refreshedV1.status).toBe("DEPRECATED");
    expect(provenance.referenceId).toBe(v1.id);
    expect(provenance.code).toBe(v1.code);
  });

  it("supports generic entities without Anna or Bedroom assumptions", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-generic-"));
    const context = await projectDbManager.createProject({ name: "No Demo Names", rootPath: projectPath });
    const { prisma } = context;

    const character = await prisma.character.create({ data: { projectId: context.project.id, name: "Max", slug: "max" } });
    const location = await prisma.location.create({ data: { projectId: context.project.id, name: "Forest Cabin", slug: "forest-cabin" } });

    expect(character.name).toBe("Max");
    expect(location.name).toBe("Forest Cabin");
  });

  it("saves and reads outfit metadata from the project database", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-outfit-metadata-"));
    const context = await projectDbManager.createProject({ name: "Outfit Metadata", rootPath: projectPath });
    const { prisma } = context;
    const character = await prisma.character.create({ data: { projectId: context.project.id, name: "Max", slug: "max" } });

    const outfit = await prisma.outfit.create({
      data: {
        characterId: character.id,
        name: "Rain Coat",
        slug: "rain-coat",
        description: "long translucent rain coat over black uniform",
        immutableFeatures: "translucent coat, black uniform, silver zipper"
      }
    });
    await prisma.outfit.update({
      where: { id: outfit.id },
      data: {
        description: "long yellow rain coat over black uniform",
        immutableFeatures: "yellow coat, black uniform, silver zipper"
      }
    });
    const saved = await prisma.outfit.findUniqueOrThrow({ where: { id: outfit.id } });

    expect(saved.description).toBe("long yellow rain coat over black uniform");
    expect(saved.immutableFeatures).toBe("yellow coat, black uniform, silver zipper");
  });

  it("loads frame context inherited from scene narrative context", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-scene-context-"));
    const context = await projectDbManager.createProject({ name: "Scene Context", rootPath: projectPath });
    const { prisma } = context;
    const character = await prisma.character.create({ data: { projectId: context.project.id, name: "Mira", slug: "mira" } });
    const location = await prisma.location.create({ data: { projectId: context.project.id, name: "Archive", slug: "archive" } });
    const style = await prisma.styleProfile.create({ data: { projectId: context.project.id, name: "Soft Ink", slug: "soft-ink", status: "LOCKED" } });
    const scene = await prisma.scene.create({
      data: {
        projectId: context.project.id,
        sequence: 1,
        name: "Archive discovery",
        description: "Mira finds a sealed folder in the archive.",
        locationId: location.id,
        styleProfileId: style.id,
        characters: { create: [{ characterId: character.id, order: 1 }] }
      }
    });
    await prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify({ sceneId: scene.id, time: { description: "" }, environment: {}, characters: { [character.id]: { present: true } }, props: {}, storyFacts: [] }) } });
    const frame = await prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", action: "Mira reaches toward the folder." } });

    const loaded = await loadFrameContext(frame.id);

    expect(loaded.scene.description).toBe("Mira finds a sealed folder in the archive.");
    expect(loaded.scene.characterIds).toEqual([character.id]);
    expect(loaded.frame.characterIds).toEqual([character.id]);
    expect(loaded.location?.id).toBe(location.id);
    expect(loaded.styleProfile?.id).toBe(style.id);
  });

  it("persists edited frame camera instructions for generation context", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-camera-"));
    const context = await projectDbManager.createProject({ name: "Frame Camera", rootPath: projectPath });
    const { prisma } = context;
    const scene = await prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Office lounge" } });
    const frame = await prisma.frame.create({
      data: {
        sceneId: scene.id,
        sequence: 1,
        frameCode: "S001_F001",
        action: "Mira waits by the reception desk.",
        camera: "static medium shot"
      }
    });

    await prisma.frame.update({
      where: { id: frame.id },
      data: {
        camera: "low over-the-shoulder camera from the sofa",
        composition: "Mira in the left third, reception desk in the background",
        targetWidth: 1200,
        targetHeight: 500,
        targetAspectRatio: 2.4
      }
    });
    const loaded = await loadFrameContext(frame.id);

    expect(loaded.frame.camera).toBe("low over-the-shoulder camera from the sofa");
    expect(loaded.frame.composition).toBe("Mira in the left third, reception desk in the background");
    expect(loaded.frame.targetAspectRatio).toBe(2.4);
  });

  it("persists location angle and additional character reference selections through reload, resolver, and ChatGPT export", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-context-persistence-"));
    const context = await projectDbManager.createProject({ name: "Frame Context Persistence", rootPath: projectPath });
    const { prisma } = context;
    const character = await prisma.character.create({ data: { projectId: context.project.id, name: "Hero", slug: "hero" } });
    const outfit = await prisma.outfit.create({ data: { characterId: character.id, name: "Default", slug: "default" } });
    const location = await prisma.location.create({ data: { projectId: context.project.id, name: "Office", slug: "office" } });
    const angle = await createLocationAngle(prisma, location.id, { name: "Angle 1", description: "", cameraPositionDescription: "View from the lounge" });
    const style = await prisma.styleProfile.create({ data: { projectId: context.project.id, name: "Canonical", slug: "canonical", status: "LOCKED" } });

    const uploadAndLock = async (ownerType: "character" | "outfit" | "location" | "locationAngle" | "style", ownerId: string, type: string, fileName: string) => {
      const reference = await uploadReferenceVersion(prisma, projectPath, ownerType, ownerId, { type, fileName, dataUrl: tinyPng, description: "" });
      await setReferenceStatus(prisma, ownerType, reference.id, "APPROVED");
      return lockReferenceAsCanonical(prisma, ownerType, reference.id);
    };
    await uploadAndLock("character", character.id, "MASTER", "hero-master.png");
    const fullBody = await uploadAndLock("character", character.id, "FULL_BODY_FRONT", "hero-full-body.png");
    await uploadAndLock("outfit", outfit.id, "MASTER", "outfit-master.png");
    await uploadAndLock("location", location.id, "MASTER", "location-master.png");
    const angleView = await uploadAndLock("locationAngle", angle.id, "VIEW", "angle-view.png");
    await uploadAndLock("style", style.id, "REF", "style-ref.png");

    const scene = await prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene", locationId: location.id, styleProfileId: style.id } });
    await prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify({
      sceneId: scene.id,
      time: { description: "" },
      environment: {},
      characters: { [character.id]: { present: true, outfitId: outfit.id } },
      props: {},
      storyFacts: []
    }) } });
    const frame = await prisma.frame.create({ data: { sceneId: scene.id, sequence: 3, frameCode: "S001_F003" } });

    await updateFrameContext(prisma, {
      frameId: frame.id,
      characterIds: [character.id],
      additionalCharacterReferenceIds: { [character.id]: [fullBody.id] },
      locationId: location.id,
      locationAngleId: angle.id,
      styleProfileId: style.id
    });
    let loaded = await loadFrameContext(frame.id);
    expect(loaded.frame.locationAngleId).toBe(angle.id);
    expect(loaded.frame.additionalCharacterReferenceIds).toEqual({ [character.id]: [fullBody.id] });
    expect(new ReferenceResolver().resolve(loaded).references).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fullBody.id, kind: "character" }),
      expect.objectContaining({ id: angleView.id, kind: "location-angle" })
    ]));

    const exported = await createChatGPTExport(frame.id);
    expect(exported.manifest.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fullBody.id, kind: "character" }),
      expect.objectContaining({ id: angleView.id, kind: "location-angle" })
    ]));

    await updateFrameContext(prisma, {
      frameId: frame.id,
      characterIds: [character.id],
      additionalCharacterReferenceIds: { [character.id]: [] },
      locationId: location.id,
      locationAngleId: angle.id,
      styleProfileId: style.id
    });
    loaded = await loadFrameContext(frame.id);
    expect(loaded.frame.additionalCharacterReferenceIds).toEqual({ [character.id]: [] });
    expect(new ReferenceResolver().resolve(loaded).references.some((reference) => reference.id === fullBody.id)).toBe(false);
  });

  it("keeps multiple locked style references active and limits them to six", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-style-refs-"));
    const context = await projectDbManager.createProject({ name: "Style Refs", rootPath: projectPath });
    const { prisma } = context;
    const style = await prisma.styleProfile.create({ data: { projectId: context.project.id, name: "Ink Night", slug: "ink-night" } });
    const refs = await Promise.all(Array.from({ length: 7 }, (_, index) => prisma.styleReference.create({
      data: {
        styleProfileId: style.id,
        version: index + 1,
        code: `STYLE_INK_NIGHT_V${index + 1}`,
        filePath: `style/ink-night-${index + 1}.png`,
        status: "APPROVED"
      }
    })));

    for (const reference of refs.slice(0, 6)) {
      await lockReferenceAsCanonical(prisma, "style", reference.id);
    }
    const locked = await prisma.styleReference.findMany({ where: { styleProfileId: style.id, status: "LOCKED" } });

    expect(locked).toHaveLength(6);
    expect(locked.map((reference) => reference.code)).toEqual(expect.arrayContaining([
      "STYLE_INK_NIGHT_V1",
      "STYLE_INK_NIGHT_V6"
    ]));
    await expect(lockReferenceAsCanonical(prisma, "style", refs[6]!.id)).rejects.toThrow("Style can have at most 6 active LOCKED references.");
  });

  it("versions and locks canonical references for location angles", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-angle-"));
    const context = await projectDbManager.createProject({ name: "Angle Project", rootPath: projectPath });
    const { prisma } = context;
    const location = await prisma.location.create({ data: { projectId: context.project.id, name: "Studio", slug: "studio" } });
    const angle = await createLocationAngle(prisma, location.id, {
      name: "Desk view",
      description: "View from the desk.",
      cameraPositionDescription: "camera near desk"
    });

    const v1 = await uploadReferenceVersion(prisma, projectPath, "locationAngle", angle.id, {
      type: "VIEW",
      fileName: "desk-v1.png",
      dataUrl: tinyPng,
      description: ""
    });
    const v2 = await uploadReferenceVersion(prisma, projectPath, "locationAngle", angle.id, {
      type: "VIEW",
      fileName: "desk-v2.png",
      dataUrl: tinyPng,
      description: ""
    });

    await setReferenceStatus(prisma, "locationAngle", v1.id, "APPROVED");
    await lockReferenceAsCanonical(prisma, "locationAngle", v1.id);
    await setReferenceStatus(prisma, "locationAngle", v2.id, "APPROVED");
    const lockedV2 = await lockReferenceAsCanonical(prisma, "locationAngle", v2.id);
    const refreshedV1 = await prisma.locationAngleReference.findUniqueOrThrow({ where: { id: v1.id } });
    const refreshedAngle = await prisma.locationAngle.findUniqueOrThrow({ where: { id: angle.id } });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(refreshedV1.status).toBe("DEPRECATED");
    expect(lockedV2.status).toBe("LOCKED");
    expect(refreshedAngle.referenceId).toBe(v2.id);
  });

  it("saves and reads location angle metadata from the project database", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-angle-metadata-"));
    const context = await projectDbManager.createProject({ name: "Angle Metadata", rootPath: projectPath });
    const { prisma } = context;
    const location = await prisma.location.create({ data: { projectId: context.project.id, name: "Hall", slug: "hall" } });
    const angle = await createLocationAngle(prisma, location.id, {
      name: "Low hallway view",
      description: "",
      cameraPositionDescription: "camera low near the floor, looking toward the stairs"
    });

    await prisma.locationAngle.update({
      where: { id: angle.id },
      data: {
        name: "Stair landing view",
        slug: "stair-landing-view",
        cameraPositionDescription: "camera on the stair landing, looking back into the hall"
      }
    });
    const saved = await prisma.locationAngle.findUniqueOrThrow({ where: { id: angle.id } });

    expect(saved.name).toBe("Stair landing view");
    expect(saved.cameraPositionDescription).toBe("camera on the stair landing, looking back into the hall");
  });

  it("persists a structured continuity edit contract on Frame", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-continuity-contract-"));
    const context = await projectDbManager.createProject({ name: "Continuity Contract", rootPath: projectPath });
    const frameId = await createFrameId(context.prisma, context.project.id);
    const contract = {
      changes: ["Hero moves beside the desk"],
      forbidden: ["Do not add props"],
      allowedChanges: ["character.position", "camera"]
    };
    await context.prisma.frame.update({
      where: { id: frameId },
      data: { generationStrategy: "CONTINUE_PREVIOUS_FRAME", continuityEditContract: JSON.stringify(contract) }
    });

    const saved = await context.prisma.frame.findUniqueOrThrow({ where: { id: frameId } });
    expect(JSON.parse(saved.continuityEditContract)).toEqual(contract);
  });

  it("imports a continuation ChatGPT result as a normal Generation and preserves base provenance", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-chatgpt-import-"));
    const context = await projectDbManager.createProject({ name: "Manual Import", rootPath: projectPath });
    const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
    const previous = await context.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001" } });
    const basePath = "generations/S001_F001/S001_F001_G001.png";
    await fs.mkdir(path.join(projectPath, "generations", "S001_F001"), { recursive: true });
    await fs.writeFile(path.join(projectPath, basePath), Buffer.from(tinyPng.split(",")[1]!, "base64"));
    const baseGeneration = await context.prisma.generation.create({ data: {
      frameId: previous.id, provider: "mock", model: "mock", prompt: "base", status: "SUCCESS", outputFilePath: basePath,
      resolution: "1536x864", aspectRatio: "16:9", storyStateSnapshot: JSON.stringify({ sceneId: scene.id, time: { description: "" }, environment: {}, characters: {}, props: {}, storyFacts: [] }), frameSnapshot: "{}"
    } });
    await context.prisma.frame.update({ where: { id: previous.id }, data: { status: "LOCKED", selectedGenerationId: baseGeneration.id } });
    const frame = await context.prisma.frame.create({ data: {
      sceneId: scene.id, sequence: 2, frameCode: "S001_F002", previousFrameId: previous.id,
      generationStrategy: "CONTINUE_PREVIOUS_FRAME"
    } });
    const exportId = "11111111-1111-4111-8111-111111111111";
    await writeExportReceipt(projectPath, exportId, frame, "CONTINUE_PREVIOUS_FRAME", { frameId: previous.id, generationId: baseGeneration.id, frameCode: previous.frameCode });

    const imported = await importChatGPTResult({ frameId: frame.id, exportId, fileName: "chatgpt.png", dataUrl: tinyPng });

    expect(imported).toMatchObject({ provider: "chatgpt-manual", model: "chatgpt-manual", status: "SUCCESS", generationType: "EDIT", parentGenerationId: baseGeneration.id });
    expect(imported?.references.map((reference) => reference.referenceKind)).toEqual(["base-previous-frame", "character"]);
    await expect(fs.access(path.join(projectPath, imported!.outputFilePath))).resolves.toBeUndefined();
    const metadata = JSON.parse(imported!.rawMetadata!);
    expect(metadata).toMatchObject({ manualImport: true, exportId, strategy: "CONTINUE_PREVIOUS_FRAME", baseFrameId: previous.id, baseGenerationId: baseGeneration.id });
    expect(metadata.productionReferenceIds).toEqual(["character-ref"]);
    expect(metadata.visualReferenceIds).toEqual(["character-ref"]);
    expect(metadata.renderProtocol).toMatchObject({ version: 1, promptPolicy: "verbatim", basePolicy: "authoritative", referencePolicy: "identity-only" });
    expect(metadata).not.toHaveProperty("action");

    await context.prisma.frame.update({ where: { id: frame.id }, data: { status: "LOCKED", selectedGenerationId: imported!.id } });
    const next = await context.prisma.frame.create({ data: { sceneId: scene.id, sequence: 3, frameCode: "S001_F003", previousFrameId: frame.id } });
    const nextContext = await loadFrameContext(next.id);
    expect(nextContext.previousLockedFrame).toMatchObject({ generationId: imported!.id, outputFilePath: imported!.outputFilePath });
  });

  it("selects a successful Generation independently from locking and uses the locked selection for continuation", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-generation-review-"));
    const context = await projectDbManager.createProject({ name: "Generation Review", rootPath: projectPath });
    const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
    const frame = await context.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001" } });
    const generationData = {
      frameId: frame.id,
      provider: "mock",
      model: "mock",
      prompt: "prompt",
      resolution: "1536x864",
      aspectRatio: "16:9",
      storyStateSnapshot: "{}",
      frameSnapshot: "{}"
    };
    const first = await context.prisma.generation.create({ data: { ...generationData, status: "SUCCESS", outputFilePath: "generations/first.png" } });
    const second = await context.prisma.generation.create({ data: { ...generationData, status: "SUCCESS", outputFilePath: "generations/second.png" } });
    const failed = await context.prisma.generation.create({ data: { ...generationData, status: "FAILED", outputFilePath: "" } });

    await selectGenerationForFrame(context.prisma, frame.id, first.id);
    await expect(context.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).resolves.toMatchObject({
      selectedGenerationId: first.id,
      status: "REVIEW"
    });

    await selectGenerationForFrame(context.prisma, frame.id, second.id);
    await expect(context.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).resolves.toMatchObject({
      selectedGenerationId: second.id,
      status: "REVIEW"
    });
    await expect(selectGenerationForFrame(context.prisma, frame.id, failed.id)).rejects.toMatchObject({ code: "INVALID_GENERATION_SELECTION" });

    await lockFrameWithSelectedGeneration(context.prisma, frame.id);
    await expect(context.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).resolves.toMatchObject({
      selectedGenerationId: second.id,
      status: "LOCKED"
    });

    const next = await context.prisma.frame.create({
      data: { sceneId: scene.id, sequence: 2, frameCode: "S001_F002", previousFrameId: frame.id, generationStrategy: "CONTINUE_PREVIOUS_FRAME" }
    });
    const nextContext = await loadFrameContext(next.id);
    expect(nextContext.previousLockedFrame).toMatchObject({ generationId: second.id, outputFilePath: second.outputFilePath });
  });

  it.each([
    ["jpeg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ["webp", "image/webp", Buffer.from("RIFFxxxxWEBPdata", "ascii")]
  ])("imports a valid %s manual result", async (extension, mime, bytes) => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), `bearridge-import-${extension}-`));
    const context = await projectDbManager.createProject({ name: `Import ${extension}`, rootPath: projectPath });
    const frameId = await createFrameId(context.prisma, context.project.id);
    const frame = await context.prisma.frame.findUniqueOrThrow({ where: { id: frameId } });
    const exportId = extension === "jpeg" ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333";
    await writeExportReceipt(projectPath, exportId, frame, "NEW_COMPOSITION");
    const imported = await importChatGPTResult({ frameId, exportId, fileName: `result.${extension}`, dataUrl: `data:${mime};base64,${bytes.toString("base64")}` });
    expect(imported?.provider).toBe("chatgpt-manual");
    expect(imported?.outputFilePath).toMatch(new RegExp(`\\.${extension === "jpeg" ? "jpg" : "webp"}$`));
  });

  it("rejects fake image signatures and another Frame's export without partial files or Generations", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-import-invalid-"));
    const context = await projectDbManager.createProject({ name: "Invalid Import", rootPath: projectPath });
    const firstId = await createFrameId(context.prisma, context.project.id);
    const first = await context.prisma.frame.findUniqueOrThrow({ where: { id: firstId } });
    const second = await context.prisma.frame.create({ data: { sceneId: first.sceneId, sequence: 2, frameCode: "S001_F002" } });
    const exportId = "44444444-4444-4444-8444-444444444444";
    await writeExportReceipt(projectPath, exportId, first, "NEW_COMPOSITION");

    await expect(importChatGPTResult({ frameId: first.id, exportId, fileName: "fake.png", dataUrl: `data:image/png;base64,${Buffer.from("not png").toString("base64")}` })).rejects.toThrow("signature");
    await expect(importChatGPTResult({ frameId: second.id, exportId, fileName: "result.png", dataUrl: tinyPng })).rejects.toThrow("does not belong");
    expect(await context.prisma.generation.count({ where: { frameId: { in: [first.id, second.id] } } })).toBe(0);
    const generationFolders = await fs.readdir(path.join(projectPath, "generations"));
    expect(generationFolders).toEqual([]);
  });

  it("removes a project from registry without deleting its folder by default", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-delete-registry-"));
    const context = await projectDbManager.createProject({ name: "Registry Only", rootPath: projectPath });

    const result = await projectDbManager.deleteProject({ projectId: context.project.id });
    const registry = await projectDbManager.listRegistry();

    expect(result.deletedFiles).toBe(false);
    expect(registry.some((entry) => entry.id === context.project.id)).toBe(false);
    await expect(fs.access(path.join(projectPath, "project.sqlite"))).resolves.toBeUndefined();
  });

  it("deletes the project folder only with exact project name confirmation", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-delete-files-"));
    const context = await projectDbManager.createProject({ name: "Delete Files", rootPath: projectPath });

    await expect(projectDbManager.deleteProject({
      projectId: context.project.id,
      deleteFiles: true,
      confirmationName: "Wrong Name"
    })).rejects.toThrow("Project folder deletion requires exact project name confirmation.");

    const result = await projectDbManager.deleteProject({
      projectId: context.project.id,
      deleteFiles: true,
      confirmationName: "Delete Files"
    });

    expect(result.deletedFiles).toBe(true);
    await expect(fs.access(projectPath)).rejects.toThrow();
  });
});

async function writeExportReceipt(
  projectPath: string,
  exportId: string,
  frame: { id: string; frameCode: string; generationStrategy: string; continuityEditContract: string },
  strategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME",
  base?: { frameId: string; generationId: string; frameCode: string }
) {
  const directory = path.join(projectPath, "exports", "chatgpt");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${exportId}.json`), JSON.stringify({
    exportId,
    createdAt: new Date().toISOString(),
    ...(strategy === "CONTINUE_PREVIOUS_FRAME" ? { renderProtocol: {
      version: 1,
      promptPolicy: "verbatim",
      basePolicy: "authoritative",
      referencePolicy: "identity-only",
      allowPromptRewrite: false,
      allowSceneReinterpretation: false
    } } : {}),
    manifest: {
      schemaVersion: 1,
      exportId,
      strategy,
      ...(strategy === "CONTINUE_PREVIOUS_FRAME" ? {
        exportPolicy: "CHATGPT_CONTINUATION_V2",
        productionReferenceIds: ["character-ref"],
        visualReferencesActuallyExported: ["character-ref"],
        renderProtocol: {
          version: 1,
          promptPolicy: "verbatim",
          basePolicy: "authoritative",
          referencePolicy: "identity-only",
          allowPromptRewrite: false,
          allowSceneReinterpretation: false
        }
      } : {}),
      frame: { id: frame.id, code: frame.frameCode },
      ...(base ? { base: { ...base, filename: `base/${base.frameCode}.png` } } : {}),
      geometry: { targetWidth: 1200, targetHeight: 675, targetAspectRatio: 16 / 9, requestAspectRatio: "16:9", requestResolution: "1536x864", requiresCrop: false, cropStrategy: "NONE" }
    },
    fullTargetPrompt: "EXPORTED PROMPT",
    frameSnapshot: { ...frame, continuityEditContract: JSON.parse(frame.continuityEditContract) },
    storyStateSnapshot: { sceneId: "scene", time: { description: "" }, environment: {}, characters: {}, props: {}, storyFacts: [] },
    supportingReferences: [{ id: "character-ref", code: "CHAR_HERO_MASTER_V1", kind: "character", filePath: "characters/hero.png", priority: 10, role: "identity" }],
    ...(strategy === "CONTINUE_PREVIOUS_FRAME" ? { visualReferencesActuallyExported: ["character-ref"] } : {})
  }), "utf8");
}

async function createFrameId(prisma: Awaited<ReturnType<typeof projectDbManager.openProject>>["prisma"], projectId: string): Promise<string> {
  const scene = await prisma.scene.create({ data: { projectId, sequence: 1, name: "Scene" } });
  const frame = await prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001" } });
  return frame.id;
}
