import {
  storyStateSchema,
  type ContinuityBaseline,
  type ContinuityBaselineUnavailableReason,
  type FrameStoryStateDiagnostic,
  type FrameStoryStateInitialization,
  type FrameStoryStateProvenance,
  type ResolvedFrameTargetStoryState,
  type StoryStateDocument,
  type VisualBaseDescriptor
} from "@bearridge/shared";
import { createEmptyStoryState } from "./storyState.js";

export interface StoryStateGenerationCandidate {
  id: string;
  status: string;
  storyStateSnapshot?: unknown;
}

export interface FrameTargetCandidate {
  document: unknown;
  provenance: FrameStoryStateProvenance;
}

export interface FrameTargetInitializationInput {
  sceneId: string;
  sceneStoryState?: unknown;
  predecessor?: {
    id: string;
    status: string;
    selectedGenerationId?: string | null;
    generations: StoryStateGenerationCandidate[];
    target?: FrameTargetCandidate;
  };
}

export interface ContinuityBaselineInput {
  predecessor?: {
    id: string;
    status: string;
    selectedGenerationId?: string | null;
    generations: StoryStateGenerationCandidate[];
  };
  visualBase?: VisualBaseDescriptor;
}

export function resolveInitialFrameTargetStoryState(input: FrameTargetInitializationInput): FrameStoryStateInitialization {
  if (!input.predecessor) {
    if (input.sceneStoryState === undefined || input.sceneStoryState === null) {
      return resolved(createEmptyStoryState(input.sceneId), { origin: "EMPTY_DEFAULT" }, [missing(
        "MISSING_SCENE_STORY_STATE",
        "Scene Story State is missing; a valid empty target state was created."
      )]);
    }
    const parsed = parseCandidate(input.sceneStoryState, "INVALID_SCENE_STORY_STATE", "Scene Story State is invalid.");
    return parsed.ok
      ? resolved(parsed.document, { origin: "SCENE_INITIAL" })
      : blocked(parsed.diagnostic);
  }

  const predecessor = input.predecessor;
  if (predecessor.status === "LOCKED") {
    const selected = selectedGeneration(predecessor);
    if (!selected.ok) return blocked(selected.diagnostic);
    const parsed = parseSnapshot(selected.generation.storyStateSnapshot);
    if (!parsed.ok) return blocked(parsed.diagnostic);
    return resolved(parsed.document, {
      origin: "INHERITED_LOCKED_GENERATION",
      sourceFrameId: predecessor.id,
      sourceGenerationId: selected.generation.id
    });
  }

  if (!predecessor.target) {
    return blocked(missing(
      "MISSING_PREDECESSOR_TARGET",
      "The unconfirmed predecessor has no Frame Target Story State.",
      "blocking"
    ));
  }
  const parsed = parseCandidate(predecessor.target.document, "INVALID_PREDECESSOR_TARGET", "The predecessor Frame Target Story State is invalid.");
  if (!parsed.ok) return blocked(parsed.diagnostic);
  return resolved(parsed.document, {
    origin: "INHERITED_UNCONFIRMED_FRAME_TARGET",
    sourceFrameId: predecessor.id
  }, [{
    kind: "UNCONFIRMED",
    severity: "warning",
    code: "UNCONFIRMED_PREDECESSOR_TARGET",
    message: "The initial target is inherited from a predecessor that is not LOCKED and is not a continuity baseline.",
    sourceFrameId: predecessor.id
  }]);
}

export function resolveContinuityBaseline(input: ContinuityBaselineInput): ContinuityBaseline {
  const predecessor = input.predecessor;
  if (!predecessor || predecessor.status !== "LOCKED") {
    return unavailable("NOT_LOCKED", "The previous Frame is not LOCKED.");
  }
  const selected = selectedGeneration(predecessor);
  if (!selected.ok) return unavailableFromDiagnostic(selected.diagnostic);
  const parsed = parseSnapshot(selected.generation.storyStateSnapshot);
  if (!parsed.ok) return unavailableFromDiagnostic(parsed.diagnostic);
  if (!input.visualBase) {
    return unavailable("MISSING_VISUAL_BASE", "The selected Generation has no usable visual base.");
  }
  if (input.visualBase.generationId !== selected.generation.id) {
    return unavailable("VISUAL_BASE_GENERATION_MISMATCH", "Story baseline and visual base must come from the same selected Generation.");
  }
  return {
    status: "AVAILABLE",
    frameId: predecessor.id,
    generationId: selected.generation.id,
    storyState: clone(parsed.document),
    visualBase: { ...input.visualBase }
  };
}

function selectedGeneration(predecessor: NonNullable<FrameTargetInitializationInput["predecessor"]>):
  | { ok: true; generation: StoryStateGenerationCandidate }
  | { ok: false; diagnostic: FrameStoryStateDiagnostic } {
  if (!predecessor.selectedGenerationId) {
    return { ok: false, diagnostic: missing("NO_SELECTION", "The previous Frame has no selected Generation.", "blocking") };
  }
  const generation = predecessor.generations.find((candidate) => candidate.id === predecessor.selectedGenerationId);
  if (!generation) {
    return { ok: false, diagnostic: missing("GENERATION_NOT_FOUND", "The selected Generation was not found.", "blocking") };
  }
  if (generation.status !== "SUCCESS") {
    return { ok: false, diagnostic: missing("GENERATION_NOT_SUCCESS", "The selected Generation is not successful.", "blocking") };
  }
  return { ok: true, generation };
}

function parseSnapshot(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: false as const, diagnostic: missing("MISSING_SNAPSHOT", "The selected Generation has no Story State snapshot.", "blocking") };
  }
  return parseCandidate(value, "INVALID_SNAPSHOT", "The selected Generation Story State snapshot is invalid.");
}

function parseCandidate(value: unknown, code: "INVALID_SCENE_STORY_STATE" | "INVALID_PREDECESSOR_TARGET" | "INVALID_SNAPSHOT", message: string):
  | { ok: true; document: StoryStateDocument }
  | { ok: false; diagnostic: FrameStoryStateDiagnostic } {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch (error) {
      return { ok: false, diagnostic: invalid(code, message, [error instanceof Error ? error.message : "Invalid JSON."]) };
    }
  }
  const parsed = storyStateSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, diagnostic: invalid(code, message, parsed.error.issues.map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)) };
  }
  return { ok: true, document: clone(parsed.data) };
}

function resolved(document: StoryStateDocument, provenance: FrameStoryStateProvenance, diagnostics: FrameStoryStateDiagnostic[] = []): FrameStoryStateInitialization {
  const target: ResolvedFrameTargetStoryState = { status: "RESOLVED", document: clone(document), provenance: { ...provenance } };
  return { status: "RESOLVED", target, diagnostics };
}

function blocked(diagnostic: FrameStoryStateDiagnostic): FrameStoryStateInitialization {
  return { status: "BLOCKED", diagnostics: [diagnostic] };
}

function unavailable(reason: ContinuityBaselineUnavailableReason, message: string): ContinuityBaseline {
  return { status: "UNAVAILABLE", reason, diagnostic: missing(reason, message, "blocking") };
}

function unavailableFromDiagnostic(diagnostic: FrameStoryStateDiagnostic): ContinuityBaseline {
  const reason = diagnostic.code;
  if (!["NO_SELECTION", "GENERATION_NOT_FOUND", "GENERATION_NOT_SUCCESS", "MISSING_SNAPSHOT", "INVALID_SNAPSHOT"].includes(reason)) {
    throw new Error(`Unsupported continuity diagnostic: ${reason}`);
  }
  return { status: "UNAVAILABLE", reason: reason as "NO_SELECTION" | "GENERATION_NOT_FOUND" | "GENERATION_NOT_SUCCESS" | "MISSING_SNAPSHOT" | "INVALID_SNAPSHOT", diagnostic };
}

function missing(code: FrameStoryStateDiagnostic["code"], message: string, severity: "warning" | "blocking" = "warning"): FrameStoryStateDiagnostic {
  return { kind: "MISSING", severity, code, message };
}

function invalid(code: "INVALID_SCENE_STORY_STATE" | "INVALID_PREDECESSOR_TARGET" | "INVALID_SNAPSHOT", message: string, issues: string[]): FrameStoryStateDiagnostic {
  return { kind: "INVALID", severity: "blocking", code, message, issues };
}

function clone(document: StoryStateDocument): StoryStateDocument {
  return JSON.parse(JSON.stringify(document)) as StoryStateDocument;
}
