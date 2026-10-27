import { describe, expect, it } from "vitest";
import { resolveFrameLockReadiness, storyStateFingerprint, type FrameLockReadinessInput } from "./index.js";

const state = { sceneId: "scene", time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: [] };
const ready: FrameLockReadinessInput = {
  frame: { id: "frame", status: "REVIEW", selectedGenerationId: "generation" },
  generation: { id: "generation", frameId: "frame", status: "SUCCESS", storyStateSnapshot: JSON.stringify(state) },
  target: { status: "AVAILABLE", document: state, revision: 4 },
  output: { status: "AVAILABLE", generationId: "generation" }
};

describe("resolveFrameLockReadiness", () => {
  it("returns a reproducible READY token", () => {
    expect(resolveFrameLockReadiness(ready)).toEqual({ status: "READY", frameId: "frame", selectedGenerationId: "generation", targetRevision: 4, targetFingerprint: storyStateFingerprint(state), snapshotFingerprint: storyStateFingerprint(state) });
  });

  it.each([
    ["FRAME_NOT_FOUND", {}],
    ["FRAME_GENERATING", { ...ready, frame: { ...ready.frame!, status: "GENERATING" } }],
    ["SELECTION_MISSING", { ...ready, frame: { ...ready.frame!, selectedGenerationId: null }, generation: undefined }],
    ["GENERATION_NOT_FOUND", { ...ready, generation: undefined }],
    ["GENERATION_NOT_SUCCESS", { ...ready, generation: { ...ready.generation!, status: "FAILED" } }],
    ["GENERATION_OWNERSHIP_MISMATCH", { ...ready, generation: { ...ready.generation!, frameId: "other" } }],
    ["OUTPUT_FILE_MISSING", { ...ready, output: { status: "UNAVAILABLE" } }],
    ["SNAPSHOT_MISSING", { ...ready, generation: { ...ready.generation!, storyStateSnapshot: null } }],
    ["SNAPSHOT_INVALID", { ...ready, generation: { ...ready.generation!, storyStateSnapshot: "{" } }],
    ["TARGET_NOT_INITIALIZED", { ...ready, target: { status: "MISSING" } }],
    ["TARGET_INVALID", { ...ready, target: { status: "INVALID" } }],
    ["TARGET_SNAPSHOT_MISMATCH", { ...ready, target: { status: "AVAILABLE", document: { ...state, time: { description: "night" } }, revision: 5 } }],
    ["GENERATION_METADATA_INCONSISTENT", { ...ready, generation: { ...ready.generation!, productionTargetFingerprint: "different" } }]
  ] as const)("blocks with %s", (reason, input) => {
    const result = resolveFrameLockReadiness(input as FrameLockReadinessInput);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain(reason);
  });

  it("accepts matching content across revisions and legacy metadata absence", () => {
    expect(resolveFrameLockReadiness({ ...ready, target: { status: "AVAILABLE", document: JSON.parse(JSON.stringify(state)), revision: 99 } }).status).toBe("READY");
  });
});
