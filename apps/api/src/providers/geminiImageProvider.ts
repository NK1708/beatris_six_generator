import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";
import type { EditRequest, GenerationRequest, GenerationResult, ImageProvider, ReferenceAsset } from "@bearridge/shared";
import { AppError } from "../errors.js";

export type GeminiClient = {
  models: {
    generateContent(input: {
      model: string;
      contents: Part[];
      config: {
        responseModalities: string[];
        imageConfig: {
          aspectRatio: string;
          imageSize: string;
        };
      };
    }): Promise<GenerateContentResponse>;
  };
};

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  outputFilePath: string;
  rootPath: string;
  client?: GeminiClient;
}

export class GeminiImageProvider implements ImageProvider {
  readonly capabilities = { generate: true, trueEdit: false } as const;
  constructor(private readonly options: GeminiProviderOptions) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const response = await this.callGemini(request.prompt, request.aspectRatio, request.references, request.geometry?.requestedImageSize);
    const image = extractImageData(response);
    if (!image) {
      throw new AppError("Gemini did not return an image.", 502, "INVALID_IMAGE_RESPONSE");
    }
    const outputFilePath = outputPathForMime(this.options.outputFilePath, image.mimeType);
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, Buffer.from(image.data, "base64"));

    return {
      provider: "gemini",
      model: this.options.model,
      outputFilePath: path.relative(this.options.rootPath, outputFilePath).replace(/\\/g, "/"),
      rawMetadata: metadataFromResponse(response, request.references, false, image.mimeType),
      createdAt: new Date()
    };
  }

  async edit(request: EditRequest): Promise<GenerationResult> {
    const prompt = `${request.prompt}\n\nREPAIR INSTRUCTIONS:\n${request.repairInstructions}`;
    const repairReferences: ReferenceAsset[] = [
      {
        id: request.baseImagePath,
        kind: "previous-frame",
        code: "BASE_IMAGE",
        filePath: request.baseImagePath,
        status: "LOCKED",
        priority: 0,
        role: "Base image for repair. Preserve unchanged areas unless repair instructions say otherwise."
      },
      ...request.references
    ];
    const response = await this.callGemini(prompt, request.aspectRatio, repairReferences, request.geometry?.requestedImageSize);
    const image = extractImageData(response);
    if (!image) {
      throw new AppError("Gemini did not return an image.", 502, "INVALID_IMAGE_RESPONSE");
    }
    const outputFilePath = outputPathForMime(this.options.outputFilePath, image.mimeType);
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, Buffer.from(image.data, "base64"));

    return {
      provider: "gemini",
      model: this.options.model,
      outputFilePath: path.relative(this.options.rootPath, outputFilePath).replace(/\\/g, "/"),
      rawMetadata: metadataFromResponse(response, repairReferences, true, image.mimeType),
      createdAt: new Date()
    };
  }

  private async callGemini(prompt: string, aspectRatio: string, references: ReferenceAsset[], imageSize = "1K"): Promise<GenerateContentResponse> {
    if (!this.options.apiKey) {
      throw new AppError("GEMINI_API_KEY is not configured.", 400, "MISSING_GEMINI_API_KEY");
    }

    const client = this.options.client ?? new GoogleGenAI({ apiKey: this.options.apiKey });

    const contents: Part[] = [{ text: prompt }];

    for (const [index, reference] of references.entries()) {
      const imagePath = path.isAbsolute(reference.filePath) ? reference.filePath : path.join(this.options.rootPath, reference.filePath);
      const image = await fs.readFile(imagePath);
      const mimeType = mimeFromImageFile(imagePath, image);
      contents.push({ text: referenceInstruction(reference, index + 1) });
      contents.push({
        inlineData: {
          data: image.toString("base64"),
          mimeType
        }
      });
    }

    return client.models.generateContent({
      model: this.options.model,
      contents,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize
        }
      }
    });
  }
}

function extractImageData(response: GenerateContentResponse): { data: string; mimeType: string } | undefined {
  const images = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.inlineData)
    .filter((inlineData) => Boolean(inlineData?.data));
  const image = images?.at(-1);
  if (!image?.data) {
    return undefined;
  }
  const mimeType = normalizeOutputMime(image.mimeType);
  return { data: image.data, mimeType };
}

function metadataFromResponse(response: GenerateContentResponse, references: ReferenceAsset[], repair: boolean, outputMimeType: string) {
  return {
    referenceCount: references.length,
    repair,
    outputMimeType,
    referenceRoles: references.map((reference, index) => ({
      index: index + 1,
      code: reference.code,
      kind: reference.kind,
      role: reference.role ?? null,
      filePath: reference.filePath
    })),
    responseId: response.responseId,
    modelVersion: response.modelVersion,
    usageMetadata: response.usageMetadata
  };
}

function referenceInstruction(reference: ReferenceAsset, index: number): string {
  const role = reference.role ?? "Visual reference.";
  const label = reference.label ? ` Label: ${reference.label}` : "";
  const description = reference.description ? ` Description: ${reference.description}` : "";
  return `REFERENCE IMAGE ${index}: ${role}${label}${description}`;
}

function mimeFromImageFile(filePath: string, data: Buffer): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeFromExtension(ext);
  if (!mimeType) {
    throw new AppError(`Unsupported reference image type for ${path.basename(filePath)}. Use PNG, JPEG or WEBP.`, 400, "UNSUPPORTED_REFERENCE_IMAGE_TYPE");
  }
  const detected = detectMime(data);
  if (detected && detected !== mimeType) {
    throw new AppError(`Reference image MIME does not match file extension for ${path.basename(filePath)}.`, 400, "REFERENCE_IMAGE_MIME_MISMATCH");
  }
  return mimeType;
}

function mimeFromExtension(ext: string): string | undefined {
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  return undefined;
}

function detectMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

function normalizeOutputMime(mimeType: string | undefined): string {
  if (!mimeType) {
    return "image/png";
  }
  if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp") {
    return mimeType;
  }
  throw new AppError(`Gemini returned unsupported image MIME type: ${mimeType}`, 502, "UNSUPPORTED_OUTPUT_IMAGE_TYPE");
}

function outputPathForMime(filePath: string, mimeType: string): string {
  const ext = mimeType === "image/jpeg" ? ".jpg" : `.${mimeType.replace("image/", "")}`;
  return filePath.replace(/\.[^.\\/]+$/u, ext);
}
