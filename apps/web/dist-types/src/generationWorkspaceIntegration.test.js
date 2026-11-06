import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { FrameEditor } from "./screens/FrameWorkspace.js";
import { FrameCanvas } from "./components/FrameCanvas.js";
import { useUiStore } from "./state.js";
const document = { sceneId: "s", time: { description: "Dusk" }, characters: {}, environment: {}, props: {}, storyFacts: [] };
const generation = (id, status) => ({ id, status, model: "fixture", provider: "mock", generationType: "INITIAL", outputFilePath: status === "SUCCESS" ? id + ".png" : "", createdAt: "2026-01-01T00:00:00Z", storyStateSnapshot: JSON.stringify(document), frameSnapshot: "{}", rawMetadata: "{}" });
const frame = { id: "f", sceneId: "s", sequence: 1, frameCode: "F1", type: "CG", status: "REVIEW", generationStrategy: "NEW_COMPOSITION", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] }, description: "Saved staging", action: "", camera: "", composition: "", lighting: "", expressionNotes: "", continuityNotes: "", previousFrameId: null, selectedGenerationId: "success", characterIds: [], additionalCharacterReferenceIds: {}, locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: 1200, targetHeight: 500, targetAspectRatio: 2.4, generations: [generation("success", "SUCCESS"), generation("failed", "FAILED")] };
const project = { id: "p", rootPath: "unused", name: "Isolated fixture", description: "", defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "fixture", defaultProductionModel: "fixture", characters: [], locations: [], styleProfiles: [], scenes: [{ id: "s", name: "Scene", sequence: 1, description: "", characterIds: [], locationId: null, styleProfileId: null, timeDescription: "", frames: [frame], storyState: { document } }] };
const preview = { strategy: "NEW_COMPOSITION", productionTarget: { revision: 1, fingerprint: "fixture" }, context: { frame, characters: [], location: null, locationAngle: null, styleProfile: null, storyState: document }, warnings: [], references: [], detectedContinuityChanges: [], allowedContinuityChanges: [], geometry: { targetAspectRatio: 2.4, requestedAspectRatio: "21:9", requestedResolution: "1536x640", requestedImageSize: "1K", requiresCrop: false, cropStrategy: "NONE", aspectRatioDifference: 0 }, prompt: "fixture" };
const text = (node) => node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
const button = (root, label) => root.findAllByType("button").find(item => text(item).includes(label));
const tab = (root, label) => root.findAllByProps({ role: "tab" }).find(item => text(item) === label);
afterEach(() => { useUiStore.setState({ frameDraftDirty: false, section: "project", frameInspectorPreferences: {} }); vi.unstubAllGlobals(); });
async function mount(data = project) {
    const writes = [];
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: vi.fn(() => false) });
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
        if (init?.method)
            writes.push(url);
        const body = url.endsWith("/preview") ? preview : url.endsWith("/target-story-state") ? { status: "AVAILABLE", frameId: "f", id: "t", revision: 1, document, originType: "SCENE_INITIAL", sourceFrameId: null, sourceGenerationId: null } : url.endsWith("/exports/chatgpt") ? [] : url.endsWith("/health") ? { provider: "mock" } : { status: "BLOCKED", reasons: ["TARGET_SNAPSHOT_MISMATCH"] };
        return new Response(JSON.stringify(body));
    }));
    useUiStore.setState({ selectedProjectId: data.id, selectedSceneId: "s", selectedFrameId: "f", section: "frames", frameDraftDirty: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    let renderer;
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(FrameEditor, { project: data }))); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    return { renderer, writes, client };
}
it("retains the Target and staging drafts through all central modes, with no implicit requests", async () => {
    const m = await mount();
    const before = JSON.stringify(project);
    await act(async () => tab(m.renderer.root, "Состояние кадра").props.onClick());
    await act(async () => button(m.renderer.root.findByProps({ className: "frameTargetSurface" }), "Редактировать").props.onClick());
    const target = () => m.renderer.root.findByProps({ className: "frameTargetSurface" });
    await act(async () => target().findAllByType("textarea")[0].props.onChange({ target: { value: "Unsaved Target" } }));
    await act(async () => tab(m.renderer.root, "Генерация").props.onClick());
    expect(button(m.renderer.root, "Создать черновик").props.disabled).toBe(true);
    for (const mode of ["Сравнение", "Проверка", "Изображение"])
        await act(async () => tab(m.renderer.root, mode).props.onClick());
    await act(async () => tab(m.renderer.root, "Состояние кадра").props.onClick());
    expect(target().findAllByType("textarea")[0].props.value).toBe("Unsaved Target");
    const staging = () => m.renderer.root.findByProps({ id: "inspector-panel-staging" });
    await act(async () => staging().findAllByType("textarea")[0].props.onChange({ target: { value: "Unsaved staging" } }));
    await act(async () => tab(m.renderer.root, "Генерация").props.onClick());
    expect(staging().findAllByType("textarea")[0].props.value).toBe("Unsaved staging");
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    expect(m.writes).toEqual([]);
    expect(JSON.stringify(project)).toBe(before);
    await act(async () => m.renderer.unmount());
    m.client.clear();
});
it("opens FAILED in Canvas by exact identity, preserving selection, snapshots and provenance", async () => {
    const m = await mount();
    const before = JSON.stringify(project);
    await act(async () => tab(m.renderer.root, "Генерация").props.onClick());
    await act(async () => button(m.renderer.root.findByProps({ "data-generation-id": "failed" }), "Посмотреть").props.onClick());
    expect(m.renderer.root.findByType(FrameCanvas).props.source).toMatchObject({ id: "failed", url: null });
    expect(m.renderer.root.findByProps({ id: "frame-image-surface" }).props.hidden).toBe(false);
    expect(frame.selectedGenerationId).toBe("success");
    expect(JSON.stringify(project)).toBe(before);
    expect(m.writes).toEqual([]);
    await act(async () => m.renderer.unmount());
    m.client.clear();
});
it("isolates Compare choices during rapid Frame switches without lifecycle mutations", async () => {
    const second = { ...frame, id: "f2", frameCode: "F2", selectedGenerationId: null, generations: [{ ...generation("second-a", "SUCCESS") }, { ...generation("second-b", "SUCCESS") }] };
    const data = { ...project, scenes: [{ ...project.scenes[0], frames: [frame, second] }] };
    const m = await mount(data);
    await act(async () => tab(m.renderer.root, "Сравнение").props.onClick());
    for (const id of ["f2", "f", "f2"]) {
        await act(async () => useUiStore.getState().selectFrame(id));
        const options = m.renderer.root.findByProps({ "aria-label": "Результат A" }).findAllByType("option").map(item => item.props.value).filter(Boolean);
        expect(options).toEqual(id === "f2" ? ["second-a", "second-b"] : ["success", "failed"]);
        expect(m.renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    }
    expect(m.writes).toEqual([]);
    await act(async () => m.renderer.unmount());
    m.client.clear();
});
it("uses mode-specific Inspector defaults and preserves manual opening and dirty forms", async () => {
    const m = await mount();
    const inspector = () => m.renderer.root.findByProps({ id: "frame-inspector" });
    const toggle = () => m.renderer.root.findByProps({ "aria-controls": "frame-inspector" }).props.onClick();
    const staging = () => m.renderer.root.findByProps({ id: "inspector-panel-staging" }).findAllByType("textarea")[0];
    expect(inspector().props.hidden).toBe(false);
    const input = staging();
    await act(async () => input.props.onChange({ target: { value: "Keep this dirty Inspector" } }));
    for (const name of ["Состояние кадра", "Генерация", "Сравнение", "Проверка"]) {
        await act(async () => tab(m.renderer.root, name).props.onClick());
        expect(inspector().props.hidden).toBe(true);
    }
    await act(async () => tab(m.renderer.root, "Сравнение").props.onClick());
    await act(async () => toggle());
    expect(inspector().props.hidden).toBe(false);
    await act(async () => staging().props.onChange({ target: { value: "Still dirty, manually opened" } }));
    expect(inspector().props.hidden).toBe(false);
    await act(async () => tab(m.renderer.root, "Генерация").props.onClick());
    expect(inspector().props.hidden).toBe(true);
    await act(async () => tab(m.renderer.root, "Сравнение").props.onClick());
    expect(inspector().props.hidden).toBe(false);
    await act(async () => tab(m.renderer.root, "Изображение").props.onClick());
    expect(inspector().props.hidden).toBe(false);
    await act(async () => toggle());
    expect(inspector().props.hidden).toBe(true);
    await act(async () => tab(m.renderer.root, "Сравнение").props.onClick());
    await act(async () => tab(m.renderer.root, "Изображение").props.onClick());
    expect(inspector().props.hidden).toBe(true);
    expect(staging()).toBe(input);
    expect(staging().props.value).toBe("Still dirty, manually opened");
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    expect(m.writes).toEqual([]);
    await act(async () => m.renderer.unmount());
    m.client.clear();
});
it("isolates Inspector choices by project and restores them after remount", async () => {
    const m = await mount();
    await act(async () => tab(m.renderer.root, "Сравнение").props.onClick());
    await act(async () => m.renderer.root.findByProps({ "aria-controls": "frame-inspector" }).props.onClick());
    expect(m.renderer.root.findByProps({ id: "frame-inspector" }).props.hidden).toBe(false);
    await act(async () => m.renderer.unmount());
    m.client.clear();
    const other = await mount({ ...project, id: "other-project" });
    await act(async () => tab(other.renderer.root, "Сравнение").props.onClick());
    expect(other.renderer.root.findByProps({ id: "frame-inspector" }).props.hidden).toBe(true);
    await act(async () => other.renderer.unmount());
    other.client.clear();
    const restored = await mount();
    await act(async () => tab(restored.renderer.root, "Сравнение").props.onClick());
    expect(restored.renderer.root.findByProps({ id: "frame-inspector" }).props.hidden).toBe(false);
    expect(restored.writes).toEqual([]);
    await act(async () => restored.renderer.unmount());
    restored.client.clear();
});
