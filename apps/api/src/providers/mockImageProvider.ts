import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import type { EditRequest, GenerationRequest, GenerationResult, ImageProvider } from "@bearridge/shared";

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
    await fs.mkdir(path.dirname(this.outputFilePath), { recursive: true });
    await fs.writeFile(this.outputFilePath, Buffer.from(transparentPng, "base64"));
    return {
      provider: "mock",
      model: this.model,
      outputFilePath: path.relative(this.rootPath, this.outputFilePath).replace(/\\/g, "/"),
      rawMetadata: { referenceCount, repair },
      createdAt: new Date(),
      estimatedCost: 0
    };
  }
}
