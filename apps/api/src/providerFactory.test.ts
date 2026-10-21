import { describe, expect, it } from "vitest";
import { GeminiImageProvider } from "./providers/geminiImageProvider.js";
import { MockImageProvider } from "./providers/mockImageProvider.js";
import { OpenAIImageProvider } from "./providers/openAIImageProvider.js";
import { createImageProvider } from "./providers/providerFactory.js";

describe("Image provider routing", () => {
  const baseOptions = {
    model: "gemini-3.1-flash-image",
    outputFilePath: "C:/tmp/out.png",
    rootPath: "C:/tmp"
  };

  it("routes mock explicitly without requiring a Gemini API key", () => {
    const provider = createImageProvider({
      ...baseOptions,
      provider: "mock"
    });

    expect(provider).toBeInstanceOf(MockImageProvider);
  });

  it("routes gemini explicitly when an API key is configured", () => {
    const provider = createImageProvider({
      ...baseOptions,
      provider: "gemini",
      geminiApiKey: "test-key"
    });

    expect(provider).toBeInstanceOf(GeminiImageProvider);
  });

  it("fails gemini routing without silently falling back to mock", () => {
    expect(() => createImageProvider({
      ...baseOptions,
      provider: "gemini"
  })).toThrow("GEMINI_API_KEY is not configured.");
  });

  it("routes openai explicitly when an OpenAI API key is configured", () => {
    const provider = createImageProvider({
      ...baseOptions,
      provider: "openai",
      openaiApiKey: "test-key"
    });

    expect(provider).toBeInstanceOf(OpenAIImageProvider);
  });

  it("fails openai routing without silently falling back", () => {
    expect(() => createImageProvider({
      ...baseOptions,
      provider: "openai"
    })).toThrow("OPENAI_API_KEY is not configured.");
  });
});
