import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { sceneCatalogStats, sceneIdentifier } from "./sceneCatalog.js";
import { ScenesScreen } from "./screens/ScenesScreen.js";
import { useUiStore } from "./state.js";
function frame(id, status, hasSuccessGeneration = false) {
    return {
        id,
        sceneId: "scene-1",
        sequence: Number(id.slice(1)),
        frameCode: `S001_F00${id.slice(1)}`,
        type: "CG",
        status,
        generationStrategy: "NEW_COMPOSITION",
        continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
        description: "",
        action: "",
        camera: "",
        composition: "",
        lighting: "",
        expressionNotes: "",
        continuityNotes: "",
        previousFrameId: null,
        selectedGenerationId: null,
        characterIds: [],
        additionalCharacterReferenceIds: {},
        locationId: null,
        locationAngleId: null,
        styleProfileId: null,
        targetWidth: 1200,
        targetHeight: 675,
        targetAspectRatio: 16 / 9,
        generations: hasSuccessGeneration ? [{ id: `g-${id}`, status: "SUCCESS", generationType: "INITIAL", provider: "manual", model: "manual", outputFilePath: `${id}.png`, createdAt: "2026-01-01T00:00:00Z" }] : []
    };
}
const scene = {
    id: "scene-1",
    sequence: 1,
    name: "Office lounge",
    description: "Waiting",
    locationId: "location-1",
    styleProfileId: null,
    characterIds: [],
    timeDescription: "Morning",
    frames: [frame("f1", "LOCKED"), frame("f2", "REVIEW"), frame("f3", "DRAFT", true), frame("f4", "REJECTED")]
};
const project = {
    id: "project",
    name: "test",
    description: "",
    rootPath: "C:/test",
    defaultAspectRatio: "16:9",
    defaultResolution: "1K",
    defaultDraftModel: "mock",
    defaultProductionModel: "mock",
    characters: [],
    locations: [{ id: "location-1", name: "Office", slug: "office", description: "", architectureDescription: "", immutableFeatures: "", status: "LOCKED", references: [], angles: [] }],
    styleProfiles: [],
    scenes: [scene]
};
describe("Scene Catalog", () => {
    beforeEach(() => useUiStore.setState({ selectedProjectId: "project", selectedSceneId: "scene-1", section: "scenes", frameDraftDirty: false }));
    it("counts only Frame status LOCKED as ready", () => {
        expect(sceneCatalogStats(scene)).toEqual({ total: 4, locked: 1, review: 1, other: 2, readinessPercent: 25 });
        expect(sceneCatalogStats({ frames: [frame("f1", "DRAFT", true)] }).locked).toBe(0);
    });
    it("handles an empty scene without a fictional completion status", () => {
        expect(sceneCatalogStats({ frames: [] })).toEqual({ total: 0, locked: 0, review: 0, other: 0, readinessPercent: 0 });
        expect(sceneIdentifier({ sequence: 7 })).toBe("S007");
    });
    it("renders catalog metadata, progress and both scene destinations", () => {
        const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(ScenesScreen, { project })));
        expect(html).toContain("S001");
        expect(html).toContain("Office lounge");
        expect(html).toContain("Office");
        expect(html).toContain("Morning");
        expect(html).toContain("1</strong> LOCKED");
        expect(html).toContain("1</strong> на проверке");
        expect(html).toContain("2</strong> остальных");
        expect(html).toContain('aria-valuenow="25"');
        expect(html).toContain("Прогресс закрепления кадров");
        expect(html).toContain('aria-valuetext="Закреплено 1 из 4 кадров"');
        expect(html).not.toContain("Production Readiness");
        expect(html).toContain("Редактор");
        expect(html).toContain("Раскадровка");
    });
    it("explains how to start when there are no scenes", () => {
        const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(ScenesScreen, { project: { ...project, scenes: [] } })));
        expect(html).toContain("В проекте пока нет сцен");
        expect(html).toContain("Новая сцена");
        expect(html).not.toContain('role="progressbar"');
    });
});
