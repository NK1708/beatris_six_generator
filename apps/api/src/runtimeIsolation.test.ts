import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./config.js";

describe("runtime project isolation", () => {
  it("uses a process-specific disposable registry root under Vitest", () => {
    expect(config.runtimeMode).toBe("test");
    expect(config.projectsRoot).toBe(path.join(os.tmpdir(), `bearridge-vitest-${process.pid}`));
    expect(config.projectsRoot).not.toContain(path.join("apps", "api", "projects"));
  });
});
