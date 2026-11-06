import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Frame, Project } from "./model.js";
import { FrameEditor } from "./screens/FrameWorkspace.js";

function render(status: Frame["status"]) {
  const frame: Frame = {
    id: "isolated-frame", sceneId: "isolated-scene", sequence: 1, frameCode: "S001_F001", type: "CG", status,
    generationStrategy: "CONTINUE_PREVIOUS_FRAME", continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
    description: "Description", action: "Action", camera: "Camera", composition: "Composition", lighting: "Lighting", expressionNotes: "Expression", continuityNotes: "Continuity",
    previousFrameId: null, selectedGenerationId: "result", characterIds: [], additionalCharacterReferenceIds: {}, locationId: null, locationAngleId: null, styleProfileId: null,
    targetWidth: 1200, targetHeight: 675, targetAspectRatio: 16 / 9,
    generations: [{ id: "result", status: "SUCCESS", generationType: "INITIAL", provider: "fixture", model: "fixture", outputFilePath: "generations/result.png", createdAt: "2026-01-01T00:00:00Z" }]
  };
  const project: Project = {
    id: "isolated-project", name: "Isolated UI fixture", description: "", rootPath: "unused", defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "fixture", defaultProductionModel: "fixture",
    characters: [], locations: [], styleProfiles: [], scenes: [{ id: frame.sceneId, name: "Scene", description: "", sequence: 1, characterIds: [], locationId: null, styleProfileId: null, timeDescription: "", frames: [frame] }]
  };
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(FrameEditor, { project })));
}

describe("LOCKED Frame Workspace", () => {
  it("disables all staging/context controls while retaining viewing and provenance", () => {
    const html = render("LOCKED");
    expect(html).toContain('<fieldset disabled="" aria-label="Постановка и контекст кадра"');
    const start = html.indexOf('<fieldset disabled=""');
    const end = html.lastIndexOf('</fieldset>');
    const controls = html.slice(start, end);
    for (const label of ["Описание кадра", "Действие", "Камера", "Композиция", "Свет", "Выражение / поза", "Continuity notes", "Локация", "Ракурс", "Стиль", "Ширина panel", "Высота panel"]) expect(controls).toContain(label);
    expect(html).toMatch(/<button disabled="">.*?Сохранить кадр<\/button>/u);
    expect(html).toContain("Постановка и контекст доступны только для просмотра");
    expect(html).toContain("Просмотр кадра");
    expect(html).toContain("Детали результата");
    // Target now lives in the central surface, outside the staging fieldset.
    const targetSurface = html.indexOf('id="frame-state-surface"');
    expect(targetSurface).toBeGreaterThan(0);
    expect(targetSurface).toBeLessThan(start);
    expect(html).toMatch(/id="frame-state-surface" hidden=""/u);
    expect(html.match(/class="targetWorkspaceEditor"/gu)).toHaveLength(1);
    expect(html.indexOf('aria-label="СЦЕНА"')).toBe(-1);
    expect(html.indexOf("Сцена<select")).toBeLessThan(start);
  });
  it.each(["DRAFT", "REVIEW"] as const)("does not disable the %s staging fieldset", status => {
    expect(render(status)).toContain('<fieldset aria-label="Постановка и контекст кадра"');
  });
});
