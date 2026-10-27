import { describe, expect, it } from "vitest";
import { resolveFrameGenerationReadiness, type FrameContext } from "@bearridge/core";
import { prepareProductionGenerationContext } from "./services/productionGenerationContext.js";

describe("prepareProductionGenerationContext", () => {
  it("creates an isolated production-only context without mutating FrameContext or readiness documents", () => {
    const live = state("live");
    const target = state("target");
    const baseline = state("baseline");
    const frameContext = {
      frame: { id: "frame-2" },
      storyState: live,
      previousStoryState: state("legacy-previous")
    } as unknown as FrameContext;
    const readiness = resolveFrameGenerationReadiness({
      mode: "CONTINUE_PREVIOUS_FRAME",
      frame: { id: "frame-2", status: "DRAFT", previousFrameId: "frame-1" },
      target: { status: "AVAILABLE", document: target, revision: 3, provenance: { origin: "EXPLICIT" } },
      predecessorExists: true,
      continuityBaseline: {
        status: "AVAILABLE",
        frameId: "frame-1",
        generationId: "generation-1",
        storyState: baseline,
        visualBase: { generationId: "generation-1", filePath: "generations/base.png" }
      },
      physicalVisualBase: { status: "AVAILABLE", generationId: "generation-1" }
    });
    if (readiness.status !== "READY") throw new Error("Expected READY fixture.");
    const before = JSON.stringify(frameContext);

    const prepared = prepareProductionGenerationContext(frameContext, readiness);

    expect(prepared.context.storyState).toEqual(target);
    expect(prepared.context.previousStoryState).toEqual(baseline);
    expect(JSON.stringify(frameContext)).toBe(before);
    expect(prepared.context).not.toBe(frameContext);
    expect(prepared.targetStoryState).not.toBe(readiness.target.document);
    prepared.targetStoryState.environment.marker = "mutated-copy";
    expect(readiness.target.document.environment.marker).toBe("target");
    expect(frameContext.storyState.environment.marker).toBe("live");
  });
});

function state(marker: string) {
  return { sceneId: "scene-1", time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [] };
}
