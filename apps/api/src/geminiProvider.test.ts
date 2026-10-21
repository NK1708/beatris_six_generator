import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GenerateContentResponse, Part } from "@google/genai";
import { GeminiImageProvider } from "./providers/geminiImageProvider.js";

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const tinyJpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

describe("GeminiImageProvider", () => {
  it("uses models.generateContent with image config and stores inline image data", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-gemini-provider-"));
    const outputFilePath = path.join(rootPath, "generations", "S001_F001", "S001_F001_G001.png");
    await fs.mkdir(path.join(rootPath, "references"), { recursive: true });
    await fs.writeFile(path.join(rootPath, "references", "character.png"), Buffer.from(tinyPng, "base64"));
    await fs.writeFile(path.join(rootPath, "references", "style.png"), Buffer.from(tinyPng, "base64"));
    let captured: { model: string; contents: Part[]; config: { imageConfig: { aspectRatio: string; imageSize: string } } } | undefined;

    const provider = new GeminiImageProvider({
      apiKey: "test-key",
      model: "gemini-3.1-flash-image",
      rootPath,
      outputFilePath,
      client: {
        models: {
          async generateContent(input) {
            captured = input;
            return {
              responseId: "response-1",
              modelVersion: "gemini-3.1-flash-image-test",
              candidates: [{
                content: {
                  parts: [{ inlineData: { mimeType: "image/png", data: tinyPng } }]
                }
              }]
            } as GenerateContentResponse;
          }
        }
      }
    });

    const result = await provider.generate({
      prompt: "Generate benchmark frame.",
      references: [
        {
          id: "character-master",
          kind: "character",
          code: "CHAR_MIRA_MASTER_V1",
          filePath: "references/character.png",
          description: "Mira face identity.",
          status: "LOCKED",
          priority: 10,
          role: "Canonical identity reference for Mira."
        },
        {
          id: "style-ref",
          kind: "style",
          code: "STYLE_SOFT_INK_V1",
          filePath: "references/style.png",
          status: "LOCKED",
          priority: 40,
          role: "Canonical visual style guidance. Use for style consistency only, not as source of scene content."
        }
      ],
      aspectRatio: "21:9",
      resolution: "1584x672",
      mode: "draft",
      frameId: "frame-1",
      geometry: {
        requestedAspectRatio: "21:9",
        requestedResolution: "1584x672",
        requestedImageSize: "1K",
        targetAspectRatio: 2.4,
        requiresCrop: true,
        cropStrategy: "MANUAL",
        aspectRatioDifference: 0.0666666667
      }
    });

    expect(captured?.model).toBe("gemini-3.1-flash-image");
    expect(captured?.config.imageConfig).toEqual({ aspectRatio: "21:9", imageSize: "1K" });
    expect(captured?.contents[0]?.text).toBe("Generate benchmark frame.");
    expect(captured?.contents).toHaveLength(5);
    expect(captured?.contents[1]?.text).toContain("Canonical identity reference for Mira.");
    expect(captured?.contents[2]?.inlineData?.mimeType).toBe("image/png");
    expect(captured?.contents[3]?.text).toContain("not as source of scene content");
    expect(captured?.contents[4]?.inlineData?.mimeType).toBe("image/png");
    expect(result.provider).toBe("gemini");
    expect(result.rawMetadata).toMatchObject({
      referenceCount: 2,
      referenceRoles: [
        { code: "CHAR_MIRA_MASTER_V1", kind: "character", role: "Canonical identity reference for Mira." },
        { code: "STYLE_SOFT_INK_V1", kind: "style", role: "Canonical visual style guidance. Use for style consistency only, not as source of scene content." }
      ]
    });
    expect(result.outputFilePath).toBe("generations/S001_F001/S001_F001_G001.png");
    await expect(fs.access(outputFilePath)).resolves.toBeUndefined();
  });

  it("uses the final returned image part and stores the matching output extension", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-gemini-output-mime-"));
    const provider = new GeminiImageProvider({
      apiKey: "test-key",
      model: "gemini-3.1-flash-image",
      rootPath,
      outputFilePath: path.join(rootPath, "generations", "S001_F001", "S001_F001_G001.png"),
      client: {
        models: {
          async generateContent() {
            return {
              candidates: [{
                content: {
                  parts: [
                    { inlineData: { mimeType: "image/png", data: tinyPng } },
                    { inlineData: { mimeType: "image/jpeg", data: tinyJpeg } }
                  ]
                }
              }]
            } as GenerateContentResponse;
          }
        }
      }
    });

    const result = await provider.generate({
      prompt: "Generate final jpeg.",
      references: [],
      aspectRatio: "16:9",
      resolution: "1536x864",
      mode: "production",
      frameId: "frame-1"
    });

    expect(result.outputFilePath).toBe("generations/S001_F001/S001_F001_G001.jpg");
    expect(result.rawMetadata).toMatchObject({ outputMimeType: "image/jpeg" });
    await expect(fs.access(path.join(rootPath, result.outputFilePath))).resolves.toBeUndefined();
  });

  it("fails when Gemini returns no image part", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-gemini-no-image-"));
    const provider = new GeminiImageProvider({
      apiKey: "test-key",
      model: "gemini-3.1-flash-image",
      rootPath,
      outputFilePath: path.join(rootPath, "generations", "S001_F001", "S001_F001_G001.png"),
      client: {
        models: {
          async generateContent() {
            return {
              candidates: [{ content: { parts: [{ text: "No image generated." }] } }]
            } as GenerateContentResponse;
          }
        }
      }
    });

    await expect(provider.generate({
      prompt: "Generate nothing.",
      references: [],
      aspectRatio: "16:9",
      resolution: "1536x864",
      mode: "production",
      frameId: "frame-1"
    })).rejects.toThrow("Gemini did not return an image.");
  });

  it("rejects reference files with mismatched MIME signatures", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-gemini-bad-ref-"));
    await fs.mkdir(path.join(rootPath, "references"), { recursive: true });
    await fs.writeFile(path.join(rootPath, "references", "bad.png"), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    const provider = new GeminiImageProvider({
      apiKey: "test-key",
      model: "gemini-3.1-flash-image",
      rootPath,
      outputFilePath: path.join(rootPath, "generations", "S001_F001", "S001_F001_G001.png"),
      client: {
        models: {
          async generateContent() {
            throw new Error("Should not call Gemini with a bad reference.");
          }
        }
      }
    });

    await expect(provider.generate({
      prompt: "Generate with bad ref.",
      references: [{
        id: "bad",
        kind: "character",
        code: "BAD_REF",
        filePath: "references/bad.png",
        status: "LOCKED",
        priority: 10
      }],
      aspectRatio: "16:9",
      resolution: "1536x864",
      mode: "production",
      frameId: "frame-1"
    })).rejects.toThrow("Reference image MIME does not match file extension");
  });
});
