import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { consistencyBenchmarkSceneName, createEmptyStoryState, frameCode, initialConsistencyBenchmarkFrames, referenceVersionCode, slugify } from "@bearridge/core";
import {
  createCharacterSchema,
  continuityEditContractSchema,
  createFrameSchema,
  createLocationSchema,
  createLocationAngleSchema,
  createOutfitSchema,
  createProjectSchema,
  createSceneSchema,
  createStyleProfileSchema,
  deleteProjectSchema,
  generateFrameSchema,
  importChatGPTResultSchema,
  lockFrameSchema,
  openProjectSchema,
  saveStoryStateSchema,
  selectFrameGenerationSchema,
  seedBenchmarkSchema,
  updateCharacterSchema,
  updateFrameSchema,
  updateFrameContextSchema,
  updateLocationAngleSchema,
  updateOutfitSchema,
  updateProjectSettingsSchema,
  updateReferenceStatusSchema,
  updateSceneSchema,
  updateStyleProfileSchema,
  uploadReferenceSchema
} from "@bearridge/shared";
import { config } from "./config.js";
import { projectDbManager } from "./db.js";
import { AppError } from "./errors.js";
import { loadProject, projectInclude } from "./services/contextService.js";
import { generateFrame, previewFrame } from "./services/generationService.js";
import { createChatGPTExport } from "./services/chatGPTExportService.js";
import { importChatGPTResult, listChatGPTExports } from "./services/chatGPTImportService.js";
import { createLocationAngle, lockReferenceAsCanonical, setReferenceStatus, uploadReferenceVersion } from "./services/referenceService.js";
import { updateFrameContext } from "./services/frameContextService.js";
import { lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "30mb" }));
  app.use("/project-files", express.static(config.projectsRoot));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      provider: config.imageProvider,
      geminiConfigured: Boolean(config.geminiApiKey),
      openaiConfigured: Boolean(config.openaiApiKey)
    });
  });

  app.get("/api/projects", asyncHandler(async (_request, response) => {
    response.json(await projectDbManager.listRegistry());
  }));

  app.post("/api/projects", asyncHandler(async (request, response) => {
    const input = createProjectSchema.parse(request.body);
    const context = await projectDbManager.createProject(input);
    response.status(201).json(context.project);
  }));

  app.post("/api/projects/open", asyncHandler(async (request, response) => {
    const input = openProjectSchema.parse(request.body);
    const context = await projectDbManager.openProject(input);
    response.json(context.project);
  }));

  app.delete("/api/projects/:projectId", asyncHandler(async (request, response) => {
    const input = deleteProjectSchema.parse({ ...request.body, projectId: requiredParam(request, "projectId") });
    response.json(await projectDbManager.deleteProject(input));
  }));

  app.get("/api/projects/:projectId", asyncHandler(async (request, response) => {
    response.json(serializeProject(await loadProject(requiredParam(request, "projectId"))));
  }));

  app.post("/api/characters", asyncHandler(async (request, response) => {
    const input = createCharacterSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const character = await prisma.character.create({
      data: {
        ...input,
        slug: slugify(input.name)
      }
    });
    response.status(201).json(character);
  }));

  app.put("/api/characters/:characterId", asyncHandler(async (request, response) => {
    const input = updateCharacterSchema.parse({ ...request.body, characterId: requiredParam(request, "characterId") });
    const { prisma } = projectDbManager.getActiveProject();
    const character = await prisma.character.update({
      where: { id: input.characterId },
      data: {
        name: input.name,
        slug: slugify(input.name),
        description: input.description,
        age: input.age,
        height: input.height,
        bodyDescription: input.bodyDescription,
        faceDescription: input.faceDescription,
        hairDescription: input.hairDescription,
        distinctiveFeatures: input.distinctiveFeatures,
        immutableFeatures: input.immutableFeatures
      }
    });
    response.json(character);
  }));

  app.post("/api/characters/:characterId/outfits", asyncHandler(async (request, response) => {
    const input = createOutfitSchema.parse({ ...request.body, characterId: requiredParam(request, "characterId") });
    const { prisma } = projectDbManager.getActiveProject();
    const outfit = await prisma.outfit.create({
      data: {
        characterId: input.characterId,
        name: input.name,
        slug: slugify(input.name),
        description: input.description,
        immutableFeatures: input.immutableFeatures
      }
    });
    response.status(201).json(outfit);
  }));

  app.put("/api/outfits/:outfitId", asyncHandler(async (request, response) => {
    const input = updateOutfitSchema.parse({ ...request.body, outfitId: requiredParam(request, "outfitId") });
    const { prisma } = projectDbManager.getActiveProject();
    const outfit = await prisma.outfit.update({
      where: { id: input.outfitId },
      data: {
        name: input.name,
        slug: slugify(input.name),
        description: input.description,
        immutableFeatures: input.immutableFeatures
      }
    });
    response.json(outfit);
  }));

  app.post("/api/characters/:characterId/references", asyncHandler(async (request, response) => {
    const input = uploadReferenceSchema.parse({ ...request.body, ownerId: requiredParam(request, "characterId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const reference = await uploadReferenceVersion(prisma, projectPath, "character", input.ownerId, input);
    response.status(201).json(reference);
  }));

  app.post("/api/outfits/:outfitId/references", asyncHandler(async (request, response) => {
    const input = uploadReferenceSchema.parse({ ...request.body, ownerId: requiredParam(request, "outfitId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const reference = await uploadReferenceVersion(prisma, projectPath, "outfit", input.ownerId, input);
    response.status(201).json(reference);
  }));

  app.post("/api/locations", asyncHandler(async (request, response) => {
    const input = createLocationSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const location = await prisma.location.create({ data: { ...input, slug: slugify(input.name) } });
    response.status(201).json(location);
  }));

  app.post("/api/locations/:locationId/references", asyncHandler(async (request, response) => {
    const input = uploadReferenceSchema.parse({ ...request.body, ownerId: requiredParam(request, "locationId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const reference = await uploadReferenceVersion(prisma, projectPath, "location", input.ownerId, input);
    response.status(201).json(reference);
  }));

  app.post("/api/locations/:locationId/angles", asyncHandler(async (request, response) => {
    const input = createLocationAngleSchema.parse({ ...request.body, locationId: requiredParam(request, "locationId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.status(201).json(await createLocationAngle(prisma, input.locationId, input));
  }));

  app.put("/api/location-angles/:locationAngleId", asyncHandler(async (request, response) => {
    const input = updateLocationAngleSchema.parse({ ...request.body, locationAngleId: requiredParam(request, "locationAngleId") });
    const { prisma } = projectDbManager.getActiveProject();
    const angle = await prisma.locationAngle.update({
      where: { id: input.locationAngleId },
      data: {
        name: input.name,
        slug: slugify(input.name),
        cameraPositionDescription: input.cameraPositionDescription ?? input.cameraDescription
      }
    });
    response.json(angle);
  }));

  app.post("/api/location-angles/:locationAngleId/references", asyncHandler(async (request, response) => {
    const input = uploadReferenceSchema.parse({ ...request.body, ownerId: requiredParam(request, "locationAngleId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const reference = await uploadReferenceVersion(prisma, projectPath, "locationAngle", input.ownerId, input);
    response.status(201).json(reference);
  }));

  app.post("/api/styles", asyncHandler(async (request, response) => {
    const input = createStyleProfileSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const style = await prisma.styleProfile.create({ data: { ...input, slug: slugify(input.name), status: "LOCKED" } });
    response.status(201).json(style);
  }));

  app.put("/api/styles/:styleId", asyncHandler(async (request, response) => {
    const input = updateStyleProfileSchema.parse({ ...request.body, styleId: requiredParam(request, "styleId") });
    const { prisma } = projectDbManager.getActiveProject();
    const style = await prisma.styleProfile.update({
      where: { id: input.styleId },
      data: {
        name: input.name,
        slug: slugify(input.name),
        description: input.description,
        linework: input.linework,
        anatomy: input.anatomy,
        faces: input.faces,
        shading: input.shading,
        colorPalette: input.colorPalette,
        backgroundDetail: input.backgroundDetail,
        lighting: input.lighting,
        cameraLanguage: input.cameraLanguage,
        negativeRules: input.negativeRules
      }
    });
    response.json(style);
  }));

  app.post("/api/styles/:styleId/references", asyncHandler(async (request, response) => {
    const input = uploadReferenceSchema.parse({ ...request.body, ownerId: requiredParam(request, "styleId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const reference = await uploadReferenceVersion(prisma, projectPath, "style", input.ownerId, input);
    response.status(201).json(reference);
  }));

  app.post("/api/references/:ownerType/:referenceId/approve", asyncHandler(async (request, response) => {
    const input = updateReferenceStatusSchema.parse({ ownerType: requiredParam(request, "ownerType"), referenceId: requiredParam(request, "referenceId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await setReferenceStatus(prisma, input.ownerType, input.referenceId, "APPROVED"));
  }));

  app.post("/api/references/:ownerType/:referenceId/reject", asyncHandler(async (request, response) => {
    const input = updateReferenceStatusSchema.parse({ ownerType: requiredParam(request, "ownerType"), referenceId: requiredParam(request, "referenceId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await setReferenceStatus(prisma, input.ownerType, input.referenceId, "REJECTED"));
  }));

  app.post("/api/references/:ownerType/:referenceId/deprecate", asyncHandler(async (request, response) => {
    const input = updateReferenceStatusSchema.parse({ ownerType: requiredParam(request, "ownerType"), referenceId: requiredParam(request, "referenceId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await setReferenceStatus(prisma, input.ownerType, input.referenceId, "DEPRECATED"));
  }));

  app.post("/api/references/:ownerType/:referenceId/lock", asyncHandler(async (request, response) => {
    const input = updateReferenceStatusSchema.parse({ ownerType: requiredParam(request, "ownerType"), referenceId: requiredParam(request, "referenceId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await lockReferenceAsCanonical(prisma, input.ownerType, input.referenceId));
  }));

  app.post("/api/scenes", asyncHandler(async (request, response) => {
    const input = createSceneSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const styleProfileId = input.styleProfileId ?? input.styleId ?? null;
    const scene = await prisma.scene.create({
      data: {
        projectId: input.projectId,
        sequence: input.sequence,
        name: input.name,
        description: input.description,
        locationId: input.locationId ?? null,
        styleProfileId,
        timeDescription: input.timeDescription,
        characters: {
          create: input.characterIds.map((characterId, index) => ({ characterId, order: index + 1 }))
        }
      }
    });
    await prisma.storyState.create({
      data: {
        sceneId: scene.id,
        document: JSON.stringify({
          ...createEmptyStoryState(scene.id),
          characters: Object.fromEntries(input.characterIds.map((characterId) => [characterId, { present: true }]))
        })
      }
    });
    response.status(201).json(scene);
  }));

  app.put("/api/scenes/:sceneId", asyncHandler(async (request, response) => {
    const input = updateSceneSchema.parse({ ...request.body, sceneId: requiredParam(request, "sceneId") });
    const { prisma } = projectDbManager.getActiveProject();
    const styleProfileId = input.styleProfileId ?? input.styleId ?? null;
    const scene = await prisma.scene.update({
      where: { id: input.sceneId },
      data: {
        name: input.name,
        description: input.description,
        locationId: input.locationId ?? null,
        styleProfileId,
        timeDescription: input.timeDescription
      }
    });
    await prisma.sceneCharacter.deleteMany({ where: { sceneId: scene.id } });
    if (input.characterIds.length) {
      await prisma.sceneCharacter.createMany({
        data: input.characterIds.map((characterId, index) => ({ sceneId: scene.id, characterId, order: index + 1 }))
      });
    }
    response.json(scene);
  }));

  app.put("/api/story-state/:sceneId", asyncHandler(async (request, response) => {
    const input = saveStoryStateSchema.parse({ sceneId: requiredParam(request, "sceneId"), document: request.body.document });
    const { prisma } = projectDbManager.getActiveProject();
    const state = await prisma.storyState.upsert({
      where: { sceneId: input.sceneId },
      update: { document: JSON.stringify(input.document) },
      create: { sceneId: input.sceneId, document: JSON.stringify(input.document) }
    });
    response.json(state);
  }));

  app.post("/api/frames", asyncHandler(async (request, response) => {
    const input = createFrameSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const scene = await prisma.scene.findUnique({ where: { id: input.sceneId } });
    if (!scene) {
      throw new AppError("Scene not found.", 404, "NOT_FOUND");
    }
    const frame = await prisma.frame.create({
      data: {
        sceneId: input.sceneId,
        sequence: input.sequence,
        type: input.type,
        generationStrategy: input.generationStrategy,
        continuityEditContract: JSON.stringify(input.continuityEditContract),
        description: input.description,
        action: input.action,
        camera: input.camera,
        composition: input.composition,
        lighting: input.lighting,
        expressionNotes: input.expressionNotes,
        continuityNotes: input.continuityNotes,
        previousFrameId: input.previousFrameId ?? null,
        locationId: input.locationId ?? scene.locationId ?? null,
        locationAngleId: input.locationAngleId ?? null,
        styleProfileId: input.styleProfileId ?? null,
        targetWidth: input.targetWidth ?? null,
        targetHeight: input.targetHeight ?? null,
        targetAspectRatio: input.targetAspectRatio ?? null,
        frameCode: frameCode(scene.sequence, input.sequence),
        characters: {
          create: input.characterIds.map((characterId, index) => ({ characterId, order: index + 1 }))
        }
      }
    });
    response.status(201).json(frame);
  }));

  app.put("/api/frames/:frameId", asyncHandler(async (request, response) => {
    const input = updateFrameSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    const targetAspectRatio = input.targetAspectRatio
      ?? (input.targetWidth && input.targetHeight ? input.targetWidth / input.targetHeight : null);
    let frame = await prisma.frame.update({
      where: { id: input.frameId },
      data: {
        ...(input.generationStrategy ? { generationStrategy: input.generationStrategy } : {}),
        ...(input.continuityEditContract ? { continuityEditContract: JSON.stringify(input.continuityEditContract) } : {}),
        description: input.description,
        action: input.action,
        camera: input.camera,
        composition: input.composition,
        lighting: input.lighting,
        expressionNotes: input.expressionNotes,
        continuityNotes: input.continuityNotes,
        targetWidth: input.targetWidth ?? null,
        targetHeight: input.targetHeight ?? null,
        targetAspectRatio
      }
    });
    if (input.characterIds) {
      frame = await updateFrameContext(prisma, {
        frameId: input.frameId,
        characterIds: input.characterIds,
        additionalCharacterReferenceIds: input.additionalCharacterReferenceIds ?? {},
        locationId: input.locationId,
        locationAngleId: input.locationAngleId,
        styleProfileId: input.styleProfileId
      });
    }
    response.json(frame);
  }));

  app.put("/api/frames/:frameId/context", asyncHandler(async (request, response) => {
    const input = updateFrameContextSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    const frame = await updateFrameContext(prisma, input);
    response.json(frame);
  }));

  app.get("/api/frames/:frameId/preview", asyncHandler(async (request, response) => {
    response.json(await previewFrame(requiredParam(request, "frameId")));
  }));

  app.post("/api/generations", asyncHandler(async (request, response) => {
    const input = generateFrameSchema.parse(request.body);
    response.status(201).json(await generateFrame(input.frameId, input.mode));
  }));

  app.post("/api/frames/:frameId/export/chatgpt", asyncHandler(async (request, response) => {
    const exported = await createChatGPTExport(requiredParam(request, "frameId"));
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
    response.setHeader("X-Bearridge-Export-Id", exported.exportId);
    response.send(exported.buffer);
  }));

  app.get("/api/frames/:frameId/exports/chatgpt", asyncHandler(async (request, response) => {
    response.json(await listChatGPTExports(requiredParam(request, "frameId")));
  }));

  app.post("/api/frames/:frameId/import/chatgpt", asyncHandler(async (request, response) => {
    const input = importChatGPTResultSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    response.status(201).json(await importChatGPTResult(input));
  }));

  app.put("/api/frames/:frameId/selected-generation", asyncHandler(async (request, response) => {
    const input = selectFrameGenerationSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await selectGenerationForFrame(prisma, input.frameId, input.generationId));
  }));

  app.post("/api/frames/:frameId/lock", asyncHandler(async (request, response) => {
    const input = lockFrameSchema.parse({ frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    response.json(await lockFrameWithSelectedGeneration(prisma, input.frameId));
  }));

  app.post("/api/projects/:projectId/benchmark/seed", asyncHandler(async (request, response) => {
    const input = seedBenchmarkSchema.parse({ ...request.body, projectId: requiredParam(request, "projectId") });
    const projectId = input.projectId;
    const { prisma } = await projectDbManager.openRegisteredProject(projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { scenes: true } });
    if (!project) {
      throw new AppError("Project not found.", 404, "NOT_FOUND");
    }

    const existingScene = await prisma.scene.findFirst({ where: { projectId, name: consistencyBenchmarkSceneName }, include: { frames: true, storyState: true } });
    const scene = existingScene ?? await prisma.scene.create({
      data: {
        projectId,
        sequence: project.scenes.length + 1,
        name: consistencyBenchmarkSceneName,
        description: "20-frame Gemini consistency benchmark with camera, pose and panel geometry variation.",
        locationId: input.locationId,
        styleProfileId: input.styleProfileId,
        timeDescription: "Benchmark continuity test"
      },
      include: { frames: true, storyState: true }
    });

    if (existingScene) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          locationId: input.locationId,
          styleProfileId: input.styleProfileId,
          timeDescription: "Benchmark continuity test"
        }
      });
    }
    await prisma.sceneCharacter.deleteMany({ where: { sceneId: scene.id } });
    await prisma.sceneCharacter.create({ data: { sceneId: scene.id, characterId: input.characterId, order: 1 } });

    const benchmarkStoryState = JSON.stringify({
      ...createEmptyStoryState(scene.id),
      characters: {
        [input.characterId]: {
          present: true,
          outfitId: input.outfitId,
          emotion: "anxious",
          hairState: "canonical",
          locationPosition: "benchmark scene",
          heldProps: ["phone"]
        }
      },
      environment: {
        continuityLight: "established",
        locationState: "unchanged"
      },
      storyFacts: ["This is a 20-frame visual consistency benchmark."]
    });

    if (scene.storyState) {
      await prisma.storyState.update({
        where: { sceneId: scene.id },
        data: { document: benchmarkStoryState }
      });
    } else {
      await prisma.storyState.create({
        data: {
          sceneId: scene.id,
          document: benchmarkStoryState
        }
      });
    }

    const frameBySequence = new Map(scene.frames.map((frame) => [frame.sequence, frame]));
    let previousFrameId = scene.frames.sort((left, right) => left.sequence - right.sequence).at(-1)?.id ?? null;
    let createdCount = 0;

    for (const spec of initialConsistencyBenchmarkFrames()) {
      const existingFrame = frameBySequence.get(spec.sequence);
      if (existingFrame) {
        await prisma.frame.update({
          where: { id: existingFrame.id },
          data: {
            locationId: input.locationId,
            locationAngleId: input.locationAngleId ?? null,
            styleProfileId: input.styleProfileId,
            targetWidth: spec.targetWidth,
            targetHeight: spec.targetHeight,
            targetAspectRatio: spec.targetWidth / spec.targetHeight
          }
        });
        await prisma.frameCharacter.deleteMany({ where: { frameId: existingFrame.id } });
        await prisma.frameCharacter.create({ data: { frameId: existingFrame.id, characterId: input.characterId, order: 1 } });
        previousFrameId = existingFrame.id;
        continue;
      }
      const created = await prisma.frame.create({
        data: {
          sceneId: scene.id,
          sequence: spec.sequence,
          frameCode: frameCode(scene.sequence, spec.sequence),
          type: "CG",
          action: spec.action,
          camera: spec.camera,
          composition: spec.composition,
          expressionNotes: spec.expressionNotes,
          continuityNotes: `${spec.continuityNotes}\nBenchmark tags: ${spec.tags.join(", ")}.`,
          previousFrameId,
          locationId: input.locationId,
          locationAngleId: input.locationAngleId ?? null,
          styleProfileId: input.styleProfileId,
          targetWidth: spec.targetWidth,
          targetHeight: spec.targetHeight,
          targetAspectRatio: spec.targetWidth / spec.targetHeight,
          characters: {
            create: [{ characterId: input.characterId, order: 1 }]
          }
        }
      });
      previousFrameId = created.id;
      createdCount += 1;
    }

    response.status(existingScene ? 200 : 201).json({ sceneId: scene.id, createdCount, totalFrames: initialConsistencyBenchmarkFrames().length });
  }));

  app.put("/api/projects/:projectId/settings", asyncHandler(async (request, response) => {
    const input = updateProjectSettingsSchema.parse({ ...request.body, projectId: requiredParam(request, "projectId") });
    const { prisma } = await projectDbManager.openRegisteredProject(input.projectId);
    const project = await prisma.project.update({
      where: { id: input.projectId },
      data: {
        defaultAspectRatio: input.defaultAspectRatio,
        defaultResolution: input.defaultResolution,
        defaultDraftModel: input.defaultDraftModel,
        defaultProductionModel: input.defaultProductionModel
      }
    });
    response.json(project);
  }));

  app.get("/api/projects/:projectId/full", asyncHandler(async (request, response) => {
    const { prisma } = await projectDbManager.openRegisteredProject(requiredParam(request, "projectId"));
    const project = await prisma.project.findUnique({ where: { id: requiredParam(request, "projectId") }, include: projectInclude });
    if (!project) {
      throw new AppError("Project not found.", 404, "NOT_FOUND");
    }
    response.json(serializeProject(project));
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    response.status(500).json({ error: message, code: "INTERNAL_ERROR" });
  });

  return app;
}

function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

function requiredParam(request: Request, name: string): string {
  const value = request.params[name];
  if (!value) {
    throw new AppError(`Missing route parameter: ${name}`, 400, "VALIDATION_ERROR");
  }
  return value;
}

function serializeProject<T extends { scenes: Array<{
  storyState: { document: string } | null;
  characters?: Array<{ characterId: string; order: number }>;
  frames?: Array<{
    continuityEditContract: string;
    characters?: Array<{
      characterId: string;
      order: number;
      additionalReferences?: Array<{ characterReferenceId: string; order: number }>;
    }>;
  }>;
}> }>(project: T) {
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      characterIds: scene.characters?.sort((left, right) => left.order - right.order).map((item) => item.characterId) ?? [],
      frames: scene.frames?.map((frame) => ({
        ...frame,
        continuityEditContract: continuityEditContractSchema.parse(JSON.parse(frame.continuityEditContract) as unknown),
        characterIds: frame.characters?.sort((left, right) => left.order - right.order).map((item) => item.characterId) ?? [],
        additionalCharacterReferenceIds: Object.fromEntries((frame.characters ?? []).map((item) => [
          item.characterId,
          (item.additionalReferences ?? []).sort((left, right) => left.order - right.order).map((selection) => selection.characterReferenceId)
        ]))
      })),
      storyState: scene.storyState ? {
        ...scene.storyState,
        document: JSON.parse(scene.storyState.document) as unknown
      } : null
    }))
  };
}
