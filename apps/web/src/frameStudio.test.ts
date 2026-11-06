import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FrameCanvas } from "./components/FrameCanvas.js";
import { act, create } from "react-test-renderer";
import { FrameFilmstrip } from "./components/FrameFilmstrip.js";
import { FrameInspector, FrameInspectorPanel } from "./components/FrameInspector.js";
import { FrameEditor } from "./screens/FrameWorkspace.js";
import { frameWorkspaceCandidates } from "./frameWorkspaceUi.js";
import { useUiStore, readWorkspaceContext } from "./state.js";
import type { Frame, Generation, Project } from "./model.js";

const result = (id: string, outputFilePath = id + ".png"): Generation => ({ id, status: "SUCCESS", provider: "isolated-fixture", model: "fixture", generationType: "INITIAL", createdAt: "2026-01-01T00:00:00Z", outputFilePath });
const frame = (id: string, generations: Generation[] = []): Frame => ({
  id, sceneId: "s", sequence: 1, frameCode: id, type: "CG", status: "DRAFT", generationStrategy: "NEW_COMPOSITION", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
  description: "", action: "", camera: "", composition: "", lighting: "", expressionNotes: "", continuityNotes: "", previousFrameId: null, selectedGenerationId: null,
  characterIds: [], additionalCharacterReferenceIds: {}, locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: 1200, targetHeight: 500, targetAspectRatio: 2.4, generations
});
const project: Project = { id: "p", name: "Isolated fixture", description: "", rootPath: "unused", defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "fixture", defaultProductionModel: "fixture", characters: [], locations: [], styleProfiles: [], scenes: [] };

describe("Studio Frame Workspace", () => {
  beforeEach(() => useUiStore.setState({ selectedProjectId: null, selectedSceneId: null, selectedFrameId: null, section: "project", frameDraftDirty: false }));
  afterEach(() => vi.unstubAllGlobals());

  it("routes an empty Canvas to generation while preserving geometry and distinguishing a missing file", () => {
    const onGenerate = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(React.createElement(FrameCanvas, { source: null, targetWidth: 1200, targetHeight: 500, targetRatio: 2.4, onGenerate })); });
    const action = renderer.root.findByType("button");
    act(() => action.props.onClick()); expect(onGenerate).toHaveBeenCalledOnce();
    expect(renderer.root.findByProps({ className: "frameCanvasGeometry" }).children.join(" ")).toContain("1200 × 500");
    act(() => renderer.update(React.createElement(FrameCanvas, { source: { id: "missing", url: null, label: "missing" }, targetWidth: 1200, targetHeight: 500, targetRatio: 2.4, onGenerate })));
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
    expect(renderer.root.findByProps({ role: "alert" })).toBeDefined();
    expect(renderer.root.findAllByType("img")).toHaveLength(0); act(() => renderer.unmount());
  });

  it("explains an empty canvas without a provider request or image", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(React.createElement(FrameCanvas, { source: null, targetWidth: 1200, targetHeight: 500, targetRatio: 2.4 }));
    expect(html).toContain("Изображение ещё не создано");
    expect(html).toContain("1200 × 500");
    expect(html).toContain("2.40:1");
    expect(html).not.toContain("<img");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not invent a selected Generation when no scene or Frame exists", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(FrameEditor, { project })));
    expect(html).toContain("Кадров нет");
    expect(html).toContain("Изображение ещё не создано");
    expect(html).not.toContain('class="status status-selected"');
    client.clear();
  });

  it("shows an error for a selected result without a path", () => {
    const html = renderToStaticMarkup(React.createElement(FrameCanvas, { source: { id: "selected", url: null, label: "selected" }, targetWidth: null, targetHeight: null, targetRatio: 1 }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Изображение недоступно");
    expect(html).not.toContain("<img");
  });

  it("keeps the exact selected result first, including a missing file path", () => {
    const data = { ...frame("f", [result("other"), result("chosen", "")]), selectedGenerationId: "chosen" };
    expect(frameWorkspaceCandidates(data).map(g => g.id)).toEqual(["chosen", "other"]);
    expect(data.selectedGenerationId).toBe("chosen");
    expect(data.status).toBe("DRAFT");
    expect(frameWorkspaceCandidates(data)[0]!.outputFilePath).toBe("");
  });

  it("renders backend frame order and never borrows a non-selected thumbnail", () => {
    const a = { ...frame("later", [result("unselected")]), sequence: 9 };
    const b = { ...frame("earlier", [result("chosen")]), sequence: 2, selectedGenerationId: "chosen", status: "LOCKED" as const };
    const html = renderToStaticMarkup(React.createElement(FrameFilmstrip, { project, frames: [a, b], selectedId: a.id, onSelect: () => undefined, onCreate: () => undefined, canCreate: true, creating: false }));
    expect(html.indexOf('title="later · later"')).toBeLessThan(html.indexOf('title="earlier · earlier"'));
    expect(html).not.toContain("unselected.png");
    expect(html).toContain("chosen.png");
    expect(html).toContain("Нет изображения");
    expect(html).toContain("Закреплён");
    expect(html).toContain('aria-current="true"');
  });

  it("keeps Inspector panels mounted while hidden or collapsed", () => {
    const html = renderToStaticMarkup(React.createElement(FrameInspector, { tab: "staging", onTab: () => undefined, collapsed: true, onClose: () => undefined, children: React.createElement(FrameInspectorPanel, { id: "context", active: "staging", children: React.createElement("input", { defaultValue: "draft survives" }) }) }));
    expect(html).toContain('id="frame-inspector"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('value="draft survives"');
    expect(html).toContain('role="tablist"');
  });

  it("guards frame/scene/project navigation and allows an explicit discard", () => {
    const confirm = vi.fn(() => false); vi.stubGlobal("window", { confirm });
    useUiStore.getState().setProject("p");
    useUiStore.getState().openStoryboardFrame("s", "first");
    useUiStore.getState().setFrameDraftDirty(true);
    useUiStore.getState().selectFrame("second");
    useUiStore.getState().selectScene("another-scene");
    useUiStore.getState().setProject("other");
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(useUiStore.getState()).toMatchObject({ selectedProjectId: "p", selectedSceneId: "s", selectedFrameId: "first", frameDraftDirty: true });
    confirm.mockReturnValue(true);
    useUiStore.getState().selectFrame("second");
    expect(useUiStore.getState()).toMatchObject({ selectedFrameId: "second", frameDraftDirty: false });
  });

  it("persists scene/frame context without storing a Frame draft", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    useUiStore.getState().setProject("p"); useUiStore.getState().openStoryboardFrame("s", "selected");
    expect(readWorkspaceContext()).toEqual({ projectId: "p", sceneId: "s", frameId: "selected", section: "frames" });
    useUiStore.getState().setProject("other");
    expect(useUiStore.getState()).toMatchObject({ selectedProjectId: "other", selectedSceneId: null, selectedFrameId: null });
  });
});
