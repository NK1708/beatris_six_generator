import { describe, expect, it } from "vitest";
import type { FrameGenerationReadiness } from "@bearridge/shared";
import { storyStateFingerprint } from "@bearridge/core";
import { ProductionGenerationGate, ProductionGenerationReadinessError } from "./services/productionGenerationGate.js";

describe("ProductionGenerationGate", () => {
  it("passes two identical READY checks", async () => {
    const value = ready();
    const gate = new ProductionGenerationGate(async () => value);
    await expect(gate.revalidate(await gate.open())).resolves.toEqual(value);
  });

  it("returns typed BLOCKED reasons on the first check", async () => {
    const gate = new ProductionGenerationGate(async () => blocked("TARGET_NOT_INITIALIZED"));
    await expect(gate.open()).rejects.toMatchObject({
      code: "PRODUCTION_GENERATION_BLOCKED",
      reasons: ["TARGET_NOT_INITIALIZED"]
    });
  });

  it.each([
    ["target revision", ready({ targetRevision: 2, target: { ...ready().target, revision: 2 } })],
    ["selected Generation", ready({ selectedPredecessorGenerationId: "generation-2" })]
  ])("detects changed %s between READY checks", async (_label, second) => {
    const values = [ready(), second];
    const gate = new ProductionGenerationGate(async () => values.shift()!);
    const initial = await gate.open();
    await expect(gate.revalidate(initial)).rejects.toMatchObject({
      code: "GENERATION_READINESS_STALE",
      reasons: ["GENERATION_READINESS_STALE"]
    });
  });

  it.each([
    "FRAME_STATUS_NOT_GENERATABLE",
    "VISUAL_BASE_FILE_UNAVAILABLE"
  ] as const)("reports stale when the second check becomes %s", async (reason) => {
    const values: FrameGenerationReadiness[] = [ready(), blocked(reason)];
    const gate = new ProductionGenerationGate(async () => values.shift()!);
    await expect(gate.revalidate(await gate.open())).rejects.toMatchObject({
      code: "GENERATION_READINESS_STALE",
      reasons: ["GENERATION_READINESS_STALE", reason]
    });
  });
});

function ready(overrides: Partial<Extract<FrameGenerationReadiness, { status: "READY" }>> = {}): Extract<FrameGenerationReadiness, { status: "READY" }> {
  return {
    status: "READY",
    mode: "CONTINUE_PREVIOUS_FRAME",
    frameId: "frame-2",
    target: { document: state(), revision: 1, provenance: { origin: "EXPLICIT" } },
    targetRevision: 1,
    targetFingerprint: storyStateFingerprint(state()),
    continuityBaseline: {
      status: "AVAILABLE",
      frameId: "frame-1",
      generationId: "generation-1",
      storyState: state(),
      visualBase: { generationId: "generation-1", filePath: "generations/base.png" }
    },
    selectedPredecessorGenerationId: "generation-1",
    ...overrides
  };
}

function blocked(reason: Extract<FrameGenerationReadiness, { status: "BLOCKED" }>["reasons"][number]): Extract<FrameGenerationReadiness, { status: "BLOCKED" }> {
  return {
    status: "BLOCKED",
    mode: "CONTINUE_PREVIOUS_FRAME",
    frameId: "frame-2",
    reasons: [reason],
    diagnostics: [{ reason, message: reason, frameId: "frame-2" }]
  };
}

function state() {
  return { sceneId: "scene-1", time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: [] };
}
