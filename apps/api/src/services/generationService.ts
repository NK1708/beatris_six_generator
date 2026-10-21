import fs from "node:fs/promises";
import path from "node:path";
import { detectStructuredContinuityChanges, effectiveAllowedChanges, GenerationGeometryResolver, generationFileName, PromptBuilder, ReferenceResolver } from "@bearridge/core";
import type { GenerationMode, GenerationType, ReferenceAsset } from "@bearridge/shared";
import { config } from "../config.js";
import { projectDbManager } from "../db.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { createImageProvider, getImageProviderCapabilities } from "../providers/providerFactory.js";
import { FileService } from "./fileService.js";
import { loadFrameContext } from "./contextService.js";

const fileService = new FileService();

export async function previewFrame(frameId: string) {
  const context = await loadFrameContext(frameId);
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
    ? await continuationValidationError(context, previousReferences)
    : undefined;
  const warnings = [...resolved.warnings];
  if (continuationError) {
    warnings.push({ code: "INVALID_CONTINUATION_BASE", entityId: frameId, message: continuationError, severity: "blocking" });
  } else if (strategy === "CONTINUE_PREVIOUS_FRAME" && !getImageProviderCapabilities(config.imageProvider).trueEdit) {
    warnings.push({ code: "PROVIDER_EDIT_UNSUPPORTED", entityId: frameId, message: `Provider ${config.imageProvider} does not support true image editing.`, severity: "blocking" });
  }
  return { context, strategy, references, baseReference, deltaInstructions, detectedContinuityChanges, allowedContinuityChanges, warnings, prompt, geometry };
}

export async function generateFrame(frameId: string, mode: GenerationMode, generationType: GenerationType = "INITIAL") {
  const started = Date.now();
  const preview = await previewFrame(frameId);
  const blockingWarnings = preview.warnings.filter((warning) => warning.severity === "blocking");
  if (mode === "production" && blockingWarnings.length) {
    throw new AppError(`Production generation blocked: ${blockingWarnings.map((warning) => warning.message).join(" ")}`, 400, "PRODUCTION_CONTEXT_INCOMPLETE");
  }
  const { prisma } = projectDbManager.getActiveProject();
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
  const absoluteOutputPath = path.join(project.rootPath, relativeOutputPath);

  const provider = createImageProvider({
    provider: config.imageProvider,
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    model,
    outputFilePath: absoluteOutputPath,
    rootPath: project.rootPath
  });
  if (preview.strategy === "CONTINUE_PREVIOUS_FRAME") {
    const continuationWarning = preview.warnings.find((warning) => warning.code === "INVALID_CONTINUATION_BASE");
    if (continuationWarning) throw new AppError(continuationWarning.message, 400, "INVALID_CONTINUATION_BASE");
    if (!provider.capabilities.trueEdit) {
      throw new AppError(`Provider ${config.imageProvider} does not support true image editing.`, 400, "PROVIDER_EDIT_UNSUPPORTED");
    }
  }

  const generation = await prisma.generation.create({
    data: {
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
      storyStateSnapshot: JSON.stringify(preview.context.storyState),
      frameSnapshot: JSON.stringify(preview.context.frame)
    }
  });

  await prisma.frame.update({ where: { id: frameId }, data: { status: "GENERATING" } });

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
      providerMetadata: result.rawMetadata
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
    await fileService.writeJsonBeside(project.rootPath, result.outputFilePath, {
      provider: result.provider,
      model: result.model,
      frame: preview.context.frame.frameCode,
      references: preview.references.map((reference) => reference.code),
      referenceRoles: preview.references.map((reference) => ({
        code: reference.code,
        kind: reference.kind,
        role: reference.role ?? null
      })),
      storyState: preview.context.storyState,
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
    await prisma.frame.update({ where: { id: frameId }, data: { status: "REVIEW" } });

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
        rawMetadata: JSON.stringify({ message: error instanceof Error ? error.message : "Unknown generation error" })
      }
    });
    await prisma.frame.update({ where: { id: frameId }, data: { status: "DRAFT" } });
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

async function continuationValidationError(context: Awaited<ReturnType<typeof loadFrameContext>>, previousReferences: ReferenceAsset[]): Promise<string | undefined> {
  if (!context.frame.previousFrameId) return "Continue previous frame requires a previous Frame.";
  const { prisma, projectPath } = projectDbManager.getActiveProject();
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
  const absolutePath = path.isAbsolute(selected.outputFilePath) ? selected.outputFilePath : path.join(projectPath, selected.outputFilePath);
  try {
    const file = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension) || !hasMatchingImageSignature(extension, file)) {
      return "The previous Generation image must be a readable PNG, JPEG, or WEBP file.";
    }
  } catch {
    return "The previous Generation image file is missing or unreadable.";
  }
  return undefined;
}

function hasMatchingImageSignature(extension: string, file: Buffer): boolean {
  if (extension === ".png") return file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === ".jpg" || extension === ".jpeg") return file.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return extension === ".webp" && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP";
}
