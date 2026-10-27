import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createFrameForScene, newFramePayload } from "./frameCreation.js";
import { StoryboardScreen } from "./screens/StoryboardScreen.js";
import { useUiStore } from "./state.js";
import { frameAspectRatio, storyboardImageCandidates, storyboardStatus } from "./storyboard.js";
function generation(id, status, createdAt, outputFilePath = `${id}.png`) {
    return { id, status, generationType: "INITIAL", provider: "chatgpt-manual", model: "manual", outputFilePath, createdAt };
}
function frame(sequence, status, generations = [], selectedGenerationId = null, characterIds = []) {
    return {
        id: `frame-${sequence}`, sceneId: "scene-1", sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`,
        type: "CG", status, generationStrategy: "NEW_COMPOSITION",
        continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
        description: sequence === 5 ? "F005 action" : "", action: "", camera: "", composition: "", lighting: "",
        expressionNotes: "", continuityNotes: "", previousFrameId: null, selectedGenerationId,
        characterIds, additionalCharacterReferenceIds: {}, locationId: null, locationAngleId: null,
        styleProfileId: null, targetWidth: 1200, targetHeight: 500, targetAspectRatio: 2.4, generations
    };
}
const scene = {
    id: "scene-1", sequence: 1, name: "Office Lounge", description: "", locationId: "location-1",
    styleProfileId: "style-1", characterIds: ["character-1"], timeDescription: "", frames: []
};
const project = (scenes) => ({
    id: "project-1", name: "test1", description: "", rootPath: "C:/projects/test1",
    defaultAspectRatio: "16:9", defaultResolution: "1K", defaultDraftModel: "mock", defaultProductionModel: "mock",
    characters: [], locations: [], styleProfiles: [], scenes
});
const render = (data) => renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(StoryboardScreen, { project: data })));
describe("Storyboard navigation", () => {
    it("prefers selected SUCCESS image over a newer candidate and excludes FAILED images", () => {
        const item = frame(1, "LOCKED", [
            generation("selected", "SUCCESS", "2026-01-01T00:00:00Z"),
            generation("failed", "FAILED", "2026-01-03T00:00:00Z"),
            generation("newer", "SUCCESS", "2026-01-02T00:00:00Z")
        ], "selected");
        expect(storyboardImageCandidates(item).map((candidate) => candidate.id)).toEqual(["selected", "newer"]);
        expect(storyboardImageCandidates({ ...item, selectedGenerationId: null }).map((candidate) => candidate.id)).toEqual(["newer", "selected"]);
        expect(storyboardImageCandidates(frame(2, "REVIEW", [generation("failed", "FAILED", "2026-01-01T00:00:00Z")]))).toEqual([]);
    });
    it("uses Frame lifecycle status without selecting or locking a result", () => {
        expect(storyboardStatus(frame(1, "LOCKED", [generation("g", "SUCCESS", "2026-01-01T00:00:00Z")], "g"))).toBe("Закреплён");
        expect(storyboardStatus(frame(2, "REVIEW", [generation("g", "SUCCESS", "2026-01-01T00:00:00Z")]))).toBe("На проверке");
        expect(storyboardStatus(frame(3, "DRAFT", [generation("g", "FAILED", "2026-01-01T00:00:00Z")]))).toBe("Черновик");
        expect(storyboardStatus(frame(4, "DRAFT"))).toBe("Без изображения");
    });
    it("renders seven ordered cards with selected images and F007 under review", () => {
        const frames = Array.from({ length: 7 }, (_, index) => {
            const number = index + 1;
            return frame(number, number === 7 ? "REVIEW" : "LOCKED", [generation(`g${number}`, "SUCCESS", "2026-01-01T00:00:00Z")], number === 7 ? null : `g${number}`);
        }).reverse();
        const data = project([{ ...scene, frames }]);
        const before = JSON.stringify(data);
        const html = render(data);
        const codes = [...html.matchAll(/aria-label="Открыть кадр (S001_F\d{3}) в редакторе"/gu)].map((match) => match[1]);
        expect(codes).toEqual(["S001_F001", "S001_F002", "S001_F003", "S001_F004", "S001_F005", "S001_F006", "S001_F007"]);
        expect(html.match(/class="storyboardImage"[^>]*><img/gu)).toHaveLength(7);
        expect(html.match(/Закреплён/gu)).toHaveLength(6);
        expect(html).toContain("На проверке");
        expect(html).toContain('loading="lazy"');
        expect(JSON.stringify(data)).toBe(before);
    });
    it("keeps the selected scene on open and return without changing project data", () => {
        const before = JSON.stringify(project([scene]));
        useUiStore.getState().setProject("project-1");
        useUiStore.getState().selectScene("scene-1");
        useUiStore.getState().openStoryboardFrame("scene-1", "frame-5");
        expect(useUiStore.getState()).toMatchObject({ section: "frames", selectedSceneId: "scene-1", selectedFrameId: "frame-5" });
        useUiStore.getState().returnToStoryboard();
        expect(useUiStore.getState()).toMatchObject({ section: "storyboard", selectedSceneId: "scene-1", selectedFrameId: "frame-5" });
        expect(JSON.stringify(project([scene]))).toBe(before);
    });
    it("renders empty scenes and preserves panel geometry", () => {
        expect(render(project([{ ...scene, frames: [] }]))).toContain("В этой сцене пока нет кадров.");
        expect(render(project([]))).toContain("Создайте сцену");
        expect(frameAspectRatio(frame(1, "DRAFT"), "16:9")).toBe(2.4);
        expect(frameAspectRatio({ ...frame(1, "DRAFT"), targetWidth: null, targetHeight: null, targetAspectRatio: null }, "16:9")).toBeCloseTo(16 / 9);
    });
    it("creates through the existing endpoint with scene context and no generation copy", async () => {
        const previous = frame(1, "LOCKED");
        const selectedScene = { ...scene, frames: [previous] };
        const payload = newFramePayload(selectedScene);
        expect(payload).toMatchObject({ sceneId: scene.id, type: "CG" });
        expect(payload).not.toHaveProperty("sequence");
        expect(payload).not.toHaveProperty("previousFrameId");
        expect(payload).not.toHaveProperty("characterIds");
        expect(JSON.stringify(payload)).not.toContain("Generation");
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ frame: frame(2, "DRAFT"), target: {}, diagnostics: [] }) });
        vi.stubGlobal("fetch", fetchMock);
        try {
            await createFrameForScene(selectedScene);
            expect(fetchMock).toHaveBeenCalledWith("/api/frames", expect.objectContaining({ method: "POST" }));
            const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
            expect(body).toMatchObject({ sceneId: scene.id });
            expect(body).not.toHaveProperty("sequence");
            expect(body).not.toHaveProperty("previousFrameId");
            expect(body).not.toHaveProperty("characterIds");
        }
        finally {
            vi.unstubAllGlobals();
        }
    });
    it("gives Storyboard and Frame Workspace the same server-authoritative creation payload", () => {
        const f007 = frame(7, "REVIEW", [], null, ["birdman", "webster"]);
        const selectedScene = { ...scene, frames: [f007] };
        const storyboardPayload = newFramePayload(selectedScene, { targetWidth: 1200, targetHeight: 675 });
        const workspacePayload = newFramePayload(selectedScene, { action: "Next action" });
        expect(storyboardPayload.sceneId).toBe(workspacePayload.sceneId);
        expect(storyboardPayload).not.toHaveProperty("characterIds");
        expect(workspacePayload).not.toHaveProperty("characterIds");
    });
    it("does not derive predecessor data or change existing frames in the frontend", () => {
        const lockedGeneration = generation("locked-f004", "SUCCESS", "2026-01-01T00:00:00Z");
        const f004 = frame(4, "LOCKED", [lockedGeneration], lockedGeneration.id, ["birdman"]);
        const f007 = frame(7, "REVIEW", [], null, ["birdman", "webster"]);
        const selectedScene = { ...scene, frames: [f007, f004] };
        const before = JSON.stringify(selectedScene);
        const payload = newFramePayload(selectedScene);
        expect(payload).not.toHaveProperty("sequence");
        expect(payload).not.toHaveProperty("previousFrameId");
        expect(f004.characterIds).toEqual(["birdman"]);
        expect(f004.generations).toEqual([lockedGeneration]);
        expect(JSON.stringify(selectedScene)).toBe(before);
    });
    it("never sends a separate target initialization request", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ frame: frame(1, "DRAFT"), target: {}, diagnostics: [] }) });
        vi.stubGlobal("fetch", fetchMock);
        try {
            await createFrameForScene({ ...scene, frames: [] });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/frames");
        }
        finally {
            vi.unstubAllGlobals();
        }
    });
});
