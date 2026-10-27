import {
  storyStateSchema,
  type FrameLockReadiness,
  type FrameLockReadinessDiagnostic,
  type FrameLockReadinessReason,
  type FrameStatus
} from "@bearridge/shared";
import { storyStateFingerprint } from "./frameGenerationReadiness.js";

export type LockTargetInput =
  | { status: "AVAILABLE"; document: unknown; revision: number }
  | { status: "MISSING" }
  | { status: "INVALID"; message?: string };

export type LockOutputInput = { status: "AVAILABLE"; generationId: string } | { status: "UNAVAILABLE"; message?: string };

export interface FrameLockReadinessInput {
  frame?: { id: string; status: FrameStatus; selectedGenerationId: string | null };
  generation?: {
    id: string;
    frameId: string;
    status: string;
    storyStateSnapshot: string | null;
    productionTargetFingerprint?: string | null;
    metadataInvalid?: boolean;
  };
  target?: LockTargetInput;
  output?: LockOutputInput;
}

export function resolveFrameLockReadiness(input: FrameLockReadinessInput): FrameLockReadiness {
  const diagnostics: FrameLockReadinessDiagnostic[] = [];
  const add = (reason: FrameLockReadinessReason, message: string, issues?: string[]) =>
    diagnostics.push({ reason, message, ...(issues?.length ? { issues } : {}) });

  if (!input.frame) {
    add("FRAME_NOT_FOUND", "Frame was not found.");
    return blocked(diagnostics);
  }
  const frame = input.frame;
  if (frame.status === "LOCKED") add("FRAME_ALREADY_LOCKED", "Frame is already locked.");
  if (frame.status === "GENERATING") add("FRAME_GENERATING", "Frame generation is still in progress.");
  if (!frame.selectedGenerationId) add("SELECTION_MISSING", "Select a successful Generation before locking the Frame.");

  const generation = input.generation;
  if (frame.selectedGenerationId && !generation) add("GENERATION_NOT_FOUND", "The selected Generation was not found.");
  if (generation) {
    if (generation.frameId !== frame.id) add("GENERATION_OWNERSHIP_MISMATCH", "The selected Generation belongs to another Frame.");
    if (generation.status !== "SUCCESS") add("GENERATION_NOT_SUCCESS", "The selected Generation is not successful.");
  }

  let snapshotFingerprint: string | undefined;
  if (generation) {
    if (!generation.storyStateSnapshot) {
      add("SNAPSHOT_MISSING", "The selected Generation has no historical Story State snapshot.");
    } else {
      try {
        const parsed = storyStateSchema.safeParse(JSON.parse(generation.storyStateSnapshot));
        if (!parsed.success) add("SNAPSHOT_INVALID", "The selected Generation Story State snapshot is invalid.", parsed.error.issues.map(issue => `${issue.path.join(".") || "document"}: ${issue.message}`));
        else snapshotFingerprint = storyStateFingerprint(parsed.data);
      } catch {
        add("SNAPSHOT_INVALID", "The selected Generation Story State snapshot is invalid.");
      }
    }
    if (generation.metadataInvalid) add("GENERATION_METADATA_INCONSISTENT", "Generation production target metadata is invalid.");
  }

  let targetFingerprint: string | undefined;
  let targetRevision: number | undefined;
  if (!input.target || input.target.status === "MISSING") add("TARGET_NOT_INITIALIZED", "Frame Target Story State has not been initialized.");
  else if (input.target.status === "INVALID") add("TARGET_INVALID", input.target.message ?? "Frame Target Story State is invalid.");
  else {
    targetRevision = input.target.revision;
    const parsed = storyStateSchema.safeParse(input.target.document);
    if (!parsed.success) add("TARGET_INVALID", "Frame Target Story State is invalid.", parsed.error.issues.map(issue => `${issue.path.join(".") || "document"}: ${issue.message}`));
    else targetFingerprint = storyStateFingerprint(parsed.data);
  }

  if (generation) {
    const output = input.output;
    if (!output || output.status === "UNAVAILABLE") add("OUTPUT_FILE_MISSING", output?.message ?? "The selected Generation image file is unavailable.");
    else if (output.generationId !== generation.id) add("OUTPUT_FILE_MISSING", "The validated output does not belong to the selected Generation.");
  }

  if (snapshotFingerprint && targetFingerprint && snapshotFingerprint !== targetFingerprint) add("TARGET_SNAPSHOT_MISMATCH", "The selected Generation was created for a different Frame target state.");
  if (generation?.productionTargetFingerprint && snapshotFingerprint && generation.productionTargetFingerprint !== snapshotFingerprint) {
    add("GENERATION_METADATA_INCONSISTENT", "Generation production target metadata does not match its historical snapshot.");
  }

  if (diagnostics.length) return blocked(diagnostics, frame.id, frame.selectedGenerationId ?? undefined, targetRevision, targetFingerprint);
  if (!generation || !snapshotFingerprint || !targetFingerprint || targetRevision === undefined) throw new Error("Lock readiness invariant violated.");
  return { status: "READY", frameId: frame.id, selectedGenerationId: generation.id, targetRevision, targetFingerprint, snapshotFingerprint };
}

function blocked(diagnostics: FrameLockReadinessDiagnostic[], frameId?: string, selectedGenerationId?: string, targetRevision?: number, targetFingerprint?: string): FrameLockReadiness {
  const tuple = diagnostics as [FrameLockReadinessDiagnostic, ...FrameLockReadinessDiagnostic[]];
  return {
    status: "BLOCKED",
    ...(frameId ? { frameId } : {}),
    ...(selectedGenerationId ? { selectedGenerationId } : {}),
    ...(targetRevision !== undefined ? { targetRevision } : {}),
    ...(targetFingerprint ? { targetFingerprint } : {}),
    reasons: tuple.map(item => item.reason) as [FrameLockReadinessReason, ...FrameLockReadinessReason[]],
    diagnostics: tuple
  };
}
