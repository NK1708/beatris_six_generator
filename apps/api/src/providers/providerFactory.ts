import type { ImageProvider } from "@bearridge/shared";
import { AppError } from "../errors.js";
import { GeminiImageProvider, type GeminiClient } from "./geminiImageProvider.js";
import { MockImageProvider } from "./mockImageProvider.js";
import { OpenAIImageProvider, type OpenAIClient } from "./openAIImageProvider.js";

export type ConfiguredImageProvider = "mock" | "gemini" | "openai";
export type ImageProviderCapabilities = ImageProvider["capabilities"];

export function getImageProviderCapabilities(provider: ConfiguredImageProvider): ImageProviderCapabilities {
  return { generate: true, trueEdit: provider !== "gemini" };
}

export interface ImageProviderFactoryOptions {
  provider: ConfiguredImageProvider;
  geminiApiKey?: string | undefined;
  openaiApiKey?: string | undefined;
  model: string;
  outputFilePath: string;
  rootPath: string;
  legacyRootPath?: string;
  geminiClient?: GeminiClient | undefined;
  openaiClient?: OpenAIClient | undefined;
}

export function createImageProvider(options: ImageProviderFactoryOptions): ImageProvider {
  if (options.provider === "mock") {
    return new MockImageProvider(options.model, options.outputFilePath, options.rootPath);
  }

  if (options.provider === "gemini") {
    if (!options.geminiApiKey) {
      throw new AppError("GEMINI_API_KEY is not configured.", 400, "MISSING_GEMINI_API_KEY");
    }

    return new GeminiImageProvider({
      apiKey: options.geminiApiKey,
      model: options.model,
      outputFilePath: options.outputFilePath,
      rootPath: options.rootPath,
      ...(options.legacyRootPath ? { legacyRootPath: options.legacyRootPath } : {}),
      ...(options.geminiClient ? { client: options.geminiClient } : {})
    });
  }

  if (!options.openaiApiKey) {
    throw new AppError("OPENAI_API_KEY is not configured.", 400, "MISSING_OPENAI_API_KEY");
  }

  return new OpenAIImageProvider({
    apiKey: options.openaiApiKey,
    model: options.model,
    outputFilePath: options.outputFilePath,
    rootPath: options.rootPath,
    ...(options.legacyRootPath ? { legacyRootPath: options.legacyRootPath } : {}),
    ...(options.openaiClient ? { client: options.openaiClient } : {})
  });
}
