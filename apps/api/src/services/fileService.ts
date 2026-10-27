import fs from "node:fs/promises";
import path from "node:path";
import { AppError, ValidationError } from "../errors.js";
import { resolveProjectDirectoryForWrite, resolveProjectFileForWrite, toProjectRelativePath } from "./projectPathResolver.js";

const projectFolders = [
  "bible",
  "characters",
  "locations",
  "props",
  "style",
  "story",
  "states",
  "frames/drafts",
  "frames/locked",
  "generations",
  "references"
];

export class FileService {
  async createProjectFolders(rootPath: string): Promise<void> {
    await fs.mkdir(rootPath, { recursive: true });
    await Promise.all(projectFolders.map((folder) => fs.mkdir(path.join(rootPath, folder), { recursive: true })));
  }

  async writeProjectManifest(rootPath: string, manifest: unknown): Promise<void> {
    await fs.writeFile(await resolveProjectFileForWrite(rootPath, "project.json"), JSON.stringify(manifest, null, 2), "utf8");
  }

  async writeDataUrl(rootPath: string, relativeDirectory: string, fileName: string, dataUrl: string): Promise<string> {
    const match = /^data:(?<mime>[-\w/+.;=]+);base64,(?<data>.+)$/u.exec(dataUrl);
    if (!match?.groups?.mime || !match.groups.data) {
      throw new ValidationError("Reference upload must be a base64 data URL.");
    }

    const mime = match.groups.mime;
    const data = match.groups.data;

    if (!/^image\/(png|jpeg|webp)$/u.test(mime)) {
      throw new ValidationError("Unsupported reference format. Use PNG, JPEG, or WebP.");
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const directory = await resolveProjectDirectoryForWrite(rootPath, relativeDirectory);
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = await resolveProjectFileForWrite(rootPath, path.posix.join(relativeDirectory.replaceAll("\\", "/"), safeFileName));
    await fs.writeFile(absolutePath, Buffer.from(data, "base64"));
    return toProjectRelativePath(rootPath, absolutePath);
  }

  async writeBuffer(rootPath: string, relativePath: string, buffer: Buffer): Promise<string> {
    const absolutePath = await resolveProjectFileForWrite(rootPath, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    await this.assertExists(absolutePath);
    return toProjectRelativePath(rootPath, absolutePath);
  }

  async writeJsonBeside(rootPath: string, relativeImagePath: string, payload: unknown): Promise<void> {
    const parsed = path.parse(relativeImagePath);
    const relativeJsonPath = path.join(parsed.dir, `${parsed.name}.json`);
    await fs.writeFile(await resolveProjectFileForWrite(rootPath, relativeJsonPath), JSON.stringify(payload, null, 2), "utf8");
  }

  private async assertExists(absolutePath: string): Promise<void> {
    try {
      await fs.access(absolutePath);
    } catch (error) {
      throw new AppError("Failed to write the project file.", 500, "FAILED_WRITE");
    }
  }
}
