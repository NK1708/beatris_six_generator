import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectPathError,
  resolveProjectFileForRead,
  resolveProjectFileForWrite,
  toProjectRelativePath
} from "./services/projectPathResolver.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("project path isolation", () => {
  it("resolves relative and mixed-separator paths inside the active root", async () => {
    const root = await temporaryRoot();
    await fs.mkdir(path.join(root, "references"));
    await fs.writeFile(path.join(root, "references", "image.png"), "image");
    const resolved = await resolveProjectFileForRead(root, "references\\image.png");
    expect(resolved).toBe(await fs.realpath(path.join(root, "references", "image.png")));
    expect(toProjectRelativePath(root, resolved)).toBe("references/image.png");
  });

  it.each([
    "../outside.png",
    "../../other-project/file.png",
    "C:\\outside\\file.png",
    "C:/outside/file.png",
    "\\\\server\\share\\file.png",
    "/outside/file.png"
  ])("rejects unsafe stored path %s", async (storedPath) => {
    const root = await temporaryRoot();
    await expect(resolveProjectFileForWrite(root, storedPath)).rejects.toBeInstanceOf(ProjectPathError);
  });

  it("does not confuse a sibling with a matching path prefix", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "project");
    const sibling = path.join(parent, "project-copy");
    await fs.mkdir(root);
    await fs.mkdir(sibling);
    await expect(resolveProjectFileForWrite(root, "../project-copy/file.png"))
      .rejects.toMatchObject({ code: "PROJECT_PATH_OUTSIDE_ROOT" });
  });

  it("rebases a known legacy absolute path only to the active copy", async () => {
    const parent = await temporaryRoot();
    const legacyRoot = path.join(parent, "source");
    const activeRoot = path.join(parent, "copy");
    await fs.mkdir(path.join(legacyRoot, "generations"), { recursive: true });
    await fs.mkdir(path.join(activeRoot, "generations"), { recursive: true });
    await fs.writeFile(path.join(legacyRoot, "generations", "frame.png"), "source");
    await fs.writeFile(path.join(activeRoot, "generations", "frame.png"), "copy");
    const resolved = await resolveProjectFileForRead(activeRoot, path.join(legacyRoot, "generations", "frame.png"), { legacyRootPath: legacyRoot });
    expect(await fs.readFile(resolved, "utf8")).toBe("copy");
    expect(resolved).toBe(await fs.realpath(path.join(activeRoot, "generations", "frame.png")));
  });

  it("rejects an unrelated absolute path even when legacy rebasing is enabled", async () => {
    const parent = await temporaryRoot();
    const activeRoot = path.join(parent, "active");
    const legacyRoot = path.join(parent, "legacy");
    const sentinel = path.join(parent, "external", "sentinel.png");
    await fs.mkdir(activeRoot);
    await fs.mkdir(legacyRoot);
    await fs.mkdir(path.dirname(sentinel));
    await fs.writeFile(sentinel, "unchanged");
    await expect(resolveProjectFileForRead(activeRoot, sentinel, { legacyRootPath: legacyRoot }))
      .rejects.toMatchObject({ code: "LEGACY_PATH_UNRESOLVED" });
    expect(await fs.readFile(sentinel, "utf8")).toBe("unchanged");
  });

  it("blocks reads and writes through a directory link that escapes the project", async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, "project");
    const external = path.join(parent, "external");
    await fs.mkdir(root);
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "sentinel.png"), "unchanged");
    const link = path.join(root, "linked");
    try {
      await fs.symlink(external, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (isPermissionError(error)) return;
      throw error;
    }
    await expect(resolveProjectFileForRead(root, "linked/sentinel.png"))
      .rejects.toMatchObject({ code: "PROJECT_PATH_OUTSIDE_ROOT" });
    await expect(resolveProjectFileForWrite(root, "linked/new.png"))
      .rejects.toMatchObject({ code: "PROJECT_PATH_OUTSIDE_ROOT" });
    expect(await fs.readFile(path.join(external, "sentinel.png"), "utf8")).toBe("unchanged");
    await expect(fs.access(path.join(external, "new.png"))).rejects.toThrow();
  });
});

async function temporaryRoot(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-path-isolation-"));
  directories.push(directory);
  return directory;
}

function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "EPERM" || error.code === "EACCES");
}
