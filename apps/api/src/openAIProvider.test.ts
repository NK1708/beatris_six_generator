import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OpenAIImageProvider, type OpenAIClient, type OpenAIResponseRequest } from "./providers/openAIImageProvider.js";

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("OpenAIImageProvider", () => {
  it("preserves the complete prompt, ordered references and semantic roles, then saves the image", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-openai-provider-"));
    const outputFilePath = path.join(rootPath, "generations", "S001_F001", "S001_F001_G001.png");
    await fs.mkdir(path.join(rootPath, "references"), { recursive: true });
    await fs.writeFile(path.join(rootPath, "references", "character.png"), Buffer.from(tinyPng, "base64"));
    await fs.writeFile(path.join(rootPath, "references", "style.png"), Buffer.from(tinyPng, "base64"));
    let captured: OpenAIResponseRequest | undefined;
    const prompt = "PROJECT:\nBearridge Six\n\nFRAME:\nS001_F001\n\nDO NOT ALTER THIS PROMPT.";

    const client: OpenAIClient = {
      responses: {
        async create(request) {
          captured = request;
          return {
            id: "resp_1",
            model: "gpt-5.5",
            status: "completed",
            usage: { input_tokens: 42 },
            output: [{
              type: "image_generation_call",
              id: "ig_1",
              status: "completed",
              result: tinyPng,
              revised_prompt: "Provider revised prompt"
            }]
          };
        }
      }
    };
    const provider = new OpenAIImageProvider({
      apiKey: "test-key",
      model: "gpt-image-2.5-sunburst",
      outputFilePath,
      rootPath,
      client
    });

    const result = await provider.generate({
      prompt,
      references: [
        {
          id: "character-master",
          kind: "character",
          code: "CHAR_MIRA_MASTER_V1",
          filePath: "references/character.png",
          description: "Mira identity",
          status: "LOCKED",
          priority: 10,
          label: "Character: Mira",
          role: "Canonical identity reference for Mira."
        },
        {
          id: "style-ref",
          kind: "style",
          code: "STYLE_INK_V1",
          filePath: "references/style.png",
          status: "LOCKED",
          priority: 40,
          role: "Canonical visual style guidance. Use for style consistency only, not as source of scene content."
        }
      ],
      aspectRatio: "16:9",
      resolution: "1536x864",
      mode: "production",
      frameId: "frame-1"
    });

    expect(captured?.input[0]?.content[0]).toEqual({ type: "input_text", text: prompt });
    expect(captured?.input[0]?.content).toHaveLength(5);
    expect(captured?.input[0]?.content[1]).toMatchObject({ type: "input_text" });
    expect(captured?.input[0]?.content[1]).toHaveProperty("text", expect.stringContaining("Kind: character"));
    expect(captured?.input[0]?.content[1]).toHaveProperty("text", expect.stringContaining("Canonical identity reference for Mira."));
    expect(captured?.input[0]?.content[2]).toMatchObject({ type: "input_image", detail: "high" });
    expect(captured?.input[0]?.content[3]).toHaveProperty("text", expect.stringContaining("Kind: style"));
    expect(captured?.input[0]?.content[3]).toHaveProperty("text", expect.stringContaining("not as source of scene content"));
    expect(captured?.input[0]?.content[4]).toMatchObject({ type: "input_image", detail: "high" });
    expect(captured?.tools[0]).toMatchObject({
      type: "image_generation",
      model: "gpt-image-2.5-sunburst",
      action: "generate",
      size: "1536x864",
      output_format: "png"
    });
    expect(captured?.tools[0]).not.toHaveProperty("input_fidelity");
    expect(captured?.tool_choice).toEqual({ type: "image_generation" });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-image-2.5-sunburst");
    expect(result.outputFilePath).toBe("generations/S001_F001/S001_F001_G001.png");
    expect(result.rawMetadata).toMatchObject({
      responseId: "resp_1",
      revisedPrompt: "Provider revised prompt",
      referenceCount: 2,
      referenceRoles: [
        { index: 1, code: "CHAR_MIRA_MASTER_V1", kind: "character" },
        { index: 2, code: "STYLE_INK_V1", kind: "style" }
      ]
    });
    expect(JSON.stringify(result.rawMetadata)).not.toContain(tinyPng);
    await expect(fs.readFile(outputFilePath)).resolves.toEqual(Buffer.from(tinyPng, "base64"));
  });

  it("fails when OpenAI returns no image result", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-openai-no-image-"));
    const provider = providerWithClient(rootPath, {
      responses: { async create() { return { output: [{ type: "message" }] }; } }
    });

    await expect(provider.generate(baseRequest())).rejects.toThrow("OpenAI did not return an image.");
  });

  it("propagates API errors without provider fallback", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-openai-error-"));
    const provider = providerWithClient(rootPath, {
      responses: { async create() { throw new Error("OpenAI API unavailable"); } }
    });

    await expect(provider.generate(baseRequest())).rejects.toThrow("OpenAI API unavailable");
  });

  it("sends an edit base first and canonical references afterward without duplicating the base", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-openai-edit-"));
    await fs.mkdir(path.join(rootPath, "images"), { recursive: true });
    await fs.writeFile(path.join(rootPath, "images", "base.png"), Buffer.from(tinyPng, "base64"));
    await fs.writeFile(path.join(rootPath, "images", "character.png"), Buffer.from(tinyPng, "base64"));
    let captured: OpenAIResponseRequest | undefined;
    const provider = providerWithClient(rootPath, {
      responses: { async create(request) {
        captured = request;
        return { output: [{ type: "image_generation_call", result: tinyPng }] };
      } }
    });

    await provider.edit({
      ...baseRequest(),
      baseImagePath: "images/base.png",
      repairInstructions: "Move Birdman beside the coffee maker.",
      references: [{
        id: "character", kind: "character", code: "CHAR_BIRDMAN_MASTER_V1",
        filePath: "images/character.png", status: "LOCKED", priority: 10
      }]
    });

    expect(captured?.tools[0]?.action).toBe("edit");
    const content = captured?.input[0]?.content ?? [];
    expect(content[0]).toHaveProperty("text", expect.stringContaining("Move Birdman beside the coffee maker."));
    expect(content[1]).toHaveProperty("text", expect.stringContaining("Base image for repair"));
    expect(content[3]).toHaveProperty("text", expect.stringContaining("Kind: character"));
    expect(content.filter((item) => item.type === "input_image")).toHaveLength(2);
    expect(content.filter((item) => item.type === "input_text" && "text" in item && item.text.includes("Base image for repair"))).toHaveLength(1);
  });
});

function providerWithClient(rootPath: string, client: OpenAIClient) {
  return new OpenAIImageProvider({
    apiKey: "test-key",
    model: "gpt-image-2.5-sunburst",
    rootPath,
    outputFilePath: path.join(rootPath, "generations", "frame", "output.png"),
    client
  });
}

function baseRequest() {
  return {
    prompt: "Complete production prompt",
    references: [],
    aspectRatio: "16:9",
    resolution: "1536x864",
    mode: "production" as const,
    frameId: "frame-1"
  };
}
