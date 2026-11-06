import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FrameEditor } from "./screens/FrameWorkspace.js";
import { ScenesScreen } from "./screens/ScenesScreen.js";
import { useUiStore } from "./state.js";
import { api } from "./api.js";
import { equalDrafts, reconcileFrameDraft } from "./draftReconciliation.js";
import { frameToDraft } from "./screens/AssetLibrary.js";
const text = (n) => n.children.map(c => typeof c === "string" ? c : text(c)).join("");
const button = (r, name) => r.findAllByType("button").find(n => text(n).trim() === name);
const field = (r, name) => r.findAllByType("label").find(n => n.children[0] === name).findAll(n => ["input", "textarea", "select"].includes(String(n.type)))[0];
const flush = async () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const click = async (n) => act(async () => n.props.onClick({ currentTarget: { closest: () => ({ querySelectorAll: () => [] }) } }));
const edit = async (n, value) => act(async () => n.props.onChange({ target: { value } }));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const document = { sceneId: "s", time: { description: "Afternoon" }, characters: {}, environment: {}, props: {}, storyFacts: [] };
const baseFrame = { id: "f", sceneId: "s", sequence: 1, frameCode: "F001", type: "CG", status: "DRAFT", generationStrategy: "NEW_COMPOSITION", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] }, description: "Saved", action: "Waiting", camera: "", composition: "", lighting: "", expressionNotes: "", continuityNotes: "", previousFrameId: null, selectedGenerationId: null, characterIds: ["a", "b"], effectiveCharacterIds: ["a", "b"], characterCastSource: "INHERITED_SCENE", characterCastRevision: 0, additionalCharacterReferenceIds: { a: [], b: [] }, locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: 1200, targetHeight: 675, targetAspectRatio: 16 / 9, generations: [] };
const character = (id, name) => ({ id, name, references: [], outfits: [] });
const fixture = () => ({ id: "p", name: "Fixture", rootPath: "unused", description: "", defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "mock", defaultProductionModel: "mock", characters: [character("a", "Birdman"), character("b", "Webster")], locations: [], styleProfiles: [], scenes: [{ id: "s", name: "Scene", sequence: 1, description: "", locationId: null, styleProfileId: null, timeDescription: "", characterIds: ["a", "b"], storyState: { document: structuredClone(document) }, frames: [structuredClone(baseFrame)] }] });
const clients = [], renders = [];
beforeEach(() => {
    vi.stubGlobal("window", { confirm: vi.fn(() => false), addEventListener: vi.fn(), removeEventListener: vi.fn() });
    useUiStore.setState({ selectedProjectId: "p", selectedSceneId: "s", selectedFrameId: "f", section: "frames", frameDraftDirty: false, sceneDraftDirty: false });
});
afterEach(async () => { for (const r of renders.splice(0))
    await act(async () => r.unmount()); for (const c of clients.splice(0))
    c.clear(); vi.unstubAllGlobals(); });
async function mount(section = "frames") {
    let server = fixture();
    let fail = false, failRefresh = false, gate;
    const writes = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
        if (init?.method === "PUT") {
            const body = JSON.parse(String(init.body));
            writes.push({ url, body });
            if (gate)
                await gate;
            if (fail)
                return json({ error: "Save failed", code: "TEST_FAILURE" }, 409);
            if (url === "/api/story-state/s") {
                server = { ...server, scenes: [{ ...server.scenes[0], storyState: { document: body.document } }] };
                return json(server.scenes[0].storyState);
            }
            const original = server.scenes[0].frames[0];
            const ids = body.characterIds ?? original.characterIds;
            const references = body.additionalCharacterReferenceIds;
            const saved = { ...original, ...body, characterIds: ids, effectiveCharacterIds: ids, characterCastSource: body.characterCastMode === "EXPLICIT" ? "EXPLICIT" : original.characterCastSource, characterCastRevision: (original.characterCastRevision ?? 0) + 1, additionalCharacterReferenceIds: Object.fromEntries(ids.map(id => [id, references[id] ?? []])) };
            server = { ...server, scenes: [{ ...server.scenes[0], frames: [saved] }] };
            return json({ ...saved, characterIds: undefined, additionalCharacterReferenceIds: undefined, continuityEditContract: JSON.stringify(saved.continuityEditContract) }); // real PUT returns raw rows; full query supplies the serialized Frame
        }
        if (url.endsWith("/full"))
            return failRefresh ? json({ error: "Refresh failed" }, 409) : json(server);
        if (url.endsWith("/target-story-state"))
            return json({ status: "AVAILABLE", id: "target", frameId: "f", revision: 1, originType: "SCENE_INITIAL", sourceFrameId: null, sourceGenerationId: null, document });
        if (url.endsWith("/preview"))
            return json({ strategy: "NEW_COMPOSITION", context: { frame: server.scenes[0].frames[0], characters: [], storyState: document }, warnings: [], references: [], detectedContinuityChanges: [], geometry: { requestedAspectRatio: "16:9", requestedResolution: "1376x768", targetAspectRatio: 16 / 9, aspectRatioDifference: 0 } });
        return json(url.endsWith("/chatgpt") ? [] : url.endsWith("/health") ? { provider: "mock" } : { status: "BLOCKED", reasons: ["NO_SELECTION"], diagnostics: [] });
    }));
    useUiStore.setState({ section });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    function Host() {
        const current = useUiStore(s => s.section);
        const project = useQuery({ queryKey: ["project", "p"], queryFn: () => api.get("/api/projects/p/full") });
        return project.data ? current === "frames" ? React.createElement(FrameEditor, { project: project.data }) : current === "scenes" ? React.createElement(ScenesScreen, { project: project.data }) : React.createElement("div", null, current) : null;
    }
    let renderer;
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Host))); });
    renders.push(renderer);
    await flush();
    return { renderer, client, writes, setFail: (v) => { fail = v; }, setRefreshFail: (v) => { failRefresh = v; }, setGate: (v) => { gate = v; }, server: () => server };
}
async function changeCast(root) {
    const radios = root.findAllByProps({ name: "character-cast-mode" });
    await act(async () => radios[1].props.onChange());
    const webster = root.findAllByType("label").find(n => text(n).trim() === "Webster").findByType("input");
    await act(async () => webster.props.onChange({ target: { checked: false } }));
}
it("reconciles confirmed normalized Cast and enables Generation without changing Target or snapshots", async () => {
    const m = await mount();
    await changeCast(m.renderer.root);
    await click(button(m.renderer.root, "Сохранить кадр"));
    await flush();
    expect(useUiStore.getState().frameDraftDirty).toBe(false);
    expect(button(m.renderer.root, "Сохранить кадр").props.disabled).toBe(true);
    expect(button(m.renderer.root, "Создать черновик").props.disabled).toBe(false);
    expect(m.writes).toHaveLength(1);
    expect(m.writes[0].url).toBe("/api/frames/f");
    expect(m.server().scenes[0].frames[0].characterIds).toEqual(["a"]);
});
it("preserves Cast dirty after server failure", async () => {
    const m = await mount();
    m.setFail(true);
    await changeCast(m.renderer.root);
    await click(button(m.renderer.root, "Сохранить кадр"));
    await flush();
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    expect(m.server().scenes[0].frames[0].characterIds).toEqual(["a", "b"]);
});
it("keeps Target dirty independently when Cast save succeeds", async () => {
    const m = await mount();
    await click(button(m.renderer.root, "Состояние кадра"));
    const target = m.renderer.root.findByProps({ className: "frameTargetSurface" });
    await click(button(target, "Редактировать"));
    await edit(field(target, "Описание времени"), "Unsaved Target");
    await changeCast(m.renderer.root);
    await click(button(m.renderer.root, "Сохранить кадр"));
    await flush();
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    expect(button(m.renderer.root, "Сохранить кадр").props.disabled).toBe(true);
    expect(field(target, "Описание времени").props.value).toBe("Unsaved Target");
    expect(button(m.renderer.root, "Создать черновик").props.disabled).toBe(true);
});
it("retains Inspector input entered while a Cast save is in flight", async () => {
    const m = await mount();
    let release;
    m.setGate(new Promise(r => { release = r; }));
    await changeCast(m.renderer.root);
    await click(button(m.renderer.root, "Сохранить кадр"));
    await edit(field(m.renderer.root, "Описание кадра"), "Typed while saving");
    release();
    await flush();
    expect(field(m.renderer.root, "Описание кадра").props.value).toBe("Typed while saving");
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    m.setGate();
    await click(button(m.renderer.root, "Сохранить кадр"));
    await flush();
    expect(useUiStore.getState().frameDraftDirty).toBe(false);
});
it("does not overwrite local Cast with stale cached data if refresh after successful PUT fails", async () => {
    const m = await mount();
    await changeCast(m.renderer.root);
    m.setRefreshFail(true);
    await click(button(m.renderer.root, "Сохранить кадр"));
    await flush();
    expect(useUiStore.getState().frameDraftDirty).toBe(true);
    expect(m.renderer.root.findAllByType("label").find(n => text(n).trim() === "Webster").findByType("input").props.checked).toBe(false);
    expect(m.server().scenes[0].frames[0].characterIds).toEqual(["a"]);
});
it("keeps a newer Cast selection as a group when reconciling an earlier save", () => {
    const submitted = frameToDraft(baseFrame);
    const current = { ...submitted, characterCastMode: "EXPLICIT", characterIds: ["b"], additionalCharacterReferenceIds: { b: ["ref-b"] } };
    const saved = { ...submitted, characterIds: ["a"], additionalCharacterReferenceIds: { a: [] } };
    expect(reconcileFrameDraft(submitted, current, saved)).toEqual(current);
    expect(equalDrafts({ character: { present: true, pose: "standing" } }, { character: { pose: "standing", present: true } })).toBe(true);
});
it("does not rebase a departed Frame session after an asynchronous save finishes", async () => {
    const m = await mount();
    let release;
    m.setGate(new Promise(r => { release = r; }));
    await changeCast(m.renderer.root);
    await click(button(m.renderer.root, "Сохранить кадр"));
    vi.mocked(window.confirm).mockReturnValue(true);
    await act(async () => useUiStore.getState().setSection("characters"));
    release();
    await flush();
    expect(useUiStore.getState()).toMatchObject({ section: "characters", frameDraftDirty: false });
});
it("makes repeated activation of the current project a no-op for dirty context", () => {
    useUiStore.getState().setFrameDraftDirty(true);
    const before = useUiStore.getState();
    for (let i = 0; i < 5; i++)
        useUiStore.getState().setProject("p");
    expect(useUiStore.getState()).toBe(before);
    expect(window.confirm).not.toHaveBeenCalled();
});
it("keeps independent Inspector and Target drafts mounted during repeated current-project selection", async () => {
    const m = await mount();
    await edit(field(m.renderer.root, "Описание кадра"), "Inspector draft");
    const target = m.renderer.root.findByProps({ className: "frameTargetSurface" });
    await click(button(target, "Редактировать"));
    await edit(field(target, "Описание времени"), "Target draft");
    await act(async () => { useUiStore.getState().setProject("p"); useUiStore.getState().setProject("p"); });
    expect(field(m.renderer.root, "Описание кадра").props.value).toBe("Inspector draft");
    expect(field(target, "Описание времени").props.value).toBe("Target draft");
});
it("cancels switching to another project and permits explicit discard", () => {
    useUiStore.getState().setFrameDraftDirty(true);
    useUiStore.getState().setProject("other");
    expect(useUiStore.getState().selectedProjectId).toBe("p");
    vi.mocked(window.confirm).mockReturnValue(true);
    useUiStore.getState().setProject("other");
    expect(useUiStore.getState()).toMatchObject({ selectedProjectId: "other", section: "project", frameDraftDirty: false });
});
async function sceneEdit() { const m = await mount("scenes"); await click(button(m.renderer.root, "Редактор")); await edit(field(m.renderer.root.findByProps({ className: "sceneStoryState" }), "Время"), "Scene draft"); return m; }
it("guards Scene Story State exits and preserves text when section navigation is cancelled", async () => {
    const m = await sceneEdit();
    await act(async () => useUiStore.getState().setSection("characters"));
    expect(window.confirm).toHaveBeenCalled();
    expect(useUiStore.getState().section).toBe("scenes");
    expect(field(m.renderer.root.findByProps({ className: "sceneStoryState" }), "Время").props.value).toBe("Scene draft");
});
it("guards closing Scene editor and permits explicit discard without stale dirty", async () => {
    const m = await sceneEdit();
    await click(button(m.renderer.root, "Каталог сцен"));
    expect(m.renderer.root.findAllByProps({ className: "sceneStoryState" })).toHaveLength(1);
    vi.mocked(window.confirm).mockReturnValue(true);
    await click(button(m.renderer.root, "Каталог сцен"));
    expect(m.renderer.root.findAllByProps({ className: "sceneStoryState" })).toHaveLength(0);
    await click(button(m.renderer.root, "Редактор"));
    expect(field(m.renderer.root.findByProps({ className: "sceneStoryState" }), "Время").props.value).toBe("Afternoon");
});
it("clears Scene dirty only after successful save and permits clean navigation", async () => {
    const m = await sceneEdit();
    await click(m.renderer.root.findByProps({ title: "Сохранить состояние сцены" }));
    await flush();
    await act(async () => useUiStore.getState().setSection("characters"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(m.server().scenes[0].storyState.document.time.description).toBe("Scene draft");
    expect(m.writes.map(w => w.url)).toEqual(["/api/story-state/s"]);
});
it("retains Scene text and its navigation guard on save failure", async () => {
    const m = await sceneEdit();
    m.setFail(true);
    await click(m.renderer.root.findByProps({ title: "Сохранить состояние сцены" }));
    await flush();
    await act(async () => useUiStore.getState().setProject("other"));
    expect(useUiStore.getState().selectedProjectId).toBe("p");
    expect(field(m.renderer.root.findByProps({ className: "sceneStoryState" }), "Время").props.value).toBe("Scene draft");
});
it("guards all Scene context exits, including same-frame entry and asset shortcuts", () => {
    useUiStore.setState({ section: "scenes", sceneDraftDirty: true });
    const state = useUiStore.getState();
    for (const leave of [() => state.selectScene("other-scene"), () => state.selectFrame("f"), () => state.openStoryboardFrame("s", "f"), () => state.selectCharacter("a"), () => state.selectLocation("l"), () => state.selectStyle("style"), () => state.returnToStoryboard(), () => state.openRepair("f", "g"), () => state.clearProject()])
        leave();
    expect(window.confirm).toHaveBeenCalledTimes(9);
    expect(useUiStore.getState()).toMatchObject({ selectedSceneId: "s", section: "scenes", sceneDraftDirty: true, frameDraftDirty: false });
});
