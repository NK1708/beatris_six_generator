import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createSceneSchema, updateSceneSchema } from "@bearridge/shared";
import { sceneCreateFields } from "./sceneCreation.js";
import { ScenesScreen } from "./screens/ScenesScreen.js";
import { useUiStore } from "./state.js";
afterEach(() => vi.unstubAllGlobals());
it.each([[null, null], ["location", null], [null, "style"], ["location", "style"]])("creates a Scene with location=%s style=%s using the actual create form", async (location, style) => {
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const writes = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { writes.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: "scene" }), { status: 201 }); }));
    useUiStore.setState({ selectedProjectId: "p", section: "scenes", selectedSceneId: null, sceneDraftDirty: false });
    const project = { id: "p", name: "Isolated fixture", characters: [], locations: location ? [{ id: location }] : [], styleProfiles: style ? [{ id: style }] : [], scenes: [] };
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let renderer;
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(ScenesScreen, { project }))); });
    await act(async () => renderer.root.findByType("input").props.onChange({ target: { value: "New Scene" } }));
    await act(async () => renderer.root.findAllByType("button").find(n => n.children.some(c => typeof c === "string" && c.includes("Создать сцену"))).props.onClick());
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(writes).toHaveLength(1);
    expect(createSceneSchema.safeParse(writes[0]).success).toBe(true);
    expect(writes[0]).toMatchObject({ projectId: "p", name: "New Scene", sequence: 1 });
    if (location)
        expect(writes[0].locationId).toBe(location);
    else
        expect(writes[0]).not.toHaveProperty("locationId");
    if (style)
        expect(writes[0].styleProfileId).toBe(style);
    else
        expect(writes[0]).not.toHaveProperty("styleProfileId");
    await act(async () => renderer.unmount());
    client.clear();
});
it("does not change the nullable update contract or mutate the original draft", () => {
    const draft = { name: "Scene", description: "", locationId: null, styleProfileId: null, timeDescription: "", characterIds: [] };
    const original = structuredClone(draft);
    sceneCreateFields(draft);
    expect(draft).toEqual(original);
    expect(updateSceneSchema.parse({ sceneId: "s", ...draft })).toMatchObject({ locationId: null, styleProfileId: null });
});
