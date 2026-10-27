import fs from "node:fs/promises";
import path from "node:path";
import type { PhysicalVisualBaseReadiness } from "@bearridge/core";
import type { RecoveryImageAvailability } from "@bearridge/shared";
import { ProjectPathError, resolveProjectFileForRead } from "./projectPathResolver.js";

export async function validateVisualBaseFile(input: {
  projectPath: string;
  filePath: string;
  generationId: string;
}): Promise<PhysicalVisualBaseReadiness> {
  const inspection = await inspectProjectImage(input.projectPath, input.filePath);
  return inspection === "AVAILABLE"
    ? { status: "AVAILABLE", generationId: input.generationId }
    : { status: "UNAVAILABLE", message: imageAvailabilityMessage(inspection) };
}

export async function inspectProjectImage(projectPath: string, filePath: string): Promise<RecoveryImageAvailability> {
  if (!filePath) return "MISSING";
  let absolutePath: string;
  try {
    absolutePath = await resolveProjectFileForRead(projectPath, filePath);
    const file = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension) || !hasMatchingImageSignature(extension, file)) {
      return "UNSUPPORTED_FORMAT";
    }
  } catch (error) {
    if (error instanceof ProjectPathError) {
      if (error.code === "PROJECT_PATH_INVALID" || error.code === "PROJECT_PATH_OUTSIDE_ROOT" || error.code === "LEGACY_PATH_UNRESOLVED") return "INVALID_PATH";
      return error.code === "PROJECT_FILE_MISSING" ? "MISSING" : "UNREADABLE";
    }
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT" ? "MISSING" : "UNREADABLE";
  }
  return "AVAILABLE";
}

function imageAvailabilityMessage(status: RecoveryImageAvailability): string {
  if (status === "INVALID_PATH") return "The Generation image file is outside the project.";
  if (status === "UNSUPPORTED_FORMAT") return "The previous Generation image must be a readable PNG, JPEG, or WEBP file.";
  return "The previous Generation image file is missing or unreadable.";
}

function hasMatchingImageSignature(extension: string, file: Buffer): boolean {
  if (extension === ".png") return file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === ".jpg" || extension === ".jpeg") return file.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return extension === ".webp" && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP";
}
