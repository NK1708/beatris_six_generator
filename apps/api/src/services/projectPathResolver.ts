import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors.js";

export type ProjectPathErrorCode =
  | "PROJECT_PATH_INVALID"
  | "PROJECT_PATH_OUTSIDE_ROOT"
  | "PROJECT_FILE_MISSING"
  | "PROJECT_FILE_UNREADABLE"
  | "LEGACY_PATH_UNRESOLVED";

export class ProjectPathError extends AppError {
  constructor(code: ProjectPathErrorCode, message: string, statusCode = 400) {
    super(message, statusCode, code);
    this.name = "ProjectPathError";
  }
}

export interface StoredProjectPathOptions {
  legacyRootPath?: string;
}

export async function resolveProjectFileForRead(
  projectRoot: string,
  storedPath: string,
  options: StoredProjectPathOptions = {}
): Promise<string> {
  const candidate = await resolveLexicalProjectPath(projectRoot, storedPath, options);
  let realCandidate: string;
  try {
    realCandidate = await fs.realpath(candidate);
  } catch (error) {
    const code = nodeErrorCode(error);
    throw new ProjectPathError(
      code === "ENOENT" ? "PROJECT_FILE_MISSING" : "PROJECT_FILE_UNREADABLE",
      code === "ENOENT" ? "The requested project file does not exist." : "The requested project file is not readable.",
      code === "ENOENT" ? 404 : 400
    );
  }
  await assertRealPathInsideRoot(projectRoot, realCandidate);
  return realCandidate;
}

export async function resolveProjectFileForWrite(projectRoot: string, relativePath: string): Promise<string> {
  const candidate = await resolveLexicalProjectPath(projectRoot, relativePath);
  const existingParent = await nearestExistingParent(path.dirname(candidate));
  await assertRealPathInsideRoot(projectRoot, await fs.realpath(existingParent));
  return candidate;
}

export async function resolveProjectDirectoryForWrite(projectRoot: string, relativePath: string): Promise<string> {
  const candidate = await resolveLexicalProjectPath(projectRoot, relativePath);
  const existingParent = await nearestExistingParent(candidate);
  await assertRealPathInsideRoot(projectRoot, await fs.realpath(existingParent));
  return candidate;
}

export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(absolutePath));
  if (!isContainedRelative(relative) || relative === "") {
    throw new ProjectPathError("PROJECT_PATH_OUTSIDE_ROOT", "The project file path is outside the active project.");
  }
  return relative.replaceAll("\\", "/");
}

async function resolveLexicalProjectPath(
  projectRoot: string,
  storedPath: string,
  options: StoredProjectPathOptions = {}
): Promise<string> {
  if (!projectRoot.trim() || !storedPath.trim() || storedPath.includes("\0")) {
    throw new ProjectPathError("PROJECT_PATH_INVALID", "The project file path is invalid.");
  }
  const root = path.resolve(projectRoot);
  let relativePath = storedPath.replaceAll("\\", "/");
  if (isAbsoluteOnAnyPlatform(storedPath)) {
    if (!options.legacyRootPath) {
      throw new ProjectPathError("PROJECT_PATH_INVALID", "Absolute project file paths are not accepted.");
    }
    const rebased = legacyRelativeSuffix(options.legacyRootPath, storedPath);
    if (!rebased) {
      throw new ProjectPathError("LEGACY_PATH_UNRESOLVED", "The legacy project file path cannot be resolved safely.");
    }
    relativePath = rebased;
  }
  const candidate = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, candidate);
  if (!isContainedRelative(relative) || relative === "") {
    throw new ProjectPathError("PROJECT_PATH_OUTSIDE_ROOT", "The project file path is outside the active project.");
  }
  return candidate;
}

function legacyRelativeSuffix(legacyRootPath: string, storedPath: string): string | undefined {
  const flavor = looksLikeWindowsPath(legacyRootPath) || looksLikeWindowsPath(storedPath) ? path.win32 : path.posix;
  const root = flavor.resolve(legacyRootPath);
  const target = flavor.resolve(storedPath);
  const relative = flavor.relative(root, target);
  return isContainedRelative(relative) && relative !== "" ? relative.replaceAll("\\", "/") : undefined;
}

async function assertRealPathInsideRoot(projectRoot: string, candidate: string): Promise<void> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(path.resolve(projectRoot));
  } catch {
    throw new ProjectPathError("PROJECT_PATH_INVALID", "The active project root is invalid.");
  }
  const relative = path.relative(realRoot, candidate);
  if (!isContainedRelative(relative)) {
    throw new ProjectPathError("PROJECT_PATH_OUTSIDE_ROOT", "The project file resolves outside the active project.");
  }
}

async function nearestExistingParent(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (nodeErrorCode(error) !== "ENOENT") {
        throw new ProjectPathError("PROJECT_FILE_UNREADABLE", "A project path parent is not accessible.");
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw new ProjectPathError("PROJECT_PATH_INVALID", "The active project root is invalid.");
      }
      current = parent;
    }
  }
}

function isContainedRelative(relative: string): boolean {
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isAbsoluteOnAnyPlatform(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value) || /^[A-Za-z]:/u.test(value);
}

function looksLikeWindowsPath(value: string): boolean {
  return path.win32.isAbsolute(value) || /^[A-Za-z]:/u.test(value) || value.includes("\\");
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
