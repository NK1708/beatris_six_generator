import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: findDotEnvPath(process.cwd()) });

const configSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.sqlite"),
  PROJECTS_ROOT: z.string().default("./projects"),
  IMAGE_PROVIDER: z.enum(["mock", "gemini", "openai"]).optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2.5-sunburst"),
  API_PORT: z.coerce.number().int().positive().default(4317)
});

const parsed = configSchema.parse(process.env);

export const config = {
  databaseUrl: parsed.DATABASE_URL,
  projectsRoot: path.resolve(process.cwd(), parsed.PROJECTS_ROOT),
  imageProvider: parsed.IMAGE_PROVIDER ?? (parsed.GEMINI_API_KEY ? "gemini" : "mock"),
  geminiApiKey: parsed.GEMINI_API_KEY,
  openaiApiKey: parsed.OPENAI_API_KEY,
  openaiImageModel: parsed.OPENAI_IMAGE_MODEL,
  apiPort: parsed.API_PORT
};

function findDotEnvPath(startDir: string): string {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.join(startDir, ".env");
    }
    current = parent;
  }
}
