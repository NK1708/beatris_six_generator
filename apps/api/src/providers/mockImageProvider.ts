import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import type { EditRequest, GenerationRequest, GenerationResult, ImageProvider } from "@bearridge/shared";
import { resolveProjectFileForWrite, toProjectRelativePath } from "../services/projectPathResolver.js";

const transparentPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export class MockImageProvider implements ImageProvider {
  readonly capabilities = { generate: true, trueEdit: true } as const;
  constructor(
    private readonly model: string,
    private readonly outputFilePath: string,
    private readonly rootPath: string
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    return this.write(request.references.length, false);
  }

  async edit(request: EditRequest): Promise<GenerationResult> {
    return this.write(request.references.length, true);
  }

  private async write(referenceCount: number, repair: boolean): Promise<GenerationResult> {
    const outputFilePath = await resolveProjectFileForWrite(this.rootPath, toProjectRelativePath(this.rootPath, this.outputFilePath));
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, Buffer.from(transparentPng, "base64"));
    return {
      provider: "mock",
      model: this.model,
      outputFilePath: toProjectRelativePath(this.rootPath, outputFilePath),
      rawMetadata: { referenceCount, repair },
      createdAt: new Date(),
      estimatedCost: 0
    };
  }
}
