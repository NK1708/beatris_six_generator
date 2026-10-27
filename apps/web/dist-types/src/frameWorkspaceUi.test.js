import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { continuityContractSummary, initialFrameSections, openedFrameCandidate, selectedChatGPTReceipt, toggleFrameSection } from "./frameWorkspaceUi.js";
import { FrameEditor } from "./screens/FrameWorkspace.js";
import { orderedSceneFrames, storyboardImageCandidates } from "./storyboard.js";
import { Workspace } from "./workspace/Workspace.js";
const generation = (id) => ({
    id, status: "SUCCESS", generationType: "INITIAL", provider: "chatgpt-manual", model: "manual",
    outputFilePath: `generations/${id}.png`, createdAt: "2026-01-01T00:00:00Z"
});
function frame(id, sequence, strategy) {
    return {
        id, sceneId: "scene", sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`,
        type: "CG", status: "REVIEW", generationStrategy: strategy,
        continuityEditContract: { changes: ["Keep the pose"], forbidden: [], allowedChanges: [] },
        description: "Long description stays in the draft", action: "Action", camera: "Camera text stays in the draft",
        composition: "Composition", lighting: "Lighting", expressionNotes: "Expression", continuityNotes: "Continuity",
        previousFrameId: null, selectedGenerationId: "g1", characterIds: [], additionalCharacterReferenceIds: {},
        locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: 1200, targetHeight: 675,
        targetAspectRatio: 16 / 9, generations: [generation("g1"), generation("g2")]
    };
}
function project(frames) {
    return {
        id: "project", name: "test1", description: "", rootPath: "C:/test1", defaultAspectRatio: "16:9",
        defaultResolution: "1K", defaultDraftModel: "mock", defaultProductionModel: "mock",
        characters: [], locations: [], styleProfiles: [], scenes: [{
                id: "scene", sequence: 1, name: "Scene", description: "", locationId: null, styleProfileId: null,
                characterIds: [], timeDescription: "", frames
            }]
    };
}
function render(data, receipts = []) {
    const client = new QueryClient();
    client.setQueryData(["chatgpt-exports", orderedSceneFrames(data.scenes[0].frames)[0]?.id], receipts);
    return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(FrameEditor, { project: data })));
}
describe("Frame Workspace polish", () => {
    it("opens Basic and Camera for a new composition, leaving context and technical details closed", () => {
        const html = render(project([frame("f1", 1, "NEW_COMPOSITION")]));
        expect(initialFrameSections("NEW_COMPOSITION")).toEqual({ main: true, camera: true, continuity: false });
        expect(html).toMatch(/<details class="frameFieldGroup" open=""><summary>Основное<\/summary>/u);
        expect(html).toMatch(/<details class="frameFieldGroup" open=""><summary>Камера и постановка<\/summary>/u);
        expect(html).not.toContain("Продолжение и изменения</summary>");
        expect(html).toMatch(/<details class="frameFieldGroup frameContextGroup"><summary>/u);
        expect(html).toMatch(/<details class="technicalDetails"><summary>/u);
    });
    it("keeps the compact Continuity summary closed initially", () => {
        const html = render(project([frame("f1", 1, "CONTINUE_PREVIOUS_FRAME")]));
        expect(initialFrameSections("CONTINUE_PREVIOUS_FRAME")).toEqual({ main: true, camera: false, continuity: false });
        expect(html).toMatch(/<details class="frameFieldGroup"><summary>Камера и постановка<\/summary>/u);
        expect(html).toMatch(/<details class="frameFieldGroup continuityGroup"><summary>Продолжение и изменения/u);
        expect(html).toContain("0 обнаружено · 0 категории · CHANGE ONLY задан · FORBIDDEN не задан");
        expect(html).toContain("Keep the pose");
    });
    it("summarizes detected and explicit continuity categories without inventing conflicts", () => {
        const summary = continuityContractSummary({ changes: ["Move beside the desk"], forbidden: ["Do not add props"], allowedChanges: ["camera", "character.pose"] }, [
            { entityId: "character", category: "character.pose", label: "Pose", previousValue: "seated", currentValue: "standing" },
            { entityId: "character", category: "character.position", label: "Position", previousValue: "sofa", currentValue: "desk" }
        ]);
        expect(summary).toEqual({ detectedCount: 2, allowedCategoryCount: 3, hasExplicitChanges: true, hasForbiddenChanges: true });
        expect(summary).not.toHaveProperty("conflictCount");
    });
    it("changes disclosure state without touching editable Frame data or unmounting its fields", () => {
        const data = frame("f1", 1, "NEW_COMPOSITION");
        const draftBefore = JSON.stringify(data);
        const initial = initialFrameSections(data.generationStrategy);
        const collapsed = toggleFrameSection(initial, "camera");
        expect(collapsed.camera).toBe(false);
        expect(initial.camera).toBe(true);
        expect(JSON.stringify(data)).toBe(draftBefore);
        expect(render(project([data]))).toContain("Camera text stays in the draft");
    });
    it("keeps viewing, selecting and locking separate", () => {
        const data = frame("f1", 1, "NEW_COMPOSITION");
        const candidates = storyboardImageCandidates(data);
        expect(openedFrameCandidate(candidates, "g2")?.id).toBe("g2");
        expect(data.selectedGenerationId).toBe("g1");
        const html = render(project([data]));
        expect(html).toContain("OPENED <strong>g1 · SUCCESS</strong>");
        expect(html).toContain('class="status status-selected">SELECTED</span>');
        expect(html).toContain("Выбрать");
        expect(html).toContain("Закрепить");
        expect(html).toContain("Repair");
        expect(html).toContain('title="Этот результат уже выбран" disabled=""');
        expect(html).toContain('title="Закрепить выбранный результат"');
        const locked = render(project([{ ...data, status: "LOCKED" }]));
        expect(locked).toContain("Кадр <strong>LOCKED</strong>");
        expect(locked).toContain('class="status status-locked">LOCKED</span>');
        expect(locked).toContain('title="Кадр уже закреплён" disabled=""');
        expect(locked).toContain('title="Открыть Repair для этого результата"');
    });
    it("resolves the selected import receipt without changing it when history is opened", () => {
        const receipts = [
            { exportId: "new", frameCode: "S001_F001", createdAt: "2026-01-02T00:00:00Z", strategy: "NEW_COMPOSITION", baseFrameCode: null },
            { exportId: "old", frameCode: "S001_F001", createdAt: "2026-01-01T00:00:00Z", strategy: "NEW_COMPOSITION", baseFrameCode: null }
        ];
        expect(selectedChatGPTReceipt(receipts, "old")?.exportId).toBe("old");
        expect(selectedChatGPTReceipt(receipts, "missing")).toBeUndefined();
        const html = render(project([frame("f1", 1, "NEW_COMPOSITION")]), receipts);
        expect(html).toContain("История экспорта · 2");
        expect(html).toContain('aria-label="ChatGPT export receipt"');
        expect(html).toContain("Нет выбранного receipt");
    });
    it("uses storyboard sequence order for heading and previous/next navigation", () => {
        const later = frame("f7", 7, "NEW_COMPOSITION");
        const earlier = frame("f2", 2, "NEW_COMPOSITION");
        expect(orderedSceneFrames([later, earlier]).map((item) => item.id)).toEqual(["f2", "f7"]);
        const html = render(project([later, earlier]));
        expect(html).toContain("Сцена 1 · Кадр 1 из 2");
        expect(html).toContain("S001_F002");
        expect(html).toContain('aria-label="Следующий кадр"');
    });
    it("keeps every workspace section available behind the responsive menu", () => {
        const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(Workspace)));
        expect(html).toContain('aria-label="Открыть меню"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain("Раскадровка");
        expect(html).toContain("Генерации");
        expect(html).toContain("Настройки");
    });
});
