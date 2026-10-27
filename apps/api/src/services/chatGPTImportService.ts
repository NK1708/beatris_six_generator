import fs from "node:fs/promises";
import path from "node:path";
import { importChatGPTResultSchema } from "@bearridge/shared";
import type { GenerationRepairContract } from "@bearridge/shared";
import { projectDbManager, type ProjectContext } from "../db.js";
import { AppError, ValidationError } from "../errors.js";
import { resolveProjectDirectoryForWrite, resolveProjectFileForRead, resolveProjectFileForWrite } from "./projectPathResolver.js";

interface ExportReceipt {
  exportId: string;
  createdAt: string;
  renderProtocol?: {
    version: number;
    promptPolicy: string;
    basePolicy: string;
    referencePolicy: string;
    allowPromptRewrite: boolean;
    allowSceneReinterpretation: boolean;
  };
  manifest: {
    schemaVersion: number;
    exportId: string;
    strategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME";
    continuityEditContract?: unknown;
    renderProtocol?: {
      version: number;
      promptPolicy: string;
      basePolicy: string;
      referencePolicy: string;
      allowPromptRewrite: boolean;
      allowSceneReinterpretation: boolean;
    };
    frame: { id: string; code: string };
    operation?: "REPAIR";
    repairContract?: GenerationRepairContract;
    repairSource?: { generationId: string; frameId: string; filePath: string };
    base?: { frameId: string; generationId: string; frameCode: string; filename: string };
    geometry: {
      targetWidth: number | null;
      targetHeight: number | null;
      targetAspectRatio: number;
      requestAspectRatio: string;
      requestResolution: string;
      requiresCrop: boolean;
      cropStrategy: string;
    };
  };
  fullTargetPrompt: string;
  frameSnapshot: unknown;
  storyStateSnapshot: unknown;
  supportingReferences: Array<{
    id: string; code: string; kind: string; filePath: string; priority: number; role: string | null;
  }>;
  visualReferencesActuallyExported?: string[];
}

export async function listChatGPTExports(frameId: string) {
  const lease = projectDbManager.acquireActiveProject();
  try {
    return await listChatGPTExportsInProject(lease, frameId);
  } finally {
    await lease.release();
  }
}

async function listChatGPTExportsInProject({ projectPath }: ProjectContext, frameId: string) {
  const directory = path.join(projectPath, "exports", "chatgpt");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const receipts = await Promise.all(names.filter((name) => /^[0-9a-f-]+\.json$/iu.test(name)).map(async (name) => {
    try { return await readReceipt(projectPath, path.basename(name, ".json")); } catch { return null; }
  }));
  return receipts.filter((receipt): receipt is ExportReceipt => Boolean(receipt?.manifest.frame.id === frameId))
    .map((receipt) => ({
      exportId: receipt.exportId,
      createdAt: receipt.createdAt,
      strategy: receipt.manifest.strategy,
      frameCode: receipt.manifest.frame.code,
      baseFrameCode: receipt.manifest.base?.frameCode ?? null,
      operation: receipt.manifest.operation ?? null,
      repairSourceGenerationId: receipt.manifest.repairSource?.generationId ?? null
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function importChatGPTResult(rawInput: unknown) {
  const input = importChatGPTResultSchema.parse(rawInput);
  const lease = projectDbManager.acquireActiveProject();
  try {
    return await importChatGPTResultInProject(lease, input);
  } finally {
    await lease.release();
  }
}

async function importChatGPTResultInProject(
  { prisma, projectPath }: ProjectContext,
  input: ReturnType<typeof importChatGPTResultSchema.parse>
) {
  const frame = await prisma.frame.findUnique({ where: { id: input.frameId } });
  if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  const receipt = await readReceipt(projectPath, input.exportId);
  if (receipt.exportId !== input.exportId || receipt.manifest.exportId !== input.exportId || receipt.manifest.frame.id !== frame.id || receipt.manifest.frame.code !== frame.frameCode) {
    throw new ValidationError("The selected ChatGPT export does not belong to this Frame.");
  }
  if (receipt.manifest.operation !== "REPAIR" && receipt.manifest.strategy !== frame.generationStrategy) {
    throw new ValidationError("Frame generation strategy has changed since this ChatGPT export was created.");
  }

  let parentGenerationId: string | null = null;
  let baseImagePath: string | null = null;
  if (receipt.manifest.operation === "REPAIR") {
    const sourceId = receipt.manifest.repairSource?.generationId;
    const source = sourceId ? await prisma.generation.findUnique({ where: { id: sourceId } }) : null;
    if (!source || source.frameId !== frame.id || source.status !== "SUCCESS" || !source.outputFilePath ||
        receipt.manifest.repairSource?.frameId !== frame.id || receipt.manifest.repairContract?.sourceGenerationId !== source.id ||
        receipt.manifest.repairSource.filePath !== source.outputFilePath) {
      throw new ValidationError("Repair source provenance is no longer valid for this Frame.");
    }
    await assertReadableProjectImage(projectPath, source.outputFilePath);
    parentGenerationId = source.id;
    baseImagePath = source.outputFilePath;
  } else if (receipt.manifest.strategy === "CONTINUE_PREVIOUS_FRAME") {
    const base = receipt.manifest.base;
    if (!base || !frame.previousFrameId || base.frameId !== frame.previousFrameId) {
      throw new ValidationError("Continuation export base does not match the current previous Frame.");
    }
    const previous = await prisma.frame.findUnique({ where: { id: frame.previousFrameId }, include: { generations: true } });
    const selected = previous?.generations.find((generation) => generation.id === previous.selectedGenerationId);
    if (!previous || previous.status !== "LOCKED" || !selected || selected.status !== "SUCCESS" || selected.id !== base.generationId || !selected.outputFilePath) {
      throw new ValidationError("Continuation base provenance is no longer valid.");
    }
    await assertReadableProjectImage(projectPath, selected.outputFilePath);
    parentGenerationId = selected.id;
    baseImagePath = selected.outputFilePath;
  }

  const image = decodeImage(input.dataUrl);
  const sequence = await prisma.generation.count({ where: { frameId: frame.id } }) + 1;
  const extension = extensionForMime(image.mimeType);
  const relativePath = path.posix.join("generations", frame.frameCode, `${frame.frameCode}_CHATGPT_G${String(sequence).padStart(3, "0")}.${extension}`);
  const absolutePath = await resolveProjectFileForWrite(projectPath, relativePath);
  const temporaryPath = await resolveProjectFileForWrite(projectPath, `${relativePath}.importing`);
  const sidecarRelativePath = relativePath.replace(/\.[^.]+$/u, ".json");
  const sidecarPath = await resolveProjectFileForWrite(projectPath, sidecarRelativePath);
  await fs.mkdir(await resolveProjectDirectoryForWrite(projectPath, path.posix.dirname(relativePath)), { recursive: true });
  await fs.writeFile(temporaryPath, image.buffer);
  await fs.rename(temporaryPath, absolutePath);

  const now = new Date();
  const rawMetadata = {
    source: "ChatGPT manual import",
    manualImport: true,
    exportId: receipt.exportId,
    exportSchemaVersion: receipt.manifest.schemaVersion,
    importTimestamp: now.toISOString(),
    originalFileName: path.basename(input.fileName),
    inputMimeType: image.mimeType,
    strategy: receipt.manifest.strategy,
    operation: receipt.manifest.operation ?? null,
    repairContract: receipt.manifest.repairContract ?? null,
    repairSourceGenerationId: receipt.manifest.repairSource?.generationId ?? null,
    renderProtocol: receipt.renderProtocol ?? receipt.manifest.renderProtocol ?? null,
    baseFrameId: receipt.manifest.base?.frameId ?? null,
    baseGenerationId: receipt.manifest.base?.generationId ?? null,
    productionReferenceIds: receipt.supportingReferences.map((reference) => reference.id),
    visualReferenceIds: receipt.visualReferencesActuallyExported ?? receipt.supportingReferences.map((reference) => reference.id),
    supportingReferenceIds: receipt.supportingReferences.map((reference) => reference.id),
    continuityEditContract: receipt.manifest.continuityEditContract ?? null,
    provenanceNote: "Production references preserve Bearridge context provenance; visual reference IDs identify files actually included in the ChatGPT package. Neither is ChatGPT renderer telemetry."
  };

  try {
    await fs.writeFile(sidecarPath, JSON.stringify(rawMetadata, null, 2), "utf8");
    const generation = await prisma.$transaction(async (tx) => {
      const created = await tx.generation.create({
        data: {
          frameId: frame.id,
          provider: "chatgpt-manual",
          model: "chatgpt-manual",
          prompt: receipt.fullTargetPrompt,
          status: "SUCCESS",
          outputFilePath: relativePath,
          resolution: receipt.manifest.geometry.requestResolution,
          aspectRatio: receipt.manifest.geometry.requestAspectRatio,
          targetWidth: receipt.manifest.geometry.targetWidth,
          targetHeight: receipt.manifest.geometry.targetHeight,
          targetAspectRatio: receipt.manifest.geometry.targetAspectRatio,
          requiresCrop: receipt.manifest.geometry.requiresCrop,
          cropStrategy: receipt.manifest.geometry.cropStrategy,
          parentGenerationId,
          generationType: receipt.manifest.operation === "REPAIR" ? "REPAIR" : receipt.manifest.strategy === "CONTINUE_PREVIOUS_FRAME" ? "EDIT" : "INITIAL",
          rawMetadata: JSON.stringify(rawMetadata),
          storyStateSnapshot: JSON.stringify(receipt.storyStateSnapshot),
          frameSnapshot: JSON.stringify(receipt.frameSnapshot),
          createdAt: now,
          completedAt: now
        }
      });
      await tx.generationReference.createMany({ data: [
        ...(baseImagePath ? [{
          generationId: created.id,
          referenceKind: receipt.manifest.operation === "REPAIR" ? "base-repair-generation" : "base-previous-frame",
          referenceId: parentGenerationId!,
          code: receipt.manifest.operation === "REPAIR" ? frame.frameCode : receipt.manifest.base!.frameCode,
          filePath: baseImagePath, priority: 0
        }] : []),
        ...receipt.supportingReferences.map((reference) => ({
          generationId: created.id, referenceKind: reference.kind, referenceId: reference.id,
          code: reference.code, filePath: reference.filePath, priority: reference.priority
        }))
      ] });
      await tx.frame.updateMany({ where: { id: frame.id, status: { not: "LOCKED" } }, data: { status: "REVIEW" } });
      return created;
    });
    return prisma.generation.findUnique({ where: { id: generation.id }, include: { references: true } });
  } catch (error) {
    await fs.rm(absolutePath, { force: true });
    await fs.rm(sidecarPath, { force: true });
    throw error;
  }
}

async function readReceipt(projectPath: string, exportId: string): Promise<ExportReceipt> {
  if (!/^[0-9a-f-]{36}$/iu.test(exportId)) throw new ValidationError("Invalid ChatGPT export ID.");
  try {
    return JSON.parse(await fs.readFile(await resolveProjectFileForRead(projectPath, `exports/chatgpt/${exportId}.json`), "utf8")) as ExportReceipt;
  } catch {
    throw new AppError("ChatGPT export provenance was not found.", 404, "NOT_FOUND");
  }
}

function decodeImage(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(?<data>[A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match?.[1] || !match.groups?.data) throw new ValidationError("Import must be a PNG, JPEG, or WEBP data URL.");
  const buffer = Buffer.from(match.groups.data, "base64");
  const detected = detectMime(buffer);
  if (detected !== match[1]) throw new ValidationError("Imported image MIME type does not match its file signature.");
  return { mimeType: detected, buffer };
}

function detectMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

function extensionForMime(mime: string): string { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"; }

async function assertReadableProjectImage(projectPath: string, relativePath: string): Promise<void> {
  const absolute = await resolveProjectFileForRead(projectPath, relativePath);
  const data = await fs.readFile(absolute);
  if (!detectMime(data)) throw new ValidationError("Base image is missing or unsupported.");
}
