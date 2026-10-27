import path from "node:path";
import type { Prisma } from "@prisma/client";
import { detectStructuredContinuityChanges, effectiveAllowedChanges, GenerationGeometryResolver, generationFileName, PromptBuilder, ReferenceResolver } from "@bearridge/core";
import type { FrameGenerationReadiness, GenerationMode, GenerationType, ImageProvider, ReferenceAsset } from "@bearridge/shared";
import { config } from "../config.js";
import { projectDbManager, type ProjectContext } from "../db.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { createImageProvider, getImageProviderCapabilities, type ImageProviderFactoryOptions } from "../providers/providerFactory.js";
import { FileService } from "./fileService.js";
import { loadFrameContext } from "./contextService.js";
import { validateVisualBaseFile } from "./visualBaseValidation.js";
import { resolveFrameGenerationReadinessForProject } from "./frameGenerationReadinessService.js";
import { assertReadinessTokenCurrent, ProductionGenerationGate } from "./productionGenerationGate.js";
import { prepareProductionGenerationContext, type PreparedProductionGenerationContext } from "./productionGenerationContext.js";
import { resolveProjectFileForWrite } from "./projectPathResolver.js";

const fileService = new FileService();

export interface GenerationServiceDependencies {
  createProvider(options: ImageProviderFactoryOptions): ImageProvider;
  resolveReadiness(prisma: Parameters<typeof resolveFrameGenerationReadinessForProject>[0], projectPath: string, frameId: string): Promise<FrameGenerationReadiness>;
  beforeGenerationClaim?(): Promise<void>;
}

const defaultDependencies: GenerationServiceDependencies = {
  createProvider: createImageProvider,
  resolveReadiness: resolveFrameGenerationReadinessForProject
};

export async function previewFrame(frameId: string) {
  const lease = projectDbManager.acquireActiveProject();
  try {
    const context = await loadFrameContext(frameId, lease);
    return previewFrameContext(context, lease);
  } finally {
    await lease.release();
  }
}

export async function previewProductionFrame(
  frameId: string,
  dependencies: Pick<GenerationServiceDependencies, "resolveReadiness"> = defaultDependencies
) {
  const lease = projectDbManager.acquireActiveProject();
  try {
    const readiness = await new ProductionGenerationGate(() => dependencies.resolveReadiness(
      lease.prisma,
      lease.projectPath,
      frameId
    )).open();
    const prepared = prepareProductionGenerationContext(await loadFrameContext(frameId, lease), readiness);
    return { ...await previewFrameContext(prepared.context, lease), productionTarget: productionTargetMetadata(prepared) };
  } finally {
    await lease.release();
  }
}

export async function previewFrameContext(
  context: Awaited<ReturnType<typeof loadFrameContext>>,
  projectContext: ProjectContext = projectDbManager.getActiveProject()
) {
  const resolved = new ReferenceResolver().resolve(context);
  const model = config.imageProvider === "openai" ? config.openaiImageModel : context.project.defaultDraftModel;
  const geometry = new GenerationGeometryResolver().resolve({
    targetWidth: context.frame.targetWidth ?? undefined,
    targetHeight: context.frame.targetHeight ?? undefined,
    targetAspectRatio: context.frame.targetAspectRatio ?? undefined,
    provider: config.imageProvider,
    model,
    fallbackAspectRatio: context.project.defaultAspectRatio,
    fallbackResolution: context.project.defaultResolution
  });
  const strategy = context.frame.generationStrategy;
  const previousReferences = resolved.references.filter((reference) => reference.kind === "previous-frame");
  const baseReference = strategy === "CONTINUE_PREVIOUS_FRAME" && previousReferences.length === 1
    ? previousReferences[0]
    : undefined;
  const references = strategy === "CONTINUE_PREVIOUS_FRAME"
    ? resolved.references.filter((reference) => reference.kind !== "previous-frame")
    : resolved.references;
  const prompt = new PromptBuilder().build(context, references, geometry);
  const deltaInstructions = strategy === "CONTINUE_PREVIOUS_FRAME"
    ? new PromptBuilder().buildContinuationInstructions(context)
    : undefined;
  const detectedContinuityChanges = strategy === "CONTINUE_PREVIOUS_FRAME"
    ? detectStructuredContinuityChanges(
        context.previousStoryState,
        context.storyState,
        Object.fromEntries(context.characters.map((character) => [character.id, character.name]))
      )
    : [];
  const allowedContinuityChanges = effectiveAllowedChanges(detectedContinuityChanges, context.frame.continuityEditContract.allowedChanges);
  const continuationError = strategy === "CONTINUE_PREVIOUS_FRAME"
    ? await continuationValidationError(context, previousReferences, projectContext)
    : undefined;
  const warnings = [...resolved.warnings];
  if (continuationError) {
    warnings.push({ code: "INVALID_CONTINUATION_BASE", entityId: context.frame.id, message: continuationError, severity: "blocking" });
  } else if (strategy === "CONTINUE_PREVIOUS_FRAME" && !getImageProviderCapabilities(config.imageProvider).trueEdit) {
    warnings.push({ code: "PROVIDER_EDIT_UNSUPPORTED", entityId: context.frame.id, message: `Provider ${config.imageProvider} does not support true image editing.`, severity: "blocking" });
  }
  return { context, strategy, references, baseReference, deltaInstructions, detectedContinuityChanges, allowedContinuityChanges, warnings, prompt, geometry };
}

export async function generateFrame(
  frameId: string,
  mode: GenerationMode,
  generationType: GenerationType = "INITIAL",
  dependencies: GenerationServiceDependencies = defaultDependencies
) {
  const lease = projectDbManager.acquireActiveProject();
  try {
    return await generateFrameInProject(lease, frameId, mode, generationType, dependencies);
  } finally {
    await lease.release();
  }
}

async function generateFrameInProject(
  activeProject: ProjectContext,
  frameId: string,
  mode: GenerationMode,
  generationType: GenerationType,
  dependencies: GenerationServiceDependencies
) {
  const started = Date.now();
  const productionGate = mode === "production"
    ? new ProductionGenerationGate(() => dependencies.resolveReadiness(
        activeProject.prisma,
        activeProject.projectPath,
        frameId
      ))
    : undefined;
  const initialReadiness = productionGate ? await productionGate.open() : undefined;
  const preparedProduction = initialReadiness
    ? prepareProductionGenerationContext(await loadFrameContext(frameId, activeProject), initialReadiness)
    : undefined;
  const preview = preparedProduction
    ? await previewFrameContext(preparedProduction.context)
    : await previewFrameContext(await loadFrameContext(frameId, activeProject), activeProject);
  const blockingWarnings = preview.warnings.filter((warning) => warning.severity === "blocking");
  if (mode === "production" && blockingWarnings.length) {
    throw new AppError(`Production generation blocked: ${blockingWarnings.map((warning) => warning.message).join(" ")}`, 400, "PRODUCTION_CONTEXT_INCOMPLETE");
  }
  const { prisma } = activeProject;
  const project = await prisma.project.findUnique({ where: { id: preview.context.project.id } });
  if (!project) {
    throw new AppError("Project not found.", 404, "NOT_FOUND");
  }

  const existingCount = await prisma.generation.count({ where: { frameId } });
  const configuredModel = mode === "production" ? project.defaultProductionModel : project.defaultDraftModel;
  const model = config.imageProvider === "openai" ? config.openaiImageModel : configuredModel;
  const effectiveGenerationType: GenerationType = preview.strategy === "CONTINUE_PREVIOUS_FRAME" ? "EDIT" : generationType;
  const fileName = generationFileName(preview.context.frame.frameCode, existingCount + 1, effectiveGenerationType);
  const relativeOutputPath = path.posix.join("generations", preview.context.frame.frameCode, fileName);
  const projectRoot = activeProject.projectPath;
  const absoluteOutputPath = await resolveProjectFileForWrite(projectRoot, relativeOutputPath);

  const provider = dependencies.createProvider({
    provider: config.imageProvider,
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    model,
    outputFilePath: absoluteOutputPath,
    rootPath: projectRoot,
    legacyRootPath: project.rootPath
  });
  if (preview.strategy === "CONTINUE_PREVIOUS_FRAME") {
    const continuationWarning = preview.warnings.find((warning) => warning.code === "INVALID_CONTINUATION_BASE");
    if (continuationWarning) throw new AppError(continuationWarning.message, 400, "INVALID_CONTINUATION_BASE");
    if (!provider.capabilities.trueEdit) {
      throw new AppError(`Provider ${config.imageProvider} does not support true image editing.`, 400, "PROVIDER_EDIT_UNSUPPORTED");
    }
  }

  const confirmedReadiness = productionGate && initialReadiness
    ? await productionGate.revalidate(initialReadiness)
    : undefined;
  await dependencies.beforeGenerationClaim?.();
  const generationData = {
      frameId,
      provider: config.imageProvider,
      model,
      prompt: preview.prompt,
      status: "RUNNING",
      outputFilePath: "",
      resolution: preview.geometry.requestedResolution,
      aspectRatio: preview.geometry.requestedAspectRatio,
      targetWidth: preview.context.frame.targetWidth,
      targetHeight: preview.context.frame.targetHeight,
      targetAspectRatio: preview.geometry.targetAspectRatio,
      requiresCrop: preview.geometry.requiresCrop,
      cropStrategy: preview.geometry.cropStrategy,
      generationType: effectiveGenerationType,
      parentGenerationId: preview.strategy === "CONTINUE_PREVIOUS_FRAME" ? (preview.context.previousLockedFrame?.generationId ?? null) : null,
      storyStateSnapshot: JSON.stringify(preparedProduction?.targetStoryState ?? preview.context.storyState),
      frameSnapshot: JSON.stringify(preview.context.frame),
      rawMetadata: preparedProduction
        ? JSON.stringify({ productionTarget: productionTargetMetadata(preparedProduction) })
        : null
  };
  const generation = confirmedReadiness
    ? await prisma.$transaction(async (transaction) => {
        await assertReadinessTokenCurrent(transaction, confirmedReadiness);
        await claimFrameForGeneration(transaction, frameId, preview.context.frameTargetStoryState, preview.context.frame.characterCastRevision ?? 0);
        const created = await transaction.generation.create({ data: generationData });
        return created;
      })
    : await prisma.$transaction(async (transaction) => {
        await claimFrameForGeneration(transaction, frameId, preview.context.frameTargetStoryState, preview.context.frame.characterCastRevision ?? 0);
        const created = await transaction.generation.create({ data: generationData });
        return created;
      });

  try {
    const request = {
      prompt: preview.prompt,
      references: preview.references,
      aspectRatio: preview.geometry.requestedAspectRatio,
      resolution: preview.geometry.requestedResolution,
      mode,
      frameId,
      geometry: preview.geometry
    };
    const result = preview.strategy === "CONTINUE_PREVIOUS_FRAME"
      ? await provider.edit({
          ...request,
          baseImagePath: preview.baseReference!.filePath,
          repairInstructions: preview.deltaInstructions!
        })
      : await provider.generate(request);

    const provenanceMetadata = {
      strategy: preview.strategy,
      baseFrameId: preview.context.previousLockedFrame?.id ?? null,
      baseGenerationId: preview.context.previousLockedFrame?.generationId ?? null,
      baseImagePath: preview.baseReference?.filePath ?? null,
      supportingReferenceIds: preview.references.map((reference) => reference.id),
      deltaInstructions: preview.deltaInstructions ?? null,
      providerMetadata: result.rawMetadata,
      ...(preparedProduction ? { productionTarget: productionTargetMetadata(preparedProduction) } : {})
    };

    const successData = {
      status: "SUCCESS",
      provider: result.provider,
      model: result.model,
      outputFilePath: result.outputFilePath,
      rawMetadata: JSON.stringify(provenanceMetadata),
      estimatedCost: result.estimatedCost ?? null,
      completedAt: result.createdAt
    };
    await prisma.generation.update({
      where: { id: generation.id },
      data: successData
    });
    await prisma.generationReference.createMany({
      data: [
        ...(preview.baseReference && preview.context.previousLockedFrame ? [{
          generationId: generation.id,
          referenceKind: "base-previous-frame",
          referenceId: preview.context.previousLockedFrame.generationId,
          code: preview.context.previousLockedFrame.frameCode,
          filePath: preview.baseReference.filePath,
          priority: 0
        }] : []),
        ...preview.references.map((reference) => ({
        generationId: generation.id,
        referenceKind: reference.kind,
        referenceId: reference.id,
        code: reference.code,
        filePath: reference.filePath,
        priority: reference.priority
        }))
      ]
    });
    await fileService.writeJsonBeside(projectRoot, result.outputFilePath, {
      provider: result.provider,
      model: result.model,
      frame: preview.context.frame.frameCode,
      references: preview.references.map((reference) => reference.code),
      referenceRoles: preview.references.map((reference) => ({
        code: reference.code,
        kind: reference.kind,
        role: reference.role ?? null
      })),
      storyState: preparedProduction?.targetStoryState ?? preview.context.storyState,
      ...(preparedProduction ? { productionTarget: productionTargetMetadata(preparedProduction) } : {}),
      frameSnapshot: preview.context.frame,
      strategy: preview.strategy,
      baseFrameId: preview.context.previousLockedFrame?.id ?? null,
      baseGenerationId: preview.context.previousLockedFrame?.generationId ?? null,
      baseImagePath: preview.baseReference?.filePath ?? null,
      deltaInstructions: preview.deltaInstructions ?? null,
      geometry: {
        targetWidth: preview.context.frame.targetWidth,
        targetHeight: preview.context.frame.targetHeight,
        targetAspectRatio: preview.geometry.targetAspectRatio,
        generationAspectRatio: preview.geometry.requestedAspectRatio,
        generationResolution: preview.geometry.requestedResolution,
        requiresCrop: preview.geometry.requiresCrop,
        cropStrategy: preview.geometry.cropStrategy
      },
      timestamp: result.createdAt.toISOString()
    });
    await prisma.frame.updateMany({ where: { id: frameId, status: { not: "LOCKED" } }, data: { status: "REVIEW" } });

    logger.info({
      frameId,
      provider: result.provider,
      model,
      numberOfReferences: preview.references.length,
      resolution: preview.geometry.requestedResolution,
      duration: Date.now() - started,
      success: true
    }, "generation completed");

    return prisma.generation.findUnique({ where: { id: generation.id }, include: { references: true } });
  } catch (error) {
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        status: "FAILED",
        rawMetadata: JSON.stringify({
          message: error instanceof Error ? error.message : "Unknown generation error",
          ...(preparedProduction ? { productionTarget: productionTargetMetadata(preparedProduction) } : {})
        })
      }
    });
    await prisma.frame.updateMany({ where: { id: frameId, status: { not: "LOCKED" } }, data: { status: "DRAFT" } });
    logger.error({
      frameId,
      provider: config.imageProvider,
      model,
      numberOfReferences: preview.references.length,
      resolution: preview.geometry.requestedResolution,
      duration: Date.now() - started,
      success: false
    }, "generation failed");
    throw error;
  }
}

async function claimFrameForGeneration(
  prisma: Prisma.TransactionClient,
  frameId: string,
  target: Awaited<ReturnType<typeof loadFrameContext>>["frameTargetStoryState"],
  characterCastRevision: number
): Promise<void> {
  const claimed = target.status === "AVAILABLE"
    ? await prisma.$executeRaw`
        UPDATE "Frame"
        SET "status" = 'GENERATING', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${frameId}
          AND "status" IN ('DRAFT', 'REVIEW', 'REJECTED')
          AND "characterCastRevision" = ${characterCastRevision}
          AND EXISTS (
            SELECT 1 FROM "FrameStoryState"
            WHERE "FrameStoryState"."frameId" = "Frame"."id"
              AND "FrameStoryState"."revision" = ${target.revision}
          )`
    : target.status === "MISSING"
      ? await prisma.$executeRaw`
          UPDATE "Frame"
          SET "status" = 'GENERATING', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${frameId}
            AND "status" IN ('DRAFT', 'REVIEW', 'REJECTED')
            AND "characterCastRevision" = ${characterCastRevision}
            AND NOT EXISTS (
              SELECT 1 FROM "FrameStoryState"
              WHERE "FrameStoryState"."frameId" = "Frame"."id"
            )`
      : await prisma.$executeRaw`
          UPDATE "Frame"
          SET "status" = 'GENERATING', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${frameId}
            AND "status" IN ('DRAFT', 'REVIEW', 'REJECTED')
            AND "characterCastRevision" = ${characterCastRevision}
            AND EXISTS (
              SELECT 1 FROM "FrameStoryState"
              WHERE "FrameStoryState"."frameId" = "Frame"."id"
            )`;
  if (claimed !== 1) {
    throw new AppError("Frame status or target Story State changed before generation start.", 409, "GENERATION_START_CONFLICT");
  }
}

function productionTargetMetadata(prepared: PreparedProductionGenerationContext) {
  return {
    revision: prepared.targetRevision,
    provenance: prepared.targetProvenance,
    fingerprint: prepared.targetFingerprint,
    selectedPredecessorGenerationId: prepared.selectedPredecessorGenerationId ?? null
  };
}

async function continuationValidationError(
  context: Awaited<ReturnType<typeof loadFrameContext>>,
  previousReferences: ReferenceAsset[],
  projectContext: ProjectContext
): Promise<string | undefined> {
  if (!context.frame.previousFrameId) return "Continue previous frame requires a previous Frame.";
  const { prisma, projectPath } = projectContext;
  const previous = await prisma.frame.findUnique({
    where: { id: context.frame.previousFrameId },
    include: { generations: true }
  });
  if (!previous) return "The previous Frame no longer exists.";
  if (previous.status !== "LOCKED") return "The previous Frame must be LOCKED.";
  if (!previous.selectedGenerationId) return "The previous Frame has no selected Generation.";
  const selected = previous.generations.find((item) => item.id === previous.selectedGenerationId);
  if (!selected) return "The selected previous Generation no longer exists.";
  if (selected.status !== "SUCCESS") return "The selected previous Generation is not successful.";
  if (!selected.outputFilePath) return "The selected previous Generation has no output image.";
  if (previousReferences.length !== 1) return "Exactly one usable previous-frame reference is required.";
  const physical = await validateVisualBaseFile({ projectPath, filePath: selected.outputFilePath, generationId: selected.id });
  return physical.status === "UNAVAILABLE" ? physical.message : undefined;
}
