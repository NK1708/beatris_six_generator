import { describe, expect, it } from "vitest";
import type { FrameStoryStateProvenance, StoryStateDocument } from "@bearridge/shared";
import { resolveContinuityBaseline, resolveInitialFrameTargetStoryState } from "./frameStoryState.js";

function state(sceneId = "scene-1", position = "sofa"): StoryStateDocument {
  return {
    sceneId,
    time: { description: "Late afternoon" },
    environment: { door: "closed" },
    characters: { birdman: { present: true, locationPosition: position, heldProps: [] } },
    props: {},
    storyFacts: ["Waiting"]
  };
}

function generation(id: string, snapshot: unknown = state(), status = "SUCCESS") {
  return { id, status, storyStateSnapshot: snapshot };
}

function locked(overrides: Record<string, unknown> = {}) {
  return {
    id: "frame-1",
    status: "LOCKED",
    selectedGenerationId: "selected",
    generations: [generation("selected")],
    ...overrides
  };
}

describe("resolveInitialFrameTargetStoryState", () => {
  it("initializes the first Frame from a valid Scene Story State", () => {
    const source = state();
    const result = resolveInitialFrameTargetStoryState({ sceneId: "scene-1", sceneStoryState: source });
    expect(result).toMatchObject({ status: "RESOLVED", target: { provenance: { origin: "SCENE_INITIAL" }, document: source }, diagnostics: [] });
  });

  it("creates a valid empty target with a diagnostic when the first Frame has no Scene Story State", () => {
    const result = resolveInitialFrameTargetStoryState({ sceneId: "scene-1" });
    expect(result).toMatchObject({
      status: "RESOLVED",
      target: { provenance: { origin: "EMPTY_DEFAULT" }, document: { sceneId: "scene-1", characters: {}, environment: {} } },
      diagnostics: [{ kind: "MISSING", code: "MISSING_SCENE_STORY_STATE", severity: "warning" }]
    });
  });

  it("blocks a corrupt first-frame Scene Story State without an empty fallback", () => {
    const result = resolveInitialFrameTargetStoryState({ sceneId: "scene-1", sceneStoryState: "{broken" });
    expect(result).toMatchObject({ status: "BLOCKED", diagnostics: [{ kind: "INVALID", code: "INVALID_SCENE_STORY_STATE" }] });
  });

  it("inherits only the selected successful Generation snapshot from a LOCKED predecessor", () => {
    const selectedState = state("scene-1", "coffee maker");
    const result = resolveInitialFrameTargetStoryState({
      sceneId: "scene-1",
      predecessor: locked({
        generations: [generation("selected", JSON.stringify(selectedState)), generation("newer", state("scene-1", "doorway"))]
      })
    });
    expect(result).toMatchObject({
      status: "RESOLVED",
      target: {
        document: selectedState,
        provenance: { origin: "INHERITED_LOCKED_GENERATION", sourceFrameId: "frame-1", sourceGenerationId: "selected" }
      }
    });
  });

  it("inherits a REVIEW predecessor target as unconfirmed without creating a baseline", () => {
    const result = resolveInitialFrameTargetStoryState({
      sceneId: "scene-1",
      predecessor: {
        id: "middle-frame",
        status: "REVIEW",
        generations: [generation("candidate")],
        target: { document: state(), provenance: { origin: "EXPLICIT" } }
      }
    });
    expect(result).toMatchObject({
      status: "RESOLVED",
      target: { provenance: { origin: "INHERITED_UNCONFIRMED_FRAME_TARGET", sourceFrameId: "middle-frame" } },
      diagnostics: [{ kind: "UNCONFIRMED", code: "UNCONFIRMED_PREDECESSOR_TARGET" }]
    });
  });

  it("blocks REVIEW or DRAFT inheritance when target is missing or invalid", () => {
    const missing = resolveInitialFrameTargetStoryState({
      sceneId: "scene-1",
      predecessor: { id: "frame-1", status: "REVIEW", generations: [] }
    });
    const invalid = resolveInitialFrameTargetStoryState({
      sceneId: "scene-1",
      predecessor: { id: "frame-1", status: "DRAFT", generations: [], target: { document: {}, provenance: { origin: "EXPLICIT" } } }
    });
    expect(missing).toMatchObject({ status: "BLOCKED", diagnostics: [{ code: "MISSING_PREDECESSOR_TARGET" }] });
    expect(invalid).toMatchObject({ status: "BLOCKED", diagnostics: [{ code: "INVALID_PREDECESSOR_TARGET" }] });
  });

  it.each([
    [locked({ selectedGenerationId: null }), "NO_SELECTION"],
    [locked({ selectedGenerationId: "absent" }), "GENERATION_NOT_FOUND"],
    [locked({ generations: [generation("selected", state(), "FAILED")] }), "GENERATION_NOT_SUCCESS"],
    [locked({ generations: [{ id: "selected", status: "SUCCESS" }] }), "MISSING_SNAPSHOT"],
    [locked({ generations: [generation("selected", "not-json")] }), "INVALID_SNAPSHOT"]
  ])("blocks invalid LOCKED predecessor input: %s", (predecessor, code) => {
    expect(resolveInitialFrameTargetStoryState({ sceneId: "scene-1", predecessor })).toMatchObject({
      status: "BLOCKED",
      diagnostics: [{ code }]
    });
  });

  it("uses the explicitly supplied predecessor for insertion and never mutates source documents", () => {
    const source = state("scene-1", "frame-3 position");
    const before = JSON.stringify(source);
    const result = resolveInitialFrameTargetStoryState({
      sceneId: "scene-1",
      predecessor: locked({ id: "frame-3", generations: [generation("selected", source)] })
    });
    expect(result).toMatchObject({ status: "RESOLVED", target: { provenance: { sourceFrameId: "frame-3" } } });
    if (result.status === "RESOLVED") result.target.document.environment.door = "open";
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps legacy and explicit provenance distinguishable", () => {
    const explicit: FrameStoryStateProvenance = { origin: "EXPLICIT" };
    const legacy: FrameStoryStateProvenance = { origin: "LEGACY_GENERATION_INPUT", sourceFrameId: "frame-1", sourceGenerationId: "generation-1" };
    expect(explicit.origin).not.toBe(legacy.origin);
    expect(legacy).toHaveProperty("sourceGenerationId", "generation-1");
  });
});

describe("resolveContinuityBaseline", () => {
  const visualBase = { generationId: "selected", filePath: "generations/frame.png", mimeType: "image/png" };

  it("returns state and visual base from the same selected successful Generation", () => {
    const result = resolveContinuityBaseline({ predecessor: locked(), visualBase });
    expect(result).toMatchObject({
      status: "AVAILABLE",
      frameId: "frame-1",
      generationId: "selected",
      storyState: state(),
      visualBase
    });
  });

  it.each([
    [{ predecessor: { ...locked(), status: "REVIEW" }, visualBase }, "NOT_LOCKED"],
    [{ predecessor: locked({ selectedGenerationId: null }), visualBase }, "NO_SELECTION"],
    [{ predecessor: locked({ selectedGenerationId: "absent" }), visualBase }, "GENERATION_NOT_FOUND"],
    [{ predecessor: locked({ generations: [generation("selected", state(), "FAILED")] }), visualBase }, "GENERATION_NOT_SUCCESS"],
    [{ predecessor: locked({ generations: [{ id: "selected", status: "SUCCESS" }] }), visualBase }, "MISSING_SNAPSHOT"],
    [{ predecessor: locked({ generations: [generation("selected", "not-json")] }), visualBase }, "INVALID_SNAPSHOT"],
    [{ predecessor: locked() }, "MISSING_VISUAL_BASE"],
    [{ predecessor: locked(), visualBase: { ...visualBase, generationId: "other" } }, "VISUAL_BASE_GENERATION_MISMATCH"]
  ])("returns a typed unavailable reason: %s", (input, reason) => {
    expect(resolveContinuityBaseline(input)).toMatchObject({ status: "UNAVAILABLE", reason, diagnostic: { severity: "blocking" } });
  });

  it("does not mutate baseline state or visual-base inputs", () => {
    const source = state();
    const base = { ...visualBase };
    const result = resolveContinuityBaseline({ predecessor: locked({ generations: [generation("selected", source)] }), visualBase: base });
    if (result.status === "AVAILABLE") {
      result.storyState.environment.door = "open";
      result.visualBase.filePath = "changed.png";
    }
    expect(source.environment.door).toBe("closed");
    expect(base.filePath).toBe("generations/frame.png");
  });
});
