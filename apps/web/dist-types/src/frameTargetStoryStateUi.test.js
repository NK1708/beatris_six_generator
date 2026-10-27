import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FrameTargetStoryStateView, frameTargetStoryStateQueryKey } from "./components/FrameTargetStoryStatePanel.js";
const document = {
    sceneId: "scene-1",
    time: { description: "Late evening" },
    environment: { lights: "dim", doorOpen: true, floor: 2 },
    characters: {
        birdman: { present: true, outfitId: "outfit-1", emotion: "calm", pose: "standing", heldProps: ["key"] }
    },
    props: { key: { holderCharacterId: "birdman", state: "held" } },
    storyFacts: ["The meeting has started"]
};
const character = { id: "birdman", name: "Birdman" };
function available(originType = "SCENE_INITIAL", patch = {}) {
    return {
        status: "AVAILABLE", id: "target-1", frameId: "frame-1", document, revision: 3, originType,
        sourceFrameId: null, sourceGenerationId: null, explicitlyEditedAt: null,
        createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-21T10:00:00.000Z", ...patch
    };
}
function render(response, options = {}) {
    return renderToStaticMarkup(React.createElement(FrameTargetStoryStateView, {
        response,
        loading: options.loading,
        requestError: options.requestError,
        frameStatus: options.locked ? "LOCKED" : "DRAFT",
        characters: [character]
    }));
}
describe("Frame Target Story State read-only UI", () => {
    it("renders AVAILABLE document sections and canonical character names", () => {
        const html = render(available());
        expect(html).toContain("Время");
        expect(html).toContain("Late evening");
        expect(html).toContain("Окружение");
        expect(html).toContain("lights");
        expect(html).toContain("dim");
        expect(html).toContain("Birdman");
        expect(html).toContain("standing");
        expect(html).toContain("Предметы");
        expect(html).toContain("key");
        expect(html).toContain("Сюжетные факты");
        expect(html).toContain("The meeting has started");
    });
    it("keeps all empty document sections visible and does not synthesize fallback values", () => {
        const html = render(available("EXPLICIT", { document: { sceneId: "scene-1", time: { description: "" }, environment: {}, characters: {}, props: {}, storyFacts: [] } }));
        expect(html.match(/Не задано/gu)).toHaveLength(5);
        expect(html).toContain("Время");
        expect(html).toContain("Окружение");
        expect(html).toContain("Персонажи");
        expect(html).toContain("Предметы");
        expect(html).toContain("Сюжетные факты");
    });
    it("renders loading, request error, MISSING and INVALID as distinct states", () => {
        expect(render(undefined, { loading: true })).toContain("Загрузка целевого состояния");
        expect(render(undefined, { requestError: true })).toContain("Не удалось загрузить целевое состояние");
        expect(render({ status: "MISSING", frameId: "frame-1", legacy: true })).toContain("Целевое состояние кадра отсутствует");
        const invalid = render({ status: "INVALID", frameId: "frame-1", code: "TARGET_INVALID", message: "C:\\secret\\project.sqlite", diagnostics: [{ kind: "INVALID", severity: "blocking", code: "INVALID_SNAPSHOT", message: "SQL internal", issues: ["raw stack"] }] });
        expect(invalid).toContain("Целевое состояние кадра повреждено");
        expect(invalid).toContain("Снимок состояния выбранной генерации имеет неверный формат");
        expect(invalid).not.toContain("secret");
        expect(invalid).not.toContain("SQL internal");
        expect(invalid).not.toContain("raw stack");
    });
    it("renders every persisted origin with its exact code and readable label", () => {
        const origins = ["SCENE_INITIAL", "INHERITED_FRAME_TARGET", "INHERITED_LOCKED_GENERATION", "INHERITED_UNCONFIRMED_FRAME_TARGET", "EXPLICIT", "LEGACY_GENERATION_INPUT", "EMPTY_DEFAULT"];
        for (const origin of origins) {
            const html = render(available(origin));
            expect(html).toContain(origin);
            expect(html).toContain("Происхождение");
        }
    });
    it("shows revision, edit time and source provenance without changing the origin", () => {
        const html = render(available("INHERITED_LOCKED_GENERATION", { sourceFrameId: "frame-source", sourceGenerationId: "generation-source", explicitlyEditedAt: "2026-10-22T12:30:00.000Z" }));
        expect(html).toContain("Revision");
        expect(html).toContain(">3<");
        expect(html).toContain("frame-source");
        expect(html).toContain("generation-source");
        expect(html).toContain("Изменено вручную");
        expect(html).toContain("INHERITED_LOCKED_GENERATION");
    });
    it("distinguishes unconfirmed, empty-default and legacy origin notices", () => {
        expect(render(available("INHERITED_UNCONFIRMED_FRAME_TARGET"))).toContain("не является подтверждённым результатом генерации");
        expect(render(available("EMPTY_DEFAULT"))).toContain("создано пустое целевое состояние");
        expect(render(available("LEGACY_GENERATION_INPUT"))).toContain("не подтверждённое состояние после кадра");
    });
    it("shows typed diagnostics through safe labels", () => {
        const html = render(available("SCENE_INITIAL", { diagnostics: [{ kind: "MISSING", severity: "warning", code: "MISSING_SCENE_STORY_STATE", message: "C:\\private\\db" }] }));
        expect(html).toContain("Начальное состояние сцены отсутствовало");
        expect(html).not.toContain("private");
    });
    it("marks AVAILABLE and legacy MISSING locked frames as read-only", () => {
        expect(render(available(), { locked: true })).toContain("LOCKED · Только просмотр");
        expect(render({ status: "MISSING", frameId: "frame-1", legacy: true }, { locked: true })).toContain("LOCKED · Только просмотр");
    });
    it("escapes user strings instead of interpreting HTML", () => {
        const html = render(available("EXPLICIT", { document: { ...document, storyFacts: ["<script>alert('x')</script>"] } }));
        expect(html).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
        expect(html).not.toContain("<script>");
    });
    it("uses frame-scoped query identities so an old frame response cannot populate a new frame", () => {
        expect(frameTargetStoryStateQueryKey("frame-1")).toEqual(["frame-target-story-state", "frame-1"]);
        expect(frameTargetStoryStateQueryKey("frame-2")).toEqual(["frame-target-story-state", "frame-2"]);
        expect(frameTargetStoryStateQueryKey("frame-1")).not.toEqual(frameTargetStoryStateQueryKey("frame-2"));
    });
    it("contains no initialize calls and supplies desktop/mobile layouts", () => {
        const source = readFileSync(new URL("./components/FrameTargetStoryStatePanel.tsx", import.meta.url), "utf8");
        const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
        expect(source).toContain("api.getFrameTargetStoryState");
        expect(source).not.toContain("initializeFrameTargetStoryState");
        expect(source).toContain("updateFrameTargetStoryState");
        expect(source).not.toContain("api.post");
        expect(source).not.toContain("api.put");
        expect(css).toContain(".targetStateDocument { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
        expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.targetStateDocument \{ grid-template-columns: minmax\(0, 1fr\); \}/u);
    });
});
