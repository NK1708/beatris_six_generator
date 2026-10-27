import type { Prisma } from "@prisma/client";
import type {
  FrameGenerationReadiness,
  FrameGenerationReadinessDiagnostic,
  FrameGenerationReadinessReason
} from "@bearridge/shared";
import { storyStateFingerprint } from "@bearridge/core";
import { storyStateSchema } from "@bearridge/shared";
import { AppError } from "../errors.js";

type Ready = Extract<FrameGenerationReadiness, { status: "READY" }>;

export class ProductionGenerationReadinessError extends AppError {
  constructor(
    code: "PRODUCTION_GENERATION_BLOCKED" | "GENERATION_READINESS_STALE",
    readonly reasons: [FrameGenerationReadinessReason, ...FrameGenerationReadinessReason[]],
    readonly diagnostics: [FrameGenerationReadinessDiagnostic, ...FrameGenerationReadinessDiagnostic[]]
  ) {
    super(code === "GENERATION_READINESS_STALE"
      ? "Production generation readiness changed before launch."
      : "Production generation is blocked by Frame readiness requirements.", 409, code);
    this.name = "ProductionGenerationReadinessError";
  }
}

export class ProductionGenerationGate {
  constructor(private readonly resolveReadiness: () => Promise<FrameGenerationReadiness>) {}

  async open(): Promise<Ready> {
    const readiness = await this.resolveReadiness();
    if (readiness.status === "BLOCKED") {
      throw new ProductionGenerationReadinessError(
        "PRODUCTION_GENERATION_BLOCKED",
        readiness.reasons,
        readiness.diagnostics
      );
    }
    return readiness;
  }

  async revalidate(expected: Ready): Promise<Ready> {
    const current = await this.resolveReadiness();
    if (current.status === "BLOCKED") {
      throw staleError(current.reasons, current.diagnostics);
    }
    const changed = readinessIdentityChanges(expected, current);
    if (changed.length > 0) {
      throw staleError(["GENERATION_READINESS_STALE"], [{
        reason: "GENERATION_READINESS_STALE",
        message: `Readiness identity changed: ${changed.join(", ")}.`,
        frameId: expected.frameId,
        ...(expected.selectedPredecessorGenerationId
          ? { predecessorGenerationId: expected.selectedPredecessorGenerationId }
          : {})
      }]);
    }
    return current;
  }
}

export async function assertReadinessTokenCurrent(
  prisma: Prisma.TransactionClient,
  readiness: Ready
): Promise<void> {
  const frame = await prisma.frame.findUnique({
    where: { id: readiness.frameId },
    select: {
      id: true,
      status: true,
      generationStrategy: true,
      previousFrameId: true,
      characterCastRevision: true,
      targetStoryState: { select: { revision: true, document: true } }
    }
  });
  const changed: string[] = [];
  if (!frame) changed.push("frame");
  if (frame && !["DRAFT", "REVIEW", "REJECTED"].includes(frame.status)) changed.push("frame status");
  if (frame && frame.generationStrategy !== readiness.mode) changed.push("generation mode");
  if (frame?.targetStoryState?.revision !== readiness.targetRevision) changed.push("target revision");
  if (readiness.characterCastRevision !== undefined && frame?.characterCastRevision !== readiness.characterCastRevision) changed.push("character cast revision");
  if (frame?.targetStoryState) {
    try {
      const document = storyStateSchema.parse(JSON.parse(frame.targetStoryState.document) as unknown);
      if (storyStateFingerprint(document) !== readiness.targetFingerprint) changed.push("target document");
    } catch {
      changed.push("target document");
    }
  }

  if (frame && readiness.mode === "CONTINUE_PREVIOUS_FRAME") {
    const predecessor = frame.previousFrameId
      ? await prisma.frame.findUnique({
          where: { id: frame.previousFrameId },
          select: { status: true, selectedGenerationId: true }
        })
      : null;
    if (!predecessor || predecessor.status !== "LOCKED") changed.push("predecessor status");
    if (predecessor?.selectedGenerationId !== readiness.selectedPredecessorGenerationId) changed.push("selected predecessor Generation");
    const selected = readiness.selectedPredecessorGenerationId
      ? await prisma.generation.findUnique({
          where: { id: readiness.selectedPredecessorGenerationId },
          select: { frameId: true, status: true, outputFilePath: true }
        })
      : null;
    if (!selected || selected.status !== "SUCCESS") changed.push("selected Generation status");
    if (selected && selected.frameId !== frame.previousFrameId) changed.push("selected Generation ownership");
    if (!selected?.outputFilePath) changed.push("visual base metadata");
  }

  if (changed.length > 0) {
    throw staleError(["GENERATION_READINESS_STALE"], [{
      reason: "GENERATION_READINESS_STALE",
      message: `Readiness changed before Generation creation: ${[...new Set(changed)].join(", ")}.`,
      frameId: readiness.frameId,
      ...(readiness.selectedPredecessorGenerationId
        ? { predecessorGenerationId: readiness.selectedPredecessorGenerationId }
        : {})
    }]);
  }
}

export function readinessIdentityChanges(expected: Ready, current: Ready): string[] {
  const changed: string[] = [];
  if (current.frameId !== expected.frameId) changed.push("frame ID");
  if (current.mode !== expected.mode) changed.push("generation mode");
  if (current.targetRevision !== expected.targetRevision) changed.push("target revision");
  if (current.targetFingerprint !== expected.targetFingerprint) changed.push("target document");
  if (expected.characterCastRevision !== undefined && current.characterCastRevision !== expected.characterCastRevision) changed.push("character cast revision");
  if (current.selectedPredecessorGenerationId !== expected.selectedPredecessorGenerationId) {
    changed.push("selected predecessor Generation ID");
  }
  return changed;
}

function staleError(
  reasons: [FrameGenerationReadinessReason, ...FrameGenerationReadinessReason[]],
  diagnostics: [FrameGenerationReadinessDiagnostic, ...FrameGenerationReadinessDiagnostic[]]
): ProductionGenerationReadinessError {
  const allReasons: [FrameGenerationReadinessReason, ...FrameGenerationReadinessReason[]] =
    reasons[0] === "GENERATION_READINESS_STALE" ? reasons : ["GENERATION_READINESS_STALE", ...reasons];
  const staleDiagnostic: FrameGenerationReadinessDiagnostic = {
    reason: "GENERATION_READINESS_STALE",
    message: "Readiness became blocked before launch."
  };
  const allDiagnostics: [FrameGenerationReadinessDiagnostic, ...FrameGenerationReadinessDiagnostic[]] =
    diagnostics[0].reason === "GENERATION_READINESS_STALE" ? diagnostics : [staleDiagnostic, ...diagnostics];
  return new ProductionGenerationReadinessError("GENERATION_READINESS_STALE", allReasons, allDiagnostics);
}
