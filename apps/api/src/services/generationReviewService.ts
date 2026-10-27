import type { PrismaClient } from "@prisma/client";
import type { FrameLockReadiness, FrameLockReadinessDiagnostic, FrameLockReadinessReason } from "@bearridge/shared";
import { AppError } from "../errors.js";
import { getFrameLockReadiness, readLockFacts, resolveFacts } from "./frameLockReadinessService.js";
import { validateVisualBaseFile } from "./visualBaseValidation.js";

export class GenerationReviewError extends AppError {
  constructor(message: string, code: "FRAME_LOCK_BLOCKED" | "FRAME_LOCK_READINESS_STALE" | "FRAME_SELECTION_BLOCKED", readonly reasons: FrameLockReadinessReason[] = [], readonly diagnostics: FrameLockReadinessDiagnostic[] = []) {
    super(message, 409, code);
  }
}

export async function selectGenerationForFrame(prisma: PrismaClient, frameId: string, generationId: string) {
  return prisma.$transaction(async tx => {
    const frame = await tx.frame.findUnique({ where: { id: frameId }, select: { id: true, status: true } });
    if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
    if (frame.status === "LOCKED" || frame.status === "GENERATING") throw new GenerationReviewError("Generation selection is blocked by the Frame lifecycle.", "FRAME_SELECTION_BLOCKED");
    const generation = await tx.generation.findUnique({ where: { id: generationId } });
    if (!generation || generation.frameId !== frameId || generation.status !== "SUCCESS") throw new AppError("Only a successful Generation belonging to this Frame can be selected.", 400, "INVALID_GENERATION_SELECTION");
    const updated = await tx.$executeRawUnsafe(`UPDATE "Frame" SET "selectedGenerationId" = ?, "status" = 'REVIEW', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "status" NOT IN ('LOCKED', 'GENERATING')`, generationId, frameId);
    if (updated !== 1) throw new GenerationReviewError("Frame lifecycle changed before selection was saved.", "FRAME_SELECTION_BLOCKED");
    return tx.frame.findUniqueOrThrow({ where: { id: frameId } });
  });
}

export async function lockFrameWithSelectedGeneration(prisma: PrismaClient, projectPath: string, frameId: string) {
  const initial = await getFrameLockReadiness(prisma, projectPath, frameId);
  assertReady(initial);
  const facts = await readLockFacts(prisma, frameId);
  if (!facts.generation?.outputFilePath) throw stale();
  const output = await validateVisualBaseFile({ projectPath, filePath: facts.generation.outputFilePath, generationId: facts.generation.id });
  return prisma.$transaction(async tx => {
    const current = resolveFacts(await readLockFacts(tx, frameId), output);
    if (current.status !== "READY" || !sameToken(initial, current)) throw stale(current);
    const updated = await tx.$executeRawUnsafe(`UPDATE "Frame" SET "status" = 'LOCKED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "status" NOT IN ('LOCKED', 'GENERATING') AND "selectedGenerationId" = ?`, frameId, initial.selectedGenerationId);
    if (updated !== 1) throw stale();
    return tx.frame.findUniqueOrThrow({ where: { id: frameId } });
  });
}

function assertReady(value: FrameLockReadiness): asserts value is Extract<FrameLockReadiness, { status: "READY" }> {
  if (value.status === "READY") return;
  if (value.reasons.includes("FRAME_NOT_FOUND")) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  throw new GenerationReviewError("Frame cannot be locked until all integrity checks pass.", "FRAME_LOCK_BLOCKED", value.reasons, value.diagnostics);
}
function sameToken(a: Extract<FrameLockReadiness, { status: "READY" }>, b: Extract<FrameLockReadiness, { status: "READY" }>) { return a.frameId === b.frameId && a.selectedGenerationId === b.selectedGenerationId && a.targetRevision === b.targetRevision && a.targetFingerprint === b.targetFingerprint && a.snapshotFingerprint === b.snapshotFingerprint; }
function stale(current?: FrameLockReadiness) { return new GenerationReviewError("Lock readiness changed before the Frame could be locked.", "FRAME_LOCK_READINESS_STALE", ["LOCK_READINESS_STALE"], current?.status === "BLOCKED" ? current.diagnostics : [{ reason: "LOCK_READINESS_STALE", message: "Lock readiness changed." }]); }
