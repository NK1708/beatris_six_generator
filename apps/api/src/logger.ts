import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["GEMINI_API_KEY", "OPENAI_API_KEY", "*.apiKey", "apiKey"]
});
