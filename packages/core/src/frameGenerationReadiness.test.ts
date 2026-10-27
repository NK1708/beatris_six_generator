import { describe, expect, it } from "vitest";
import type { ContinuityBaseline, FrameGenerationStrategy } from "@bearridge/shared";
import { resolveFrameGenerationReadiness, type FrameGenerationReadinessInput } from "./frameGenerationReadiness.js";

describe("resolveFrameGenerationReadiness", () => {
  it("allows NEW_COMPOSITION with a valid persisted target and no predecessor", () => {
    const result = resolveFrameGenerationReadiness(input("NEW_COMPOSITION"));
    expect(result).toMatchObject({
      status: "READY",
      mode: "NEW_COMPOSITION",
      frameId: "frame-2",
      targetRevision: 7,
      target: { provenance: { origin: "EXPLICIT" } }
    });
    expect(result).not.toHaveProperty("continuityBaseline");
  });

  it.each([
    ["MISSING", "TARGET_NOT_INITIALIZED"],
    ["INVALID", "TARGET_INVALID"]
  ] as const)("blocks NEW_COMPOSITION for a %s target", (status, reason) => {
    const result = resolveFrameGenerationReadiness({ ...input("NEW_COMPOSITION"), target: { status } });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: [reason] });
  });

  it("validates an AVAILABLE target instead of trusting its type boundary", () => {
    const result = resolveFrameGenerationReadiness({
      ...input("NEW_COMPOSITION"),
      target: { status: "AVAILABLE", document: { sceneId: 1 }, revision: 1, provenance: { origin: "EXPLICIT" } }
    });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: ["TARGET_INVALID"] });
  });

  it.each(["GENERATING", "LOCKED"] as const)("blocks non-generatable Frame status %s", (status) => {
    const base = input("NEW_COMPOSITION");
    const result = resolveFrameGenerationReadiness({ ...base, frame: { ...base.frame!, status } });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: ["FRAME_STATUS_NOT_GENERATABLE"] });
  });

  it("reports a missing Frame", () => {
    expect(resolveFrameGenerationReadiness({ mode: "NEW_COMPOSITION" })).toMatchObject({
      status: "BLOCKED",
      reasons: ["FRAME_NOT_FOUND"]
    });
  });

  it("allows CONTINUE only with one matching metadata and physical baseline", () => {
    const result = resolveFrameGenerationReadiness(input("CONTINUE_PREVIOUS_FRAME"));
    expect(result).toMatchObject({
      status: "READY",
      mode: "CONTINUE_PREVIOUS_FRAME",
      selectedPredecessorGenerationId: "generation-1",
      continuityBaseline: { frameId: "frame-1", generationId: "generation-1" }
    });
  });

  it("blocks CONTINUE without a predecessor", () => {
    const base = input("CONTINUE_PREVIOUS_FRAME");
    const result = resolveFrameGenerationReadiness({
      ...base,
      frame: { ...base.frame!, previousFrameId: null },
      predecessorExists: false,
      continuityBaseline: unavailable("NOT_LOCKED")
    });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: ["PREDECESSOR_NOT_FOUND"] });
  });

  it.each([
    ["NOT_LOCKED", "PREDECESSOR_NOT_LOCKED"],
    ["NO_SELECTION", "PREDECESSOR_SELECTION_MISSING"],
    ["GENERATION_NOT_FOUND", "PREDECESSOR_GENERATION_NOT_FOUND"],
    ["GENERATION_NOT_SUCCESS", "PREDECESSOR_GENERATION_NOT_SUCCESS"],
    ["MISSING_SNAPSHOT", "PREDECESSOR_SNAPSHOT_INVALID"],
    ["INVALID_SNAPSHOT", "PREDECESSOR_SNAPSHOT_INVALID"],
    ["MISSING_VISUAL_BASE", "VISUAL_BASE_MISSING"],
    ["VISUAL_BASE_GENERATION_MISMATCH", "VISUAL_BASE_GENERATION_MISMATCH"]
  ] as const)("maps baseline reason %s to %s", (baselineReason, readinessReason) => {
    const result = resolveFrameGenerationReadiness({
      ...input("CONTINUE_PREVIOUS_FRAME"),
      continuityBaseline: unavailable(baselineReason)
    });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: [readinessReason] });
  });

  it("blocks an unavailable physical image without exposing a path", () => {
    const result = resolveFrameGenerationReadiness({
      ...input("CONTINUE_PREVIOUS_FRAME"),
      physicalVisualBase: { status: "UNAVAILABLE", message: "Image file is unavailable." }
    });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: ["VISUAL_BASE_FILE_UNAVAILABLE"] });
    expect(JSON.stringify(result)).not.toContain("C:\\");
  });

  it("rejects a physically validated image from another Generation", () => {
    const result = resolveFrameGenerationReadiness({
      ...input("CONTINUE_PREVIOUS_FRAME"),
      physicalVisualBase: { status: "AVAILABLE", generationId: "generation-other" }
    });
    expect(result).toMatchObject({ status: "BLOCKED", reasons: ["VISUAL_BASE_GENERATION_MISMATCH"] });
  });
});

function input(mode: FrameGenerationStrategy): FrameGenerationReadinessInput {
  return {
    mode,
    frame: { id: "frame-2", status: "DRAFT", previousFrameId: mode === "CONTINUE_PREVIOUS_FRAME" ? "frame-1" : null },
    target: { status: "AVAILABLE", document: state(), revision: 7, provenance: { origin: "EXPLICIT" } },
    predecessorExists: mode === "CONTINUE_PREVIOUS_FRAME",
    continuityBaseline: availableBaseline(),
    physicalVisualBase: { status: "AVAILABLE", generationId: "generation-1" }
  };
}

function state() {
  return { sceneId: "scene-1", time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: [] };
}

function availableBaseline(): ContinuityBaseline {
  return {
    status: "AVAILABLE",
    frameId: "frame-1",
    generationId: "generation-1",
    storyState: state(),
    visualBase: { generationId: "generation-1", filePath: "generations/base.png" }
  };
}

function unavailable(reason: Extract<ContinuityBaseline, { status: "UNAVAILABLE" }>["reason"]): ContinuityBaseline {
  return {
    status: "UNAVAILABLE",
    reason,
    diagnostic: { kind: "MISSING", severity: "blocking", code: reason, message: reason }
  };
}
