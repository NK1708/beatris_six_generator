import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { GenerationWorkspace } from "./components/GenerationWorkspace.js";
import { useUiStore } from "./state.js";
const base = { id: "frame-a", frameCode: "F1", status: "DRAFT", generationStrategy: "NEW_COMPOSITION", targetWidth: 1200, targetHeight: 500, generations: [], selectedGenerationId: null };
const project = { id: "project-a", rootPath: "unused", characters: [{ id: "mira", name: "Mira", outfits: [] }], locations: [], styleProfiles: [], defaultDraftModel: "draft-model", defaultProductionModel: "production-model" };
const preview = { productionTarget: { revision: 2 }, warnings: [], references: [], context: { characters: [], location: null, styleProfile: null, storyState: { time: { description: "Dusk" } } }, geometry: { requestedResolution: "1024x1024", requestedAspectRatio: "1:1" }, prompt: "fixture" };
const result = (id, status = "SUCCESS") => ({ id, status, generationType: "INITIAL", provider: "mock", model: "fixture", outputFilePath: status === "SUCCESS" ? id + ".png" : "", createdAt: "2026-01-01T00:00:00Z" });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const text = (node) => node.children.map(child => typeof child === "string" ? child : text(child)).join(" ");
const button = (root, label) => root.findAllByType("button").find(item => text(item).includes(label));
const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
afterEach(() => vi.unstubAllGlobals());
async function mount(overrides = {}, post) {
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
        if (init?.method) {
            requests.push({ url, body: JSON.parse(String(init.body)) });
            return post ? post(url, init) : response(result("new"));
        }
        return response({ provider: "mock" });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const props = { project, frame: base, preview, previewLoading: false, previewError: null, dirty: false, refresh: vi.fn(), onView: vi.fn(), onTarget: vi.fn(), onCast: vi.fn(), manualControls: React.createElement("p", {}, "Existing manual controller"), ...overrides };
    let renderer;
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(GenerationWorkspace, props))); });
    await flush();
    return { renderer, props, requests };
}
it("prepares Draft while Production is blocked, displaying server blocking warnings and asset navigation", async () => {
    const m = await mount({ preview: { ...preview, warnings: [{ code: "MISSING_CHARACTER_MASTER", entityId: "mira", message: "Mira needs a canonical MASTER", severity: "blocking" }] } });
    expect(button(m.renderer.root, "Создать черновик").props.disabled).toBe(false);
    expect(button(m.renderer.root, "Создать финальный результат").props.disabled).toBe(true);
    const sections = m.renderer.root.findByProps({ className: "generationWorkspace" }).children.filter((item) => typeof item !== "string");
    expect(sections.findIndex(item => item.props.className === "generationLaunch")).toBeLessThan(sections.findIndex(item => item.props.className === "generationPreparation"));
    expect(text(m.renderer.root.findByProps({ className: "generationDraftAvailability" }))).toMatch(/Черновая генерация:\s*доступна/u);
    expect(text(m.renderer.root)).toContain("Mira needs a canonical MASTER");
    expect(text(m.renderer.root)).toContain("MISSING_CHARACTER_MASTER");
    useUiStore.setState({ section: "frames", frameDraftDirty: false });
    await act(async () => button(m.renderer.root, "Референсы: Mira").props.onClick());
    expect(useUiStore.getState()).toMatchObject({ section: "characters", selectedCharacterId: "mira" });
    m.renderer.unmount();
});
it("sends one existing Draft request for double click and never automatically selects or launches Production", async () => {
    let complete;
    const m = await mount({}, async () => new Promise(resolve => { complete = resolve; }));
    await act(async () => { const launch = button(m.renderer.root, "Создать черновик").props.onClick; launch(); launch(); });
    expect(m.requests).toEqual([{ url: "/api/generations", body: { frameId: "frame-a", mode: "draft" } }]);
    expect(button(m.renderer.root, "Создать финальный результат").props.disabled).toBe(true);
    await act(async () => complete(response(result("created"))));
    await flush();
    expect(text(m.renderer.root)).toContain("Результат создан");
    expect(m.requests).toHaveLength(1);
    m.renderer.unmount();
});
it("uses the existing Production request after server readiness, and exposes generation errors without retries", async () => {
    const m = await mount({}, async () => response({ code: "GENERATION_START_CONFLICT", error: "state changed" }, 409));
    await act(async () => button(m.renderer.root, "Создать финальный результат").props.onClick());
    await flush();
    expect(m.requests[0].body).toEqual({ frameId: "frame-a", mode: "production" });
    expect(text(m.renderer.root)).toContain("GENERATION_START_CONFLICT");
    expect(text(m.renderer.root)).toContain("Автоматического повтора нет");
    expect(m.requests).toHaveLength(1);
    m.renderer.unmount();
});
it("renders multiple persisted statuses, does not substitute missing files, and views without selection", async () => {
    const failed = { ...result("failed", "FAILED"), rawMetadata: JSON.stringify({ message: "Fixture provider failure" }) };
    const m = await mount({ frame: { ...base, selectedGenerationId: "chosen", generations: [result("chosen"), result("other"), failed, result("pending", "PENDING")] } });
    const image = m.renderer.root.findAllByType("img")[0];
    await act(async () => image.props.onError());
    expect(text(m.renderer.root)).toContain("Файл изображения недоступен");
    expect(text(m.renderer.root)).toContain("Fixture provider failure");
    expect(text(m.renderer.root)).toContain("Ожидает запуска");
    await act(async () => button(m.renderer.root.findByProps({ "data-generation-id": "other" }), "Посмотреть").props.onClick());
    expect(m.props.onView).toHaveBeenCalledWith("other");
    expect(m.requests).toHaveLength(0);
    await act(async () => button(m.renderer.root.findByProps({ "data-generation-id": "other" }), "Выбрать результат").props.onClick());
    await flush();
    expect(m.requests).toEqual([{ url: "/api/frames/frame-a/selected-generation", body: { generationId: "other" } }]);
    m.renderer.unmount();
});
it("blocks launches for dirty or LOCKED Frames but keeps historical viewing", async () => {
    for (const overrides of [{ dirty: true }, { frame: { ...base, status: "LOCKED", generations: [result("historical")] } }]) {
        const m = await mount(overrides);
        expect(button(m.renderer.root, "Создать черновик").props.disabled).toBe(true);
        expect(button(m.renderer.root, "Создать финальный результат").props.disabled).toBe(true);
        await act(async () => button(m.renderer.root, "Создать черновик").props.onClick());
        expect(m.requests).toHaveLength(0);
        if (overrides.frame) {
            expect(button(m.renderer.root, "Посмотреть").props.disabled).toBeUndefined();
            expect(button(m.renderer.root, "Выбрать результат").props.disabled).toBe(true);
        }
        m.renderer.unmount();
    }
});
it("does not bypass navigation dirty guards when opening an asset", async () => {
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    const m = await mount({ dirty: true, preview: { ...preview, warnings: [{ code: "MISSING_CHARACTER_MASTER", entityId: "mira", message: "Missing", severity: "blocking" }] } });
    useUiStore.setState({ section: "frames", frameDraftDirty: true });
    await act(async () => button(m.renderer.root, "Референсы: Mira").props.onClick());
    expect(useUiStore.getState().section).toBe("frames");
    expect(window.confirm).toHaveBeenCalled();
    useUiStore.setState({ frameDraftDirty: false });
    m.renderer.unmount();
});
