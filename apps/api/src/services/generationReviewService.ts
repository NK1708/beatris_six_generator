import type { PrismaClient } from "@prisma/client";
import { confirmFrameLockSchema, type ConfirmFrameLockInput, type FrameLockReadiness, type FrameLockReadinessDiagnostic, type FrameLockReadinessReason } from "@bearridge/shared";
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
  return lockFrame(prisma, projectPath, frameId);
}

export async function lockFrameWithConfirmation(prisma: PrismaClient, projectPath: string, frameId: string, expected: ConfirmFrameLockInput) {
  return lockFrame(prisma, projectPath, frameId, confirmFrameLockSchema.parse(expected));
}

async function lockFrame(prisma: PrismaClient, projectPath: string, frameId: string, expected?: ConfirmFrameLockInput) {
  const initial = await getFrameLockReadiness(prisma, projectPath, frameId);
  if (expected) assertExpected(initial, expected);
  assertReady(initial);
  const facts = await readLockFacts(prisma, frameId);
  if (!facts.generation?.outputFilePath) throw stale();
  const output = await validateVisualBaseFile({ projectPath, filePath: facts.generation.outputFilePath, generationId: facts.generation.id });
  try { return await prisma.$transaction(async tx => {
    const facts = await readLockFacts(tx, frameId);
    const current = resolveFacts(facts, output);
    if (expected) assertExpected(current, expected);
    if (current.status !== "READY" || !sameToken(initial, current)) throw stale(current);
    // The strict write fences both tables in the UPDATE itself. A competing
    // SQLite writer can win first, wait behind this commit, or cause a safe
    // transaction abort under contention; none may Lock a different ticket.
    let updated: number;
    if (expected) {
      if (!facts.frame?.targetStoryState) throw stale();
      updated = await tx.$executeRawUnsafe(`UPDATE "Frame" SET "status" = 'LOCKED', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ? AND "status" = ? AND "status" NOT IN ('LOCKED', 'GENERATING')
            AND "selectedGenerationId" = ? AND "characterCastRevision" = ?
            AND EXISTS (SELECT 1 FROM "FrameStoryState" t WHERE t."frameId" = "Frame"."id" AND t."revision" = ? AND t."document" = ?)
            AND EXISTS (SELECT 1 FROM "Generation" g WHERE g."id" = ? AND g."frameId" = "Frame"."id" AND g."status" = 'SUCCESS')`,
          frameId, facts.frame.status, expected.expectedGenerationId, facts.frame.characterCastRevision,
          expected.expectedTargetRevision, facts.frame.targetStoryState.document, expected.expectedGenerationId);
    } else {
      updated = await tx.$executeRawUnsafe(`UPDATE "Frame" SET "status" = 'LOCKED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "status" NOT IN ('LOCKED', 'GENERATING') AND "selectedGenerationId" = ?`, frameId, initial.selectedGenerationId);
    }
    if (updated !== 1) throw stale();
    return tx.frame.findUniqueOrThrow({ where: { id: frameId } });
  }); } catch (error) {
    // A SQLite snapshot/write collision must never retry Lock with a new ticket.
    if (expected && isWriteConflict(error)) throw stale();
    throw error;
  }
}

function assertExpected(value: FrameLockReadiness, expected: ConfirmFrameLockInput) {
  if (value.status === "BLOCKED" && value.reasons.includes("FRAME_NOT_FOUND")) assertReady(value);
  if (value.selectedGenerationId !== expected.expectedGenerationId || value.targetRevision !== expected.expectedTargetRevision) throw stale(value);
}

function isWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  if (error.code === "P2034") return true;
  return error.code === "P2010" && "meta" in error && typeof error.meta === "object" && error.meta !== null && "code" in error.meta && ["5", "517", "SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT"].includes(String(error.meta.code));
}

function assertReady(value: FrameLockReadiness): asserts value is Extract<FrameLockReadiness, { status: "READY" }> {
  if (value.status === "READY") return;
  if (value.reasons.includes("FRAME_NOT_FOUND")) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  throw new GenerationReviewError("Frame cannot be locked until all integrity checks pass.", "FRAME_LOCK_BLOCKED", value.reasons, value.diagnostics);
}
function sameToken(a: Extract<FrameLockReadiness, { status: "READY" }>, b: Extract<FrameLockReadiness, { status: "READY" }>) { return a.frameId === b.frameId && a.selectedGenerationId === b.selectedGenerationId && a.targetRevision === b.targetRevision && a.targetFingerprint === b.targetFingerprint && a.snapshotFingerprint === b.snapshotFingerprint; }
function stale(current?: FrameLockReadiness) { return new GenerationReviewError("Lock readiness changed before the Frame could be locked.", "FRAME_LOCK_READINESS_STALE", ["LOCK_READINESS_STALE"], current?.status === "BLOCKED" ? current.diagnostics : [{ reason: "LOCK_READINESS_STALE", message: "Lock readiness changed." }]); }
