import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./state.js";
describe("workspace startup project isolation", () => {
    beforeEach(() => useUiStore.setState({ selectedProjectId: null, frameDraftDirty: false }));
    it("starts without an active project until the user explicitly selects one", () => {
        expect(useUiStore.getState().selectedProjectId).toBeNull();
        const workspaceSource = fs.readFileSync(path.resolve(process.cwd(), "apps/web/src/workspace/Workspace.tsx"), "utf8");
        expect(workspaceSource).not.toMatch(/projects\.data\?\.\[0\].*setProject/su);
    });
    it("selects a registered project only through an explicit action", () => {
        useUiStore.getState().setProject("explicit-project");
        expect(useUiStore.getState().selectedProjectId).toBe("explicit-project");
    });
});
