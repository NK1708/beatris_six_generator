import type { FrameContext } from "@bearridge/core";
import type { FrameGenerationReadiness, StoryStateDocument } from "@bearridge/shared";

type Ready = Extract<FrameGenerationReadiness, { status: "READY" }>;

export interface PreparedProductionGenerationContext {
  context: FrameContext;
  targetStoryState: StoryStateDocument;
  targetRevision: number;
  targetProvenance: Ready["target"]["provenance"];
  targetFingerprint: string;
  selectedPredecessorGenerationId?: string;
}

export function prepareProductionGenerationContext(
  frameContext: FrameContext,
  readiness: Ready
): PreparedProductionGenerationContext {
  if (frameContext.frame.id !== readiness.frameId) {
    throw new Error("Production context Frame does not match readiness Frame.");
  }
  const targetStoryState = clone(readiness.target.document);
  const previousStoryState = readiness.mode === "CONTINUE_PREVIOUS_FRAME"
    ? clone(readiness.continuityBaseline!.storyState)
    : undefined;
  const context: FrameContext = {
    ...frameContext,
    storyState: targetStoryState,
    ...(previousStoryState
      ? { previousStoryState, previousLockedStoryState: previousStoryState }
      : { previousStoryState: undefined, previousLockedStoryState: undefined })
  };
  return {
    context,
    targetStoryState,
    targetRevision: readiness.targetRevision,
    targetProvenance: { ...readiness.target.provenance },
    targetFingerprint: readiness.targetFingerprint,
    ...(readiness.selectedPredecessorGenerationId
      ? { selectedPredecessorGenerationId: readiness.selectedPredecessorGenerationId }
      : {})
  };
}

function clone(document: StoryStateDocument): StoryStateDocument {
  return JSON.parse(JSON.stringify(document)) as StoryStateDocument;
}
