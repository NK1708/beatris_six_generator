import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateVisualBaseFile } from "./services/visualBaseValidation.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("validateVisualBaseFile", () => {
  it.each([
    ["base.png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["base.jpg", [0xff, 0xd8, 0xff]],
    ["base.webp", [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]]
  ])("accepts a readable %s with a matching signature", async (fileName, bytes) => {
    const directory = await temporaryDirectory();
    await fs.writeFile(path.join(directory, fileName), Buffer.from(bytes));
    await expect(validateVisualBaseFile({ projectPath: directory, filePath: fileName, generationId: "generation-1" }))
      .resolves.toEqual({ status: "AVAILABLE", generationId: "generation-1" });
  });

  it("preserves the legacy diagnostic for a damaged image", async () => {
    const directory = await temporaryDirectory();
    await fs.writeFile(path.join(directory, "base.png"), "not-an-image");
    await expect(validateVisualBaseFile({ projectPath: directory, filePath: "base.png", generationId: "generation-1" }))
      .resolves.toEqual({ status: "UNAVAILABLE", message: "The previous Generation image must be a readable PNG, JPEG, or WEBP file." });
  });

  it("preserves the legacy diagnostic for a missing image without exposing its path", async () => {
    const directory = await temporaryDirectory();
    const result = await validateVisualBaseFile({ projectPath: directory, filePath: "missing.png", generationId: "generation-1" });
    expect(result).toEqual({ status: "UNAVAILABLE", message: "The previous Generation image file is missing or unreadable." });
    expect(JSON.stringify(result)).not.toContain(directory);
  });
});

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-visual-base-"));
  temporaryDirectories.push(directory);
  return directory;
}
