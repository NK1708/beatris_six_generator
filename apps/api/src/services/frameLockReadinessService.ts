import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveFrameLockReadiness, type LockOutputInput, type LockTargetInput } from "@bearridge/core";
import type { FrameLockReadiness, FrameStatus } from "@bearridge/shared";
import { validateVisualBaseFile } from "./visualBaseValidation.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getFrameLockReadiness(prisma: DbClient, projectPath: string, frameId: string): Promise<FrameLockReadiness> {
  const facts = await readLockFacts(prisma, frameId);
  if (!facts.frame || !facts.generation?.outputFilePath) return resolveFacts(facts, { status: "UNAVAILABLE" });
  return resolveFacts(facts, await validateVisualBaseFile({ projectPath, filePath: facts.generation.outputFilePath, generationId: facts.generation.id }));
}

export async function readLockFacts(prisma: DbClient, frameId: string) {
  const frame = await prisma.frame.findUnique({ where: { id: frameId }, select: { id: true, status: true, selectedGenerationId: true, characterCastRevision: true, targetStoryState: true } });
  if (!frame) return { frame: null, generation: null };
  const generation = frame.selectedGenerationId ? await prisma.generation.findUnique({ where: { id: frame.selectedGenerationId }, select: { id: true, frameId: true, status: true, outputFilePath: true, storyStateSnapshot: true, frameSnapshot: true, rawMetadata: true } }) : null;
  return { frame, generation };
}

export function resolveFacts(facts: Awaited<ReturnType<typeof readLockFacts>>, output: LockOutputInput): FrameLockReadiness {
  if (!facts.frame) return resolveFrameLockReadiness({});
  const target: LockTargetInput = facts.frame.targetStoryState ? parseTarget(facts.frame.targetStoryState.document, facts.frame.targetStoryState.revision) : { status: "MISSING" };
  const metadata = parseProductionTargetMetadata(facts.generation?.rawMetadata ?? null);
  const castSnapshotMismatch = facts.generation ? hasCastSnapshotMismatch(facts.generation.frameSnapshot, facts.frame.characterCastRevision) : false;
  return resolveFrameLockReadiness({
    frame: { id: facts.frame.id, status: facts.frame.status as FrameStatus, selectedGenerationId: facts.frame.selectedGenerationId },
    ...(facts.generation ? { generation: {
      id: facts.generation.id, frameId: facts.generation.frameId, status: facts.generation.status, storyStateSnapshot: facts.generation.storyStateSnapshot,
      ...(metadata.fingerprint ? { productionTargetFingerprint: metadata.fingerprint } : {}),
      ...((metadata.invalid || castSnapshotMismatch) ? { metadataInvalid: true } : {})
    } } : {}),
    target,
    output
  });
}

function hasCastSnapshotMismatch(snapshot: string, revision: number): boolean {
  try {
    const parsed = JSON.parse(snapshot) as { characterCastRevision?: unknown };
    return parsed.characterCastRevision !== undefined && parsed.characterCastRevision !== revision;
  } catch {
    return true;
  }
}

function parseTarget(document: string, revision: number): LockTargetInput {
  try { return { status: "AVAILABLE", document: JSON.parse(document) as unknown, revision }; }
  catch { return { status: "INVALID", message: "Frame Target Story State is invalid." }; }
}

function parseProductionTargetMetadata(rawMetadata: string | null): { fingerprint?: string; invalid?: boolean } {
  if (!rawMetadata) return {};
  try {
    const raw = JSON.parse(rawMetadata) as unknown;
    if (!raw || typeof raw !== "object" || !("productionTarget" in raw)) return {};
    const target = (raw as { productionTarget?: unknown }).productionTarget;
    if (!target || typeof target !== "object") return { invalid: true };
    const fingerprint = (target as { fingerprint?: unknown }).fingerprint;
    return typeof fingerprint === "string" ? { fingerprint } : { invalid: true };
  } catch { return {}; }
}
