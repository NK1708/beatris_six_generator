import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { strToU8 } from "fflate";
import type { GenerationRepairContract } from "@bearridge/shared";
import { projectDbManager, type ProjectContext } from "../db.js";
import { AppError } from "../errors.js";
import { savePortableChatGPTPackage } from "./chatGPTExportService.js";
import { resolveProjectFileForRead } from "./projectPathResolver.js";

export async function createChatGPTRepairExport(frameId: string, contract: GenerationRepairContract, createdAt = new Date()) {
  const lease = projectDbManager.acquireActiveProject();
  try {
    return await createChatGPTRepairExportInProject(lease, frameId, contract, createdAt);
  } finally {
    await lease.release();
  }
}

async function createChatGPTRepairExportInProject(
  { prisma, projectPath }: ProjectContext,
  frameId: string,
  contract: GenerationRepairContract,
  createdAt: Date
) {
  const frame = await prisma.frame.findUnique({ where: { id: frameId } });
  if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  const source = await prisma.generation.findUnique({ where: { id: contract.sourceGenerationId } });
  if (!source || source.frameId !== frameId || source.status !== "SUCCESS" || !source.outputFilePath) {
    throw new AppError("Repair source must be a successful Generation of this Frame.", 400, "INVALID_REPAIR_SOURCE");
  }
  let absolute: string;
  const extension = path.extname(source.outputFilePath).toLowerCase();
  if (!/^\.(png|jpe?g|webp)$/u.test(extension)) throw new AppError("Unsupported repair source image.", 400, "INVALID_REPAIR_SOURCE");
  let baseImage: Buffer;
  try {
    absolute = await resolveProjectFileForRead(projectPath, source.outputFilePath);
    baseImage = await fs.readFile(absolute);
  } catch {
    throw new AppError("Repair source image is missing.", 400, "INVALID_REPAIR_SOURCE");
  }
  const exportId = randomUUID();
  const rootName = `${frame.frameCode}_REPAIR_CHATGPT`;
  const baseFileName = `02_AUTHORITATIVE_BASE_${frame.frameCode}${extension}`;
  const prompt = [
    "BEARRIDGE PORTABLE REPAIR REQUEST",
    "",
    "MODE: REPAIR_GENERATION",
    "REQUIRES_CONVERSATION_CONTEXT: FALSE",
    "",
    `The attached file ${baseFileName} is the existing image to correct.`,
    "ROLE: AUTHORITATIVE_BASE",
    "",
    "Perform a localized image edit of the attached image.",
    "",
    "CHANGE ONLY:",
    ...contract.changes.map((change) => `- ${change}`),
    "",
    "FORBIDDEN:",
    ...(contract.forbidden.length ? contract.forbidden.map((rule) => `- ${rule}`) : ["- None specified."]),
    "",
    "Preserve all unaffected parts of the image.",
    "Do not create a new scene.",
    "Do not change the camera or composition.",
    "Do not redesign characters or environment.",
    "Generate one corrected image without explanation."
  ].join("\n");
  const manifest = {
    schemaVersion: 1,
    exportId,
    project: { id: (await prisma.scene.findUniqueOrThrow({ where: { id: frame.sceneId } })).projectId },
    frame: { id: frame.id, code: frame.frameCode },
    strategy: frame.generationStrategy,
    operation: "REPAIR" as const,
    repairContract: contract,
    repairSource: { generationId: source.id, frameId: frame.id, filePath: source.outputFilePath },
    packageType: "CHATGPT_PORTABLE_RENDER" as const,
    packageVersion: 1,
    uploadMode: "INDIVIDUAL_ATTACHMENTS" as const,
    requiresConversationContext: false,
    createdAt: createdAt.toISOString(),
    attachments: [{ fileName: baseFileName, role: "AUTHORITATIVE_BASE", assetId: source.id }],
    geometry: {
      targetWidth: source.targetWidth,
      targetHeight: source.targetHeight,
      targetAspectRatio: source.targetAspectRatio,
      requestAspectRatio: source.aspectRatio,
      requestResolution: source.resolution,
      requiresCrop: source.requiresCrop,
      cropStrategy: source.cropStrategy
    }
  };
  const receipt = {
    exportId,
    createdAt: createdAt.toISOString(),
    manifest,
    fullTargetPrompt: prompt,
    frameSnapshot: JSON.parse(source.frameSnapshot) as unknown,
    storyStateSnapshot: JSON.parse(source.storyStateSnapshot) as unknown,
    supportingReferences: []
  };
  const entries: Record<string, Uint8Array> = {
    [`${rootName}/00_README.txt`]: strToU8([
      "BEARRIDGE CHATGPT MANUAL REPAIR",
      "1. Open a NEW ChatGPT conversation.",
      `2. Upload ${baseFileName} as an individual image attachment.`,
      "3. Copy the entire 01_CHATGPT_PROMPT.txt into ChatGPT and send it.",
      "4. Import the resulting image back into Bearridge using this export."
    ].join("\n")),
    [`${rootName}/01_CHATGPT_PROMPT.txt`]: strToU8(prompt),
    [`${rootName}/${baseFileName}`]: baseImage,
    [`${rootName}/manifest.json`]: strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  };
  const buffer = await savePortableChatGPTPackage(projectPath, rootName, exportId, receipt, entries);
  return { exportId, fileName: `${rootName}.zip`, buffer, manifest, prompt };
}
