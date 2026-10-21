import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@bearridge/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@bearridge/core": path.resolve(__dirname, "packages/core/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    globals: false
  }
});
