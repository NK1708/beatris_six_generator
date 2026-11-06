import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { consistencyBenchmarkSceneName, createEmptyStoryState, initialConsistencyBenchmarkFrames, referenceVersionCode, slugify } from "@bearridge/core";
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
  exportGenerationRepairSchema,
  frameTargetRecoveryRequestSchema,
  lockFrameSchema,
  confirmFrameLockSchema,
  openProjectSchema,
  saveStoryStateSchema,
  selectFrameGenerationSchema,
  seedBenchmarkSchema,
  updateCharacterSchema,
  updateFrameSchema,
  updateFrameContextSchema,
  updateFrameTargetStoryStateSchema,
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
import { generateFrame, previewProductionFrame } from "./services/generationService.js";
import { createChatGPTExport, ManualChatGPTExportReadinessError } from "./services/chatGPTExportService.js";
import { createChatGPTRepairExport } from "./services/chatGPTRepairService.js";
import { importChatGPTResult, listChatGPTExports } from "./services/chatGPTImportService.js";
import { createLocationAngle, lockReferenceAsCanonical, setReferenceStatus, uploadReferenceVersion } from "./services/referenceService.js";
import { updateFrameContext } from "./services/frameContextService.js";
import { updateFrame } from "./services/frameUpdateService.js";
import { GenerationReviewError, lockFrameWithConfirmation, lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";
import { getFrameLockReadiness } from "./services/frameLockReadinessService.js";
import { ProductionGenerationReadinessError } from "./services/productionGenerationGate.js";
import { createFrameWithTargetStoryState } from "./services/frameCreationService.js";
import {
  FrameStoryStateService,
  FrameStoryStateServiceError,
  type InitializedFrameTargetStoryState,
  type PersistedFrameTargetStoryState
} from "./services/frameStoryStateService.js";
import {
  FrameStoryStateRecoveryError,
  getFrameTargetRecoveryCandidates,
  recoverFrameTargetStoryState
} from "./services/frameStoryStateRecoveryService.js";
import { resolveProjectFileForRead } from "./services/projectPathResolver.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "30mb" }));
  app.get("/api/projects/:projectId/files/*", asyncHandler(async (request, response) => {
    const active = projectDbManager.getActiveProject();
    if (active.project.id !== requiredParam(request, "projectId")) {
      throw new AppError("The requested file does not belong to the active project.", 409, "PROJECT_CONTEXT_MISMATCH");
    }
    const relativePath = request.params[0];
    if (!relativePath) throw new AppError("Missing project file path.", 400, "PROJECT_PATH_INVALID");
    response.sendFile(await resolveProjectFileForRead(active.projectPath, relativePath, { legacyRootPath: active.project.rootPath }));
  }));

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
    response.status(201).json({ ...context.project, rootPath: context.projectPath });
  }));

  app.post("/api/projects/open", asyncHandler(async (request, response) => {
    const input = openProjectSchema.parse(request.body);
    const context = await projectDbManager.openProject(input);
    response.json({ ...context.project, rootPath: context.projectPath });
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
    const { prisma, project } = projectDbManager.getActiveProject();
    const styleProfileId = input.styleProfileId ?? input.styleId ?? null;
    if (input.projectId !== project.id || input.characterIds.length !== new Set(input.characterIds).size
      || (input.locationId !== undefined && !await prisma.location.findFirst({ where: { id: input.locationId, projectId: input.projectId } }))
      || (styleProfileId !== null && !await prisma.styleProfile.findFirst({ where: { id: styleProfileId, projectId: input.projectId } }))
      || await prisma.character.count({ where: { projectId: input.projectId, id: { in: input.characterIds } } }) !== new Set(input.characterIds).size) {
      throw new AppError("Scene context must belong to the active project.", 400, "INVALID_SCENE_CONTEXT");
    }
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

  app.get("/api/frames/:frameId/target-story-state", asyncHandler(async (request, response) => {
    const frameId = requiredParam(request, "frameId");
    const { prisma } = projectDbManager.getActiveProject();
    try {
      const result = await new FrameStoryStateService(prisma).getFrameTargetStoryState(frameId);
      response.json(result.status === "AVAILABLE" ? serializeFrameTargetStoryState(result) : result);
    } catch (error) {
      if (error instanceof FrameStoryStateServiceError && error.code === "TARGET_INVALID") {
        response.json({ status: "INVALID", frameId, code: error.code, message: error.message, diagnostics: error.diagnostics });
        return;
      }
      throw error;
    }
  }));

  app.post("/api/frames/:frameId/target-story-state/initialize", asyncHandler(async (request, response) => {
    const { prisma } = projectDbManager.getActiveProject();
    const result = await new FrameStoryStateService(prisma).initializeFrameTargetStoryState(requiredParam(request, "frameId"));
    response.json(serializeFrameTargetStoryState(result));
  }));

  app.get("/api/frames/:frameId/target-story-state/recovery-candidates", asyncHandler(async (request, response) => {
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    response.json(await getFrameTargetRecoveryCandidates(prisma, projectPath, requiredParam(request, "frameId")));
  }));

  app.post("/api/frames/:frameId/target-story-state/recover", asyncHandler(async (request, response) => {
    const parsed = frameTargetRecoveryRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new FrameStoryStateRecoveryError("RECOVERY_SOURCE_REQUIRED", "A source Generation is required.", 400);
    const { prisma } = projectDbManager.getActiveProject();
    const result = await recoverFrameTargetStoryState(prisma, requiredParam(request, "frameId"), parsed.data.sourceGenerationId);
    response.status(201).json(serializeFrameTargetStoryState(result));
  }));

  app.put("/api/frames/:frameId/target-story-state", asyncHandler(async (request, response) => {
    const parsed = updateFrameTargetStoryStateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("Invalid Frame target Story State update request.", 400, "VALIDATION_ERROR");
    }
    const input = parsed.data;
    const { prisma } = projectDbManager.getActiveProject();
    const result = await new FrameStoryStateService(prisma).updateFrameTargetStoryState(
      requiredParam(request, "frameId"), input.document, input.expectedRevision
    );
    response.json(serializeFrameTargetStoryState(result));
  }));

  app.post("/api/frames", asyncHandler(async (request, response) => {
    const input = createFrameSchema.parse(request.body);
    const { prisma } = projectDbManager.getActiveProject();
    const created = await createFrameWithTargetStoryState(prisma, input);
    response.status(201).json({
      frame: serializeCreatedFrame(created.frame),
      target: serializeFrameTargetStoryState(created.target),
      diagnostics: created.diagnostics
    });
  }));

  app.put("/api/frames/:frameId", asyncHandler(async (request, response) => {
    const input = updateFrameSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    const frame = await updateFrame(prisma, input);
    response.json(frame);
  }));

  app.put("/api/frames/:frameId/context", asyncHandler(async (request, response) => {
    const input = updateFrameContextSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const { prisma } = projectDbManager.getActiveProject();
    const frame = await updateFrameContext(prisma, input);
    response.json(frame);
  }));

  app.get("/api/frames/:frameId/preview", asyncHandler(async (request, response) => {
    response.json(await previewProductionFrame(requiredParam(request, "frameId")));
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

  app.post("/api/frames/:frameId/export/chatgpt/repair", asyncHandler(async (request, response) => {
    const input = exportGenerationRepairSchema.parse({ ...request.body, frameId: requiredParam(request, "frameId") });
    const exported = await createChatGPTRepairExport(input.frameId, input);
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

  app.get("/api/frames/:frameId/lock-readiness", asyncHandler(async (request, response) => {
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    const readiness = await getFrameLockReadiness(prisma, projectPath, requiredParam(request, "frameId"));
    if (readiness.status === "BLOCKED" && readiness.reasons.includes("FRAME_NOT_FOUND")) throw new AppError("Frame not found.", 404, "NOT_FOUND");
    response.json(readiness);
  }));

  app.post("/api/frames/:frameId/lock", asyncHandler(async (request, response) => {
    const input = lockFrameSchema.parse({ frameId: requiredParam(request, "frameId") });
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    response.json(await lockFrameWithSelectedGeneration(prisma, projectPath, input.frameId));
  }));

  app.post("/api/frames/:frameId/lock-confirmed", asyncHandler(async (request, response) => {
    const input = confirmFrameLockSchema.parse(request.body);
    const { prisma, projectPath } = projectDbManager.getActiveProject();
    response.json(await lockFrameWithConfirmation(prisma, projectPath, requiredParam(request, "frameId"), input));
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
        continue;
      }
      await createFrameWithTargetStoryState(prisma, createFrameSchema.parse({
        sceneId: scene.id,
        sequence: spec.sequence,
        type: "CG",
        action: spec.action,
        camera: spec.camera,
        composition: spec.composition,
        expressionNotes: spec.expressionNotes,
        continuityNotes: `${spec.continuityNotes}\nBenchmark tags: ${spec.tags.join(", ")}.`,
        characterIds: [input.characterId],
        locationId: input.locationId,
        locationAngleId: input.locationAngleId,
        styleProfileId: input.styleProfileId,
        targetWidth: spec.targetWidth,
        targetHeight: spec.targetHeight,
        targetAspectRatio: spec.targetWidth / spec.targetHeight
      }));
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
    response.json({ ...serializeProject(project), rootPath: projectDbManager.getActiveProject().projectPath });
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
      response.status(400).json({ error: "Invalid JSON request.", code: "VALIDATION_ERROR" });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request.", code: "VALIDATION_ERROR", issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) });
      return;
    }
    if (error instanceof FrameStoryStateRecoveryError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code, diagnostics: error.diagnostics });
      return;
    }
    if (error instanceof GenerationReviewError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code, reasons: error.reasons, diagnostics: error.diagnostics });
      return;
    }
    if (error instanceof FrameStoryStateServiceError) {
      response.status(frameStoryStateHttpStatus(error)).json({
        error: error.message,
        code: error.code,
        diagnostics: error.diagnostics
      });
      return;
    }
    if (error instanceof ManualChatGPTExportReadinessError) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        reasons: error.reasons,
        diagnostics: error.diagnostics
      });
      return;
    }
    if (error instanceof ProductionGenerationReadinessError) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        reasons: error.reasons,
        diagnostics: error.diagnostics
      });
      return;
    }
    if (error instanceof AppError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
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

function serializeFrameTargetStoryState(target: PersistedFrameTargetStoryState | InitializedFrameTargetStoryState) {
  return {
    status: target.status,
    id: target.id,
    frameId: target.frameId,
    document: target.document,
    revision: target.revision,
    originType: target.provenance.origin,
    sourceFrameId: "sourceFrameId" in target.provenance ? target.provenance.sourceFrameId : null,
    sourceGenerationId: "sourceGenerationId" in target.provenance ? target.provenance.sourceGenerationId : null,
    explicitlyEditedAt: target.explicitlyEditedAt?.toISOString() ?? null,
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
    ...("diagnostics" in target ? { diagnostics: target.diagnostics } : {})
  };
}

function frameStoryStateHttpStatus(error: FrameStoryStateServiceError): number {
  if (error.code === "FRAME_NOT_FOUND") return 404;
  if (error.code === "DATABASE_ERROR") return 500;
  return 409;
}

function serializeCreatedFrame<T extends {
  continuityEditContract: string;
  characterCastSource: string | null;
  characterCastRevision: number;
  characters: Array<{ characterId: string; order: number }>;
}>(frame: T) {
  const { characters, ...record } = frame;
  return {
    ...record,
    continuityEditContract: JSON.parse(frame.continuityEditContract) as unknown,
    characterIds: [...characters].sort((left, right) => left.order - right.order).map((item) => item.characterId),
    effectiveCharacterIds: [...characters].sort((left, right) => left.order - right.order).map((item) => item.characterId),
    characterCastSource: frame.characterCastSource ?? "LEGACY_UNKNOWN",
    additionalCharacterReferenceIds: {},
    generations: []
  };
}

function serializeProject<T extends { scenes: Array<{
  storyState: { document: string } | null;
  characters?: Array<{ characterId: string; order: number }>;
  frames?: Array<{
    continuityEditContract: string;
    characterCastSource?: string | null;
    characterCastRevision?: number;
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
      frames: scene.frames?.map((frame) => {
        const characterIds = frame.characters?.sort((left, right) => left.order - right.order).map((item) => item.characterId) ?? [];
        const sceneCharacterIds = scene.characters?.sort((left, right) => left.order - right.order).map((item) => item.characterId) ?? [];
        const storyState = scene.storyState ? JSON.parse(scene.storyState.document) as { characters?: Record<string, { present?: boolean }> } : null;
        const legacyStoryIds = Object.entries(storyState?.characters ?? {}).filter(([, state]) => state.present).map(([id]) => id);
        const effectiveCharacterIds = frame.characterCastSource !== null && frame.characterCastSource !== undefined
          ? characterIds
          : characterIds.length ? characterIds : sceneCharacterIds.length ? sceneCharacterIds : legacyStoryIds;
        return ({
        ...frame,
        continuityEditContract: continuityEditContractSchema.parse(JSON.parse(frame.continuityEditContract) as unknown),
        characterIds,
        effectiveCharacterIds,
        characterCastSource: frame.characterCastSource ?? "LEGACY_UNKNOWN",
        additionalCharacterReferenceIds: Object.fromEntries((frame.characters ?? []).map((item) => [
          item.characterId,
          (item.additionalReferences ?? []).sort((left, right) => left.order - right.order).map((selection) => selection.characterReferenceId)
        ]))
      }); }),
      storyState: scene.storyState ? {
        ...scene.storyState,
        document: JSON.parse(scene.storyState.document) as unknown
      } : null
    }))
  };
}
