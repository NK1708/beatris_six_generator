import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Frame, Generation, PreviewResponse, Project, Section } from "./model.js";
import { resolveReviewTarget } from "./reviewTarget.js";
import { useUiStore } from "./state.js";
import { ReviewPanel } from "./screens/GenerationsScreen.js";
import { GenerationsScreen } from "./screens/GenerationsScreen.js";
import { FrameEditor } from "./screens/FrameWorkspace.js";
import { ContextPane, ProductionSurface } from "./workspace/Workspace.js";

const generation = (id: string, frame: string): Generation => ({
  id, status: "SUCCESS", generationType: "INITIAL", provider: "chatgpt-manual",
  model: "chatgpt-manual", outputFilePath: `generations/${frame}/${id}.png`, createdAt: "2026-01-01T00:00:00Z"
});
const frame = (id: string, code: string, selectedGenerationId: string | null, generations: Generation[]): Frame => ({
  id, sceneId: "scene", sequence: 1, frameCode: code, type: "CG", status: selectedGenerationId ? "REVIEW" : "DRAFT",
  generationStrategy: "NEW_COMPOSITION", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
  description: "", action: "", camera: "", composition: "", lighting: "", expressionNotes: "", continuityNotes: "",
  previousFrameId: null, selectedGenerationId, characterIds: [], additionalCharacterReferenceIds: {},
  locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: null, targetHeight: null,
  targetAspectRatio: null, generations
});
const first = frame("f1", "S001_F001", "g1", [generation("g1", "S001_F001"), generation("g2", "S001_F001")]);
const second = frame("f2", "S001_F002", "g3", [generation("g3", "S001_F002")]);
const project: Project = {
  id: "project", name: "Test", description: "", rootPath: "C:/test", defaultAspectRatio: "16:9",
  defaultResolution: "1K", defaultDraftModel: "mock", defaultProductionModel: "mock",
  characters: [], locations: [], styleProfiles: [], scenes: [{
    id: "scene", sequence: 1, name: "Scene", description: "", locationId: null, styleProfileId: null,
    characterIds: [], timeDescription: "", frames: [first, second]
  }]
};

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, element));
}

describe("frontend review safety", () => {
  it("never resolves a generation from another frame", () => {
    expect(resolveReviewTarget(project, "generations", "f1", "f2", "g1")).toBeNull();
    expect(resolveReviewTarget(project, "generations", "f1", "f2", "g3")?.frame.id).toBe("f2");
  });

  it("opens a candidate without selecting or locking it", () => {
    useUiStore.setState({ section: "generations", selectedFrameId: "f2", reviewFrameId: "f1", reviewGenerationId: "g2" });
    const target = resolveReviewTarget(project, "generations", "f2", "f1", "g2");
    const html = render(React.createElement(ReviewPanel, { project, target }));
    expect(html).toContain("S001_F001");
    expect(html).toContain("g2.png");
    expect(html).not.toContain("g3.png");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toMatch(/disabled=""[^>]*>.*Утвердить и закрепить кадр/u);
    expect(first.selectedGenerationId).toBe("g1");
  });

  it("resets the displayed candidate when changing the open frame or project", () => {
    useUiStore.setState({ section: "generations", reviewFrameId: "f1", reviewGenerationId: "g1" });
    useUiStore.getState().openGeneration("f2", "g3");
    const target = resolveReviewTarget(project, "generations", "f1", "f2", "g3");
    expect(render(React.createElement(ReviewPanel, { project, target }))).toContain("S001_F002");
    useUiStore.getState().setProject("another-project");
    expect(useUiStore.getState().reviewGenerationId).toBeNull();
  });

  it("shows Story State only on scene and frame workspaces", () => {
    for (const section of ["project", "characters", "locations", "styles", "settings", "advanced", "generations"] as Section[]) {
      useUiStore.setState({ section });
      expect(render(React.createElement(ContextPane, { project, section }))).not.toContain("Состояние сцены");
    }
    useUiStore.setState({ section: "scenes", selectedSceneId: "scene" });
    expect(render(React.createElement(ContextPane, { project, section: "scenes" }))).toContain("Текущее состояние сцены");
  });

  it("keeps API generation and benchmark in Advanced only", () => {
    useUiStore.setState({ section: "project" });
    const overview = render(React.createElement(ProductionSurface, { project, section: "project" }));
    expect(overview).not.toContain("Подготовить benchmark");
    expect(overview).not.toContain("API generation");
    useUiStore.setState({ section: "advanced" });
    const advanced = render(React.createElement(ProductionSurface, { project, section: "advanced" }));
    expect(advanced).toContain("Подготовить benchmark");
    expect(advanced).toContain("API generation");
  });

  it("keeps manual export/import, repair, selection and lock controls reachable", () => {
    const editor = render(React.createElement(FrameEditor, { project }));
    expect(editor).toContain("Export for ChatGPT");
    expect(editor).toContain("Открыть кандидата");
    expect(editor).toContain("Текущее состояние сцены");
    expect(editor).toContain("Может отличаться от состояния на момент выбранного кадра.");
    expect(editor).toContain("Repair");
    expect(editor).toContain("Камера и постановка");
    expect(editor).toContain("Контекст и референсы");
    expect(editor).toContain("Production prompt");
    expect(editor).toContain("Import ChatGPT Result");
    expect(editor).not.toContain("> Draft</button>");
    const candidates = render(React.createElement(GenerationsScreen, { project }));
    expect(candidates).toContain("Repair Generation");
    expect(candidates).toContain('type="radio"');
    expect(candidates).toContain("Открыть");
    const target = resolveReviewTarget(project, "generations", "f2", "f1", "g1");
    const review = render(React.createElement(ReviewPanel, { project, target }));
    expect(review).toContain("Утвердить и закрепить кадр");
    expect(review).not.toContain('type="checkbox"');
  });

  it("renders every existing workspace section without changing project data", () => {
    const before = JSON.stringify(project);
    for (const section of ["project", "characters", "locations", "styles", "scenes", "frames", "generations", "settings", "advanced"] as Section[]) {
      const html = render(React.createElement(ProductionSurface, { project, section }));
      expect(html).toContain('class="centerPane');
    }
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe("Frame Workspace navigation guard", () => {
  it("keeps the current frame and section when unsaved changes are not discarded", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    useUiStore.setState({ section: "frames", selectedSceneId: "scene", selectedFrameId: "f1", frameDraftDirty: true });
    useUiStore.getState().selectFrame("f2");
    useUiStore.getState().returnToStoryboard();
    useUiStore.getState().setSection("generations");
    expect(useUiStore.getState()).toMatchObject({ section: "frames", selectedFrameId: "f1", frameDraftDirty: true });
    expect(confirm).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
    useUiStore.setState({ frameDraftDirty: false });
  });

  it("navigates within the scene after explicit discard without selecting a generation", () => {
    vi.stubGlobal("window", { confirm: () => true });
    useUiStore.setState({ section: "frames", selectedSceneId: "scene", selectedFrameId: "f1", frameDraftDirty: true });
    useUiStore.getState().selectFrame("f2");
    expect(useUiStore.getState()).toMatchObject({ section: "frames", selectedSceneId: "scene", selectedFrameId: "f2", frameDraftDirty: false });
    expect(second.selectedGenerationId).toBe("g3");
    useUiStore.getState().returnToStoryboard();
    expect(useUiStore.getState().section).toBe("storyboard");
    vi.unstubAllGlobals();
  });
});

describe("Frame Workspace visual context", () => {
  it("shows BASE and the selected result without changing selection", () => {
    const continuation = { ...second, generationStrategy: "CONTINUE_PREVIOUS_FRAME" as const, previousFrameId: "f1", status: "LOCKED" as const };
    const data: Project = { ...project, scenes: [{ ...project.scenes[0]!, frames: [continuation] }] };
    const client = new QueryClient();
    client.setQueryData(["preview", "f2"], {
      strategy: "CONTINUE_PREVIOUS_FRAME", references: [], warnings: [], prompt: "PROMPT",
      geometry: { targetAspectRatio: 16 / 9, requestedAspectRatio: "16:9", requestedResolution: "1K", requestedImageSize: "1K", requiresCrop: false, cropStrategy: "NONE", aspectRatioDifference: 0 },
      context: { characters: [], storyState: { characters: {} }, location: null, locationAngle: null, styleProfile: null, previousLockedFrame: { id: "f1", frameCode: "S001_F001", generationId: "g1", outputFilePath: "generations/base.png" } }
    } as unknown as PreviewResponse);
    useUiStore.setState({ section: "frames", selectedSceneId: "scene", selectedFrameId: "f2", frameDraftDirty: false });
    const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(FrameEditor, { project: data })));
    expect(html).toContain("BASE · S001_F001");
    expect(html).toContain("LOCKED");
    expect(html).toContain("g3.png");
    expect(continuation.selectedGenerationId).toBe("g3");
  });
});
