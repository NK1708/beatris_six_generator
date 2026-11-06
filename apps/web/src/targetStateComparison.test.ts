import { describe, expect, it } from "vitest";
import { storyStateSchema, type AvailableFrameTargetStoryStateResponse } from "@bearridge/shared";
import type { Scene } from "./model.js";
import { compareTargetProperty, resolveTargetComparisonSource, targetStateDiff, type TargetComparisonSource } from "./targetStateComparison.js";

const doc = storyStateSchema.parse({ sceneId: "s", time: { description: "Morning" }, environment: { lamp: false, floor: 0, sky: null, empty: "" }, characters: { a: { present: true } }, props: { cup: {} }, storyFacts: ["one", "two"] });
const target = { status: "AVAILABLE", frameId: "f2", originType: "SCENE_INITIAL", sourceFrameId: "f1", sourceGenerationId: "historical", document: doc } as AvailableFrameTargetStoryStateResponse;
const scene = { id: "s", storyState: { document: doc }, frames: [{ id: "f1", frameCode: "F1", selectedGenerationId: "newer", generations: [{ id: "historical", status: "SUCCESS", storyStateSnapshot: JSON.stringify(doc) }, { id: "newer", status: "SUCCESS", storyStateSnapshot: JSON.stringify({ ...doc, time: { description: "Wrong" } }) }] }, { id: "f2", generations: [] }] } as unknown as Scene;
const source: TargetComparisonSource = { status: "AVAILABLE", document: doc, label: "test", note: "" };

describe("Target source evidence", () => {
  it("labels Scene state as current, without claiming a historical snapshot", () => {
    const result = resolveTargetComparisonSource(target, scene);
    expect(result.status).toBe("AVAILABLE");
    expect(result.label).toContain("Текущее");
    expect(result.note).toContain("не хранится");
  });
  it("resolves exact lineage generation, independent of current selection", () => {
    const result = resolveTargetComparisonSource({ ...target, originType: "INHERITED_LOCKED_GENERATION" }, scene);
    expect(result.status === "AVAILABLE" && result.document.time.description).toBe("Morning");
    expect(result.status === "AVAILABLE" && result.generationId).toBe("historical");
  });
  it.each(["INHERITED_FRAME_TARGET", "INHERITED_UNCONFIRMED_FRAME_TARGET", "EXPLICIT", "EMPTY_DEFAULT"] as const)("does not guess source for %s", originType => {
    expect(resolveTargetComparisonSource({ ...target, originType }, scene).status).toBe("UNAVAILABLE");
  });
  it("refuses absent, corrupt and cross-scene snapshots without fallback", () => {
    for (const raw of [null, "{bad", JSON.stringify({ ...doc, sceneId: "other" })]) {
      const invalid = structuredClone(scene);
      invalid.frames[0]!.generations[0]!.storyStateSnapshot = raw;
      expect(resolveTargetComparisonSource({ ...target, originType: "INHERITED_LOCKED_GENERATION" }, invalid).status).toBe("UNAVAILABLE");
    }
    expect(resolveTargetComparisonSource({ ...target, originType: "INHERITED_LOCKED_GENERATION", sourceGenerationId: "missing" }, scene).status).toBe("UNAVAILABLE");
  });
});

describe("UI property comparison", () => {
  it("distinguishes missing, false, zero, null and empty text", () => {
    for (const key of ["lamp", "floor", "sky", "empty"]) expect(compareTargetProperty(source, doc, ["environment", key]).status).toBe("unchanged");
    const next = structuredClone(doc); delete next.environment.sky; next.environment.lamp = "false"; next.environment.new = null;
    expect(compareTargetProperty(source, next, ["environment", "sky"]).status).toBe("removed");
    expect(compareTargetProperty(source, next, ["environment", "lamp"]).status).toBe("changed");
    expect(compareTargetProperty(source, next, ["environment", "new"]).status).toBe("added");
    expect(compareTargetProperty(source, next, ["characters", "a", "emotion"]).status).toBe("unchanged");
  });
  it("compares all sections and preserves ordered facts and held props", () => {
    const next = structuredClone(doc); next.time.description = "Evening"; next.characters.a = { present: false, heldProps: ["cup"] }; delete next.props.cup; next.storyFacts.reverse();
    const rows = targetStateDiff(source, next);
    expect(rows.find(row => row.path.join(".") === "props.cup")?.status).toBe("removed");
    expect(rows.find(row => row.path.join(".") === "characters.a.present")?.status).toBe("changed");
    expect(rows.find(row => row.path.join(".") === "characters.a.heldProps")?.status).toBe("added");
    expect(rows.find(row => row.path.join(".") === "storyFacts")?.status).toBe("changed");
    expect(rows.find(row => row.path.join(".") === "time.description")?.status).toBe("changed");
  });
  it("marks unknown source unavailable rather than added", () => {
    expect(targetStateDiff({ status: "UNAVAILABLE", label: "", note: "" }, doc).every(row => row.status === "unavailable")).toBe(true);
  });
});
