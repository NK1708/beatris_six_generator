import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { EditRequest, GenerationRequest, GenerationResult, ImageProvider, ReferenceAsset } from "@bearridge/shared";
import { AppError } from "../errors.js";
import { resolveProjectFileForRead, resolveProjectFileForWrite, toProjectRelativePath } from "../services/projectPathResolver.js";

const responsesModel = "gpt-6-astra";

type OpenAIInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" };

export interface OpenAIResponse {
  id?: string;
  model?: string;
  status?: string;
  usage?: unknown;
  output: Array<{
    type: string;
    id?: string;
    status?: string;
    result?: string | null;
    revised_prompt?: string | null;
  }>;
}

export interface OpenAIResponseRequest {
  model: string;
  input: Array<{
    role: "user";
    content: OpenAIInputContent[];
  }>;
  tools: Array<{
    type: "image_generation";
    model: string;
    action: "generate" | "edit";
    output_format: "png";
    quality: "high";
    size: string;
  }>;
  tool_choice: { type: "image_generation" };
}

export interface OpenAIClient {
  responses: {
    create(request: OpenAIResponseRequest): Promise<OpenAIResponse>;
  };
}

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  outputFilePath: string;
  rootPath: string;
  legacyRootPath?: string;
  client?: OpenAIClient;
}

export class OpenAIImageProvider implements ImageProvider {
  readonly capabilities = { generate: true, trueEdit: true } as const;
  constructor(private readonly options: OpenAIProviderOptions) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    return this.generateImage(request, request.references, "generate");
  }

  async edit(request: EditRequest): Promise<GenerationResult> {
    const baseReference: ReferenceAsset = {
      id: request.baseImagePath,
      kind: "previous-frame",
      code: "BASE_IMAGE",
      filePath: request.baseImagePath,
      status: "LOCKED",
      priority: 0,
      label: "Base image for repair",
      role: "Base image for repair. Preserve unchanged areas unless the repair instructions require a change."
    };
    const editRequest = {
      ...request,
      prompt: `${request.prompt}\n\nREPAIR INSTRUCTIONS:\n${request.repairInstructions}`
    };
    return this.generateImage(editRequest, [baseReference, ...request.references], "edit");
  }

  private async generateImage(
    request: GenerationRequest,
    references: ReferenceAsset[],
    action: "generate" | "edit"
  ): Promise<GenerationResult> {
    if (!this.options.apiKey) {
      throw new AppError("OPENAI_API_KEY is not configured.", 400, "MISSING_OPENAI_API_KEY");
    }

    const content: OpenAIInputContent[] = [{ type: "input_text", text: request.prompt }];
    for (const [index, reference] of references.entries()) {
      const imagePath = await resolveProjectFileForRead(this.options.rootPath, reference.filePath, this.options.legacyRootPath ? { legacyRootPath: this.options.legacyRootPath } : {});
      const image = await fs.readFile(imagePath);
      const mimeType = mimeFromImageFile(imagePath, image);
      content.push({ type: "input_text", text: referenceInstruction(reference, index + 1) });
      content.push({
        type: "input_image",
        image_url: `data:${mimeType};base64,${image.toString("base64")}`,
        detail: "high"
      });
    }

    const client = this.options.client ?? createOpenAIClient(this.options.apiKey);
    const response = await client.responses.create({
      model: responsesModel,
      input: [{ role: "user", content }],
      tools: [{
        type: "image_generation",
        model: this.options.model,
        action,
        output_format: "png",
        quality: "high",
        size: request.resolution
      }],
      tool_choice: { type: "image_generation" }
    });

    const imageCall = response.output.filter((item) => item.type === "image_generation_call" && item.result).at(-1);
    if (!imageCall?.result) {
      throw new AppError("OpenAI did not return an image.", 502, "INVALID_IMAGE_RESPONSE");
    }

    const outputFilePath = await resolveProjectFileForWrite(this.options.rootPath, toProjectRelativePath(this.options.rootPath, outputPathForPng(this.options.outputFilePath)));
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, Buffer.from(imageCall.result, "base64"));

    return {
      provider: "openai",
      model: this.options.model,
      outputFilePath: toProjectRelativePath(this.options.rootPath, outputFilePath),
      rawMetadata: {
        responseId: response.id,
        responseModel: response.model,
        responseStatus: response.status,
        imageCallId: imageCall.id,
        imageCallStatus: imageCall.status,
        revisedPrompt: imageCall.revised_prompt,
        usage: response.usage,
        action,
        outputMimeType: "image/png",
        referenceCount: references.length,
        referenceRoles: references.map((reference, index) => ({
          index: index + 1,
          code: reference.code,
          kind: reference.kind,
          role: reference.role ?? null,
          filePath: reference.filePath
        }))
      },
      createdAt: new Date()
    };
  }
}

function createOpenAIClient(apiKey: string): OpenAIClient {
  const client = new OpenAI({ apiKey });
  return client as unknown as OpenAIClient;
}

function referenceInstruction(reference: ReferenceAsset, index: number): string {
  const role = reference.role ?? defaultRole(reference.kind);
  const label = reference.label ? ` Label: ${reference.label}` : "";
  const description = reference.description ? ` Description: ${reference.description}` : "";
  return `REFERENCE IMAGE ${index}: Kind: ${reference.kind}. Primary semantic role: ${role} Kind-specific constraint: ${kindConstraint(reference.kind)}${label}${description}`;
}

function defaultRole(kind: ReferenceAsset["kind"]): string {
  if (kind === "character") return "Defines canonical character identity. Preserve identity traits. Do not copy pose, camera, crop, background or composition automatically.";
  if (kind === "outfit") return "Defines canonical clothing appearance. Preserve clothing identity and immutable outfit features.";
  if (kind === "location") return "Defines canonical location architecture, objects, relative layout and visual identity.";
  if (kind === "location-angle") return "Defines the intended canonical camera and viewpoint of the location for this frame.";
  if (kind === "style") return "Visual style guidance only. Do not use it as a source of characters, objects, location content or composition.";
  if (kind === "previous-frame") return "Continuity reference. Preserve established visual state without blindly copying the previous frame.";
  return "Defines the canonical appearance of this prop.";
}

function kindConstraint(kind: ReferenceAsset["kind"]): string {
  if (kind === "character") return "Preserve identity traits; do not automatically copy pose, camera, crop, background or composition.";
  if (kind === "outfit") return "Preserve clothing identity and immutable outfit features.";
  if (kind === "location") return "Preserve canonical architecture, objects, relative layout and visual identity.";
  if (kind === "location-angle") return "Use this canonical camera and viewpoint for the selected location angle.";
  if (kind === "style") return "Use only for visual style guidance; do not source characters, objects, location content or composition from it.";
  if (kind === "previous-frame") return "Preserve established visual state and continuity without blindly copying the frame.";
  return "Preserve the canonical prop appearance without importing unrelated scene content.";
}

function mimeFromImageFile(filePath: string, data: Buffer): string {
  const extensionMime = mimeFromExtension(path.extname(filePath).toLowerCase());
  if (!extensionMime) {
    throw new AppError(`Unsupported reference image type for ${path.basename(filePath)}. Use PNG, JPEG or WEBP.`, 400, "UNSUPPORTED_REFERENCE_IMAGE_TYPE");
  }
  const detectedMime = detectMime(data);
  if (detectedMime && detectedMime !== extensionMime) {
    throw new AppError(`Reference image MIME does not match file extension for ${path.basename(filePath)}.`, 400, "REFERENCE_IMAGE_MIME_MISMATCH");
  }
  return extensionMime;
}

function mimeFromExtension(extension: string): string | undefined {
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return undefined;
}

function detectMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

function outputPathForPng(filePath: string): string {
  return filePath.replace(/\.[^.\\/]+$/u, ".png");
}
