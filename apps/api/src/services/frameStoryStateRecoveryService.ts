import { randomUUID } from "node:crypto";
import type { Generation, Prisma, PrismaClient } from "@prisma/client";
import { storyStateFingerprint } from "@bearridge/core";
import {
  frameStoryStateOrigins,
  storyStateSchema,
  type FrameStatus,
  type FrameTargetRecoveryBlockReason,
  type FrameTargetRecoveryCandidate,
  type FrameTargetRecoveryCandidatesResponse,
  type FrameTargetRecoveryErrorCode,
  type StoryStateDocument
} from "@bearridge/shared";
import { AppError } from "../errors.js";
import { inspectProjectImage } from "./visualBaseValidation.js";

type DbClient = PrismaClient | Prisma.TransactionClient;
type CanonicalIndex = { characterIds: Set<string>; outfits: Map<string, string> };

export class FrameStoryStateRecoveryError extends AppError {
  constructor(
    override readonly code: FrameTargetRecoveryErrorCode,
    message: string,
    statusCode: number,
    readonly diagnostics: string[] = []
  ) {
    super(message, statusCode, code);
    this.name = "FrameStoryStateRecoveryError";
  }
}

export async function getFrameTargetRecoveryCandidates(
  prisma: PrismaClient,
  projectPath: string,
  frameId: string
): Promise<FrameTargetRecoveryCandidatesResponse> {
  const frame = await prisma.frame.findUnique({
    where: { id: frameId },
    include: { targetStoryState: true, scene: { select: { projectId: true } }, generations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }
  });
  if (!frame) throw recoveryError("FRAME_NOT_FOUND", "Frame not found.", 404);
  const canonical = await loadCanonicalIndex(prisma, frame.scene.projectId);
  const targetStatus = targetStatusOf(frame.targetStoryState);
  const candidates = await Promise.all(frame.generations.map(async generation => {
    const validation = validateSnapshot(generation.storyStateSnapshot, frame.sceneId, canonical);
    const blockingReasons = candidateBlockingReasons({
      frameStatus: frame.status as FrameStatus,
      hasTarget: Boolean(frame.targetStoryState),
      selectedGenerationId: frame.selectedGenerationId,
      generation,
      validation
    });
    const isSelected = generation.id === frame.selectedGenerationId;
    return {
      generationId: generation.id,
      frameId: generation.frameId,
      provider: generation.provider,
      model: generation.model,
      generationType: generation.generationType,
      createdAt: generation.createdAt.toISOString(),
      generationStatus: generation.status,
      isSelected,
      isRecommended: isSelected && blockingReasons.length === 0,
      isEligible: blockingReasons.length === 0,
      snapshotAvailable: validation.available,
      snapshotValid: validation.valid,
      snapshotFingerprint: validation.fingerprint,
      imageAvailability: await inspectProjectImage(projectPath, generation.outputFilePath),
      blockingReasons,
      previewDocument: validation.document,
      diagnostics: validation.diagnostics
    } satisfies FrameTargetRecoveryCandidate;
  }));
  return { frameId: frame.id, frameStatus: frame.status as FrameStatus, targetStatus, candidates };
}

export async function recoverFrameTargetStoryState(prisma: PrismaClient, frameId: string, sourceGenerationId: string) {
  if (!sourceGenerationId.trim()) throw recoveryError("RECOVERY_SOURCE_REQUIRED", "A source Generation is required.", 400);
  return prisma.$transaction(async transaction => {
    const frame = await transaction.frame.findUnique({
      where: { id: frameId },
      include: { targetStoryState: true, scene: { select: { projectId: true } } }
    });
    if (!frame) throw recoveryError("FRAME_NOT_FOUND", "Frame not found.", 404);
    if (frame.targetStoryState) throw recoveryError("TARGET_ALREADY_INITIALIZED", "Frame target Story State already exists.", 409);
    if (frame.status === "GENERATING") throw recoveryError("FRAME_GENERATING", "Frame target recovery is blocked while generation is active.", 409);
    const generation = await transaction.generation.findUnique({ where: { id: sourceGenerationId } });
    if (!generation) throw recoveryError("GENERATION_NOT_FOUND", "Source Generation not found.", 404);
    if (generation.frameId !== frame.id) throw recoveryError("GENERATION_OWNERSHIP_MISMATCH", "Source Generation belongs to another Frame.", 409);
    if (generation.status !== "SUCCESS") throw recoveryError("GENERATION_NOT_SUCCESS", "Only a successful Generation can be used for recovery.", 409);
    if (frame.status === "LOCKED" && generation.id !== frame.selectedGenerationId) {
      throw recoveryError("LOCKED_SOURCE_NOT_SELECTED", "A LOCKED Frame can only be recovered from its selected Generation.", 409);
    }
    const canonical = await loadCanonicalIndex(transaction, frame.scene.projectId);
    const validation = validateSnapshot(generation.storyStateSnapshot, frame.sceneId, canonical);
    assertValidSnapshot(validation);
    const inserted = await transaction.$executeRawUnsafe(
      `INSERT INTO "FrameStoryState" (
        "id", "frameId", "document", "originType", "sourceFrameId", "sourceGenerationId",
        "revision", "explicitlyEditedAt", "createdAt", "updatedAt"
      )
      SELECT ?, "id", ?, 'LEGACY_GENERATION_INPUT', "id", ?, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "Frame"
      WHERE "id" = ? AND "status" <> 'GENERATING'
        AND NOT EXISTS (SELECT 1 FROM "FrameStoryState" WHERE "frameId" = ?)`,
      randomUUID(), JSON.stringify(validation.document), generation.id, frame.id, frame.id
    );
    if (inserted !== 1) throw recoveryError("RECOVERY_CONFLICT", "Frame target recovery conflicted with another operation.", 409);
    const created = await transaction.frameStoryState.findUnique({ where: { frameId: frame.id } });
    if (!created) throw recoveryError("RECOVERY_CONFLICT", "Recovered Frame target could not be read.", 409);
    return {
      status: "AVAILABLE" as const,
      id: created.id,
      frameId: created.frameId,
      document: validation.document!,
      revision: created.revision,
      provenance: { origin: "LEGACY_GENERATION_INPUT" as const, sourceFrameId: frame.id, sourceGenerationId: generation.id },
      explicitlyEditedAt: created.explicitlyEditedAt,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };
  });
}

async function loadCanonicalIndex(prisma: DbClient, projectId: string): Promise<CanonicalIndex> {
  const [characters, outfits] = await Promise.all([
    prisma.character.findMany({ where: { projectId }, select: { id: true } }),
    prisma.outfit.findMany({ where: { character: { projectId } }, select: { id: true, characterId: true } })
  ]);
  return { characterIds: new Set(characters.map(item => item.id)), outfits: new Map(outfits.map(item => [item.id, item.characterId])) };
}

type SnapshotValidation = {
  available: boolean;
  valid: boolean;
  document: StoryStateDocument | null;
  fingerprint: string | null;
  reason?: Extract<FrameTargetRecoveryBlockReason, "SNAPSHOT_MISSING" | "SNAPSHOT_INVALID" | "SNAPSHOT_SCENE_MISMATCH" | "SNAPSHOT_REFERENCE_MISSING">;
  diagnostics: string[];
};

function validateSnapshot(snapshot: string | null | undefined, sceneId: string, canonical: CanonicalIndex): SnapshotValidation {
  if (!snapshot) return invalidSnapshot(false, "SNAPSHOT_MISSING", "Generation Story State snapshot is missing.");
  let candidate: unknown;
  try { candidate = JSON.parse(snapshot) as unknown; }
  catch { return invalidSnapshot(true, "SNAPSHOT_INVALID", "Generation Story State snapshot contains invalid JSON."); }
  const parsed = storyStateSchema.safeParse(candidate);
  if (!parsed.success) return invalidSnapshot(true, "SNAPSHOT_INVALID", "Generation Story State snapshot failed validation.", parsed.error.issues.map(issue => `${issue.path.join(".") || "document"}: ${issue.message}`));
  const document = parsed.data;
  if (document.sceneId !== sceneId) return invalidSnapshot(true, "SNAPSHOT_SCENE_MISMATCH", "Generation snapshot belongs to another Scene.");
  const missing: string[] = [];
  for (const [characterId, state] of Object.entries(document.characters)) {
    if (!canonical.characterIds.has(characterId)) missing.push(`characters.${characterId}`);
    if (state.outfitId && canonical.outfits.get(state.outfitId) !== characterId) missing.push(`characters.${characterId}.outfitId`);
  }
  for (const [propId, prop] of Object.entries(document.props)) {
    if (prop.holderCharacterId && !canonical.characterIds.has(prop.holderCharacterId)) missing.push(`props.${propId}.holderCharacterId`);
  }
  if (missing.length) return invalidSnapshot(true, "SNAPSHOT_REFERENCE_MISSING", "Generation snapshot references unavailable canonical entities.", missing);
  return { available: true, valid: true, document, fingerprint: storyStateFingerprint(document), diagnostics: [] };
}

function invalidSnapshot(available: boolean, reason: NonNullable<SnapshotValidation["reason"]>, message: string, issues: string[] = []): SnapshotValidation {
  return { available, valid: false, document: null, fingerprint: null, reason, diagnostics: [message, ...issues] };
}

function assertValidSnapshot(validation: SnapshotValidation): asserts validation is SnapshotValidation & { valid: true; document: StoryStateDocument; fingerprint: string } {
  if (validation.valid) return;
  const code = validation.reason ?? "SNAPSHOT_INVALID";
  const status = code === "SNAPSHOT_MISSING" ? 422 : 422;
  throw recoveryError(code, validation.diagnostics[0] ?? "Generation Story State snapshot is invalid.", status, validation.diagnostics.slice(1));
}

function candidateBlockingReasons(input: { frameStatus: FrameStatus; hasTarget: boolean; selectedGenerationId: string | null; generation: Generation; validation: SnapshotValidation }): FrameTargetRecoveryBlockReason[] {
  const reasons: FrameTargetRecoveryBlockReason[] = [];
  if (input.hasTarget) reasons.push("TARGET_ALREADY_INITIALIZED");
  if (input.frameStatus === "GENERATING") reasons.push("FRAME_GENERATING");
  if (input.generation.status !== "SUCCESS") reasons.push("GENERATION_NOT_SUCCESS");
  if (input.frameStatus === "LOCKED" && input.generation.id !== input.selectedGenerationId) reasons.push("LOCKED_SOURCE_NOT_SELECTED");
  if (input.validation.reason) reasons.push(input.validation.reason);
  return [...new Set(reasons)];
}

function targetStatusOf(record: { document: string; originType: string; sourceFrameId: string | null; sourceGenerationId: string | null } | null): "AVAILABLE" | "MISSING" | "INVALID" {
  if (!record) return "MISSING";
  if (!frameStoryStateOrigins.includes(record.originType as typeof frameStoryStateOrigins[number])) return "INVALID";
  if (["INHERITED_FRAME_TARGET", "INHERITED_UNCONFIRMED_FRAME_TARGET"].includes(record.originType) && !record.sourceFrameId) return "INVALID";
  if (["INHERITED_LOCKED_GENERATION", "LEGACY_GENERATION_INPUT"].includes(record.originType) && (!record.sourceFrameId || !record.sourceGenerationId)) return "INVALID";
  try { return storyStateSchema.safeParse(JSON.parse(record.document) as unknown).success ? "AVAILABLE" : "INVALID"; }
  catch { return "INVALID"; }
}

function recoveryError(code: FrameTargetRecoveryErrorCode, message: string, statusCode: number, diagnostics: string[] = []) {
  return new FrameStoryStateRecoveryError(code, message, statusCode, diagnostics);
}
