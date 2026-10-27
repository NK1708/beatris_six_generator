import {
  storyStateSchema,
  type ContinuityBaseline,
  type ContinuityBaselineUnavailableReason,
  type FrameGenerationReadiness,
  type FrameGenerationReadinessDiagnostic,
  type FrameGenerationReadinessReason,
  type FrameGenerationStrategy,
  type FrameStatus,
  type FrameStoryStateProvenance,
  type StoryStateDocument
} from "@bearridge/shared";

export type FrameTargetReadinessInput =
  | {
      status: "AVAILABLE";
      document: unknown;
      revision: number;
      provenance: FrameStoryStateProvenance;
    }
  | { status: "MISSING" }
  | { status: "INVALID"; message?: string };

export type PhysicalVisualBaseReadiness =
  | { status: "AVAILABLE"; generationId: string }
  | { status: "UNAVAILABLE"; message?: string };

export interface FrameGenerationReadinessInput {
  mode: FrameGenerationStrategy;
  frame?: { id: string; status: FrameStatus; previousFrameId?: string | null; characterCastRevision?: number };
  target?: FrameTargetReadinessInput;
  predecessorExists?: boolean;
  continuityBaseline?: ContinuityBaseline;
  physicalVisualBase?: PhysicalVisualBaseReadiness;
}

const generatableStatuses = new Set<FrameStatus>(["DRAFT", "REVIEW", "REJECTED"]);

export function resolveFrameGenerationReadiness(input: FrameGenerationReadinessInput): FrameGenerationReadiness {
  const diagnostics: FrameGenerationReadinessDiagnostic[] = [];
  const add = (reason: FrameGenerationReadinessReason, message: string, extra: Partial<FrameGenerationReadinessDiagnostic> = {}) => {
    diagnostics.push({ reason, message, ...extra });
  };

  if (!input.frame) {
    add("FRAME_NOT_FOUND", "Frame was not found.");
    return blocked(input.mode, undefined, diagnostics);
  }
  const frame = input.frame;
  if (!generatableStatuses.has(frame.status)) {
    add("FRAME_STATUS_NOT_GENERATABLE", `Frame status ${frame.status} does not allow generation.`, { frameId: frame.id });
  }

  const target = input.target;
  let validatedTarget: { document: StoryStateDocument; revision: number; provenance: FrameStoryStateProvenance } | undefined;
  if (!target || target.status === "MISSING") {
    add("TARGET_NOT_INITIALIZED", "Frame Target Story State has not been initialized.", { frameId: frame.id });
  } else if (target.status === "INVALID") {
    add("TARGET_INVALID", target.message ?? "Frame Target Story State is invalid.", { frameId: frame.id });
  } else {
    const parsed = storyStateSchema.safeParse(target.document);
    if (!parsed.success) {
      add("TARGET_INVALID", "Frame Target Story State failed validation.", {
        frameId: frame.id,
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
      });
    } else {
      validatedTarget = { document: parsed.data, revision: target.revision, provenance: target.provenance };
    }
  }

  if (input.mode === "CONTINUE_PREVIOUS_FRAME") {
    addContinuationDiagnostics(input, diagnostics);
  }

  if (diagnostics.length > 0) return blocked(input.mode, frame.id, diagnostics);
  if (!validatedTarget) throw new Error("Readiness invariant violated: validated target is missing.");

  const ready = {
    status: "READY" as const,
    mode: input.mode,
    frameId: frame.id,
    target: {
      document: validatedTarget.document,
      revision: validatedTarget.revision,
      provenance: validatedTarget.provenance
    },
    targetRevision: validatedTarget.revision,
    targetFingerprint: storyStateFingerprint(validatedTarget.document),
    characterCastRevision: frame.characterCastRevision ?? 0
  };
  if (input.mode === "NEW_COMPOSITION") return ready;

  const baseline = input.continuityBaseline;
  if (!baseline || baseline.status !== "AVAILABLE") {
    throw new Error("Readiness invariant violated: continuation baseline is missing.");
  }
  return {
    ...ready,
    continuityBaseline: baseline,
    selectedPredecessorGenerationId: baseline.generationId
  };
}

export function storyStateFingerprint(document: StoryStateDocument): string {
  return stableSerialize(document);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(",")}}`;
}

function addContinuationDiagnostics(
  input: FrameGenerationReadinessInput,
  diagnostics: FrameGenerationReadinessDiagnostic[]
): void {
  const frame = input.frame;
  if (!frame) return;
  const predecessorFrameId = frame.previousFrameId ?? undefined;
  const baseline = input.continuityBaseline;
  const extra = { frameId: frame.id, ...(predecessorFrameId ? { predecessorFrameId } : {}) };
  if (!predecessorFrameId || input.predecessorExists === false) {
    diagnostics.push({ reason: "PREDECESSOR_NOT_FOUND", message: "The predecessor Frame was not found.", ...extra });
    return;
  }
  if (!baseline || baseline.status === "UNAVAILABLE") {
    const reason = baseline?.reason;
    const mapped = mapBaselineReason(reason);
    diagnostics.push({
      reason: mapped,
      message: baseline?.diagnostic.message ?? "A valid continuity baseline is unavailable.",
      ...extra
    });
    return;
  }
  const generationExtra = { ...extra, predecessorGenerationId: baseline.generationId };
  const physical = input.physicalVisualBase;
  if (!physical || physical.status === "UNAVAILABLE") {
    diagnostics.push({
      reason: "VISUAL_BASE_FILE_UNAVAILABLE",
      message: physical?.message ?? "The selected visual base image file is unavailable.",
      ...generationExtra
    });
  } else if (physical.generationId !== baseline.generationId) {
    diagnostics.push({
      reason: "VISUAL_BASE_GENERATION_MISMATCH",
      message: "The physically validated visual base does not belong to the selected baseline Generation.",
      ...generationExtra
    });
  }
}

function mapBaselineReason(reason: ContinuityBaselineUnavailableReason | undefined): FrameGenerationReadinessReason {
  switch (reason) {
    case "NOT_LOCKED": return "PREDECESSOR_NOT_LOCKED";
    case "NO_SELECTION": return "PREDECESSOR_SELECTION_MISSING";
    case "GENERATION_NOT_FOUND": return "PREDECESSOR_GENERATION_NOT_FOUND";
    case "GENERATION_NOT_SUCCESS": return "PREDECESSOR_GENERATION_NOT_SUCCESS";
    case "MISSING_SNAPSHOT":
    case "INVALID_SNAPSHOT": return "PREDECESSOR_SNAPSHOT_INVALID";
    case "MISSING_VISUAL_BASE": return "VISUAL_BASE_MISSING";
    case "VISUAL_BASE_GENERATION_MISMATCH": return "VISUAL_BASE_GENERATION_MISMATCH";
    default: return "PREDECESSOR_NOT_LOCKED";
  }
}

function blocked(
  mode: FrameGenerationStrategy,
  frameId: string | undefined,
  diagnostics: FrameGenerationReadinessDiagnostic[]
): FrameGenerationReadiness {
  if (diagnostics.length === 0) throw new Error("A blocked readiness result requires diagnostics.");
  const tuple = diagnostics as [FrameGenerationReadinessDiagnostic, ...FrameGenerationReadinessDiagnostic[]];
  const reasons = tuple.map((diagnostic) => diagnostic.reason) as [FrameGenerationReadinessReason, ...FrameGenerationReadinessReason[]];
  return { status: "BLOCKED", mode, ...(frameId ? { frameId } : {}), reasons, diagnostics: tuple };
}
