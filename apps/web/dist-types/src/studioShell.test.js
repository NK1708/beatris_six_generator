import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkspaceContext, useUiStore, validateWorkspaceContext, workspaceStorageKey } from "./state.js";
import { Workspace } from "./workspace/Workspace.js";
import { activateSequentially } from "./workspace/projectActivation.js";
const saved = { projectId: "p", sceneId: "s", frameId: "f", section: "frames" };
const project = { id: "p", scenes: [{ id: "s", frames: [{ id: "f" }] }, { id: "other", frames: [{ id: "other-frame" }] }] };
describe("Studio shell context and activation", () => {
    let values;
    beforeEach(() => {
        values = new Map();
        vi.stubGlobal("localStorage", { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
        useUiStore.setState({ selectedProjectId: null, selectedSceneId: null, selectedFrameId: null, section: "project", frameDraftDirty: false, navigationCollapsed: false });
    });
    afterEach(() => vi.unstubAllGlobals());
    it("offers an explicit resume without activating or fetching a saved project", () => {
        values.set(workspaceStorageKey, JSON.stringify(saved));
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const markup = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(Workspace)));
        expect(markup).toContain("Продолжить последний проект");
        expect(useUiStore.getState().selectedProjectId).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
        client.clear();
    });
    it("restores validated context only after explicit project selection", () => {
        useUiStore.getState().restoreContext(project, saved);
        expect(useUiStore.getState().selectedProjectId).toBeNull();
        expect(useUiStore.getState().selectedFrameId).toBeNull();
        useUiStore.getState().setProject("p");
        useUiStore.getState().restoreContext(project, saved);
        expect(useUiStore.getState()).toMatchObject({ selectedProjectId: "p", selectedSceneId: "s", selectedFrameId: "f", section: "frames" });
    });
    it("rejects frames from another scene and missing scene IDs", () => {
        expect(validateWorkspaceContext(project, { ...saved, frameId: "other-frame" })).toMatchObject({ selectedSceneId: "s", selectedFrameId: null, section: "storyboard" });
        expect(validateWorkspaceContext(project, { ...saved, sceneId: "missing" })).toMatchObject({ selectedSceneId: null, selectedFrameId: null });
        useUiStore.getState().setProject("another-project");
        useUiStore.getState().restoreContext(project, saved);
        expect(useUiStore.getState().selectedSceneId).toBeNull();
    });
    it("persists navigation IDs and section without drafts or automatic hydration", () => {
        useUiStore.getState().setProject("p");
        useUiStore.getState().openStoryboardFrame("s", "f");
        useUiStore.getState().setFrameDraftDirty(true);
        expect(readWorkspaceContext()).toEqual(saved);
        expect(JSON.parse(values.get(workspaceStorageKey))).not.toHaveProperty("frameDraftDirty");
        useUiStore.setState({ selectedProjectId: null, selectedSceneId: null, selectedFrameId: null });
        expect(readWorkspaceContext()).toEqual(saved);
        expect(useUiStore.getState().selectedProjectId).toBeNull();
    });
    it("handles corrupt and unavailable browser storage", () => {
        values.set(workspaceStorageKey, "broken");
        expect(readWorkspaceContext()).toBeNull();
        values.set(workspaceStorageKey, JSON.stringify({ projectId: 10 }));
        expect(readWorkspaceContext()).toBeNull();
        expect(readWorkspaceContext({ getItem: () => { throw new Error("denied"); } })).toBeNull();
    });
    it("changes sections without dropping scene context and guards dirty frame navigation", () => {
        useUiStore.getState().setProject("p");
        useUiStore.getState().openStoryboardFrame("s", "f");
        useUiStore.getState().setSection("outfits");
        expect(useUiStore.getState()).toMatchObject({ section: "outfits", selectedSceneId: "s", selectedFrameId: "f" });
        useUiStore.setState({ section: "frames", frameDraftDirty: true });
        const confirm = vi.fn(() => false);
        vi.stubGlobal("window", { confirm });
        useUiStore.getState().setSection("scenes");
        expect(confirm).toHaveBeenCalledOnce();
        expect(useUiStore.getState().section).toBe("frames");
    });
    it("collapses navigation without changing project or document state", () => {
        useUiStore.getState().setProject("p");
        useUiStore.getState().openStoryboardFrame("s", "f");
        useUiStore.getState().setFrameDraftDirty(true);
        useUiStore.getState().toggleNavigation();
        expect(useUiStore.getState()).toMatchObject({ navigationCollapsed: true, selectedProjectId: "p", selectedFrameId: "f", frameDraftDirty: true });
        useUiStore.getState().toggleNavigation();
        expect(useUiStore.getState().navigationCollapsed).toBe(false);
    });
    it("serializes project activations and recovers after a failed activation", async () => {
        const calls = [];
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const first = activateSequentially(async () => { calls.push("first"); await gate; throw new Error("unavailable"); });
        const rejection = expect(first).rejects.toThrow("unavailable");
        const second = activateSequentially(async () => { calls.push("second"); return "opened"; });
        await Promise.resolve();
        expect(calls).toEqual(["first"]);
        release();
        await rejection;
        expect(await second).toBe("opened");
        expect(calls).toEqual(["first", "second"]);
    });
});
