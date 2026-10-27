import { randomUUID } from "node:crypto";
import type { FrameStoryState, Prisma, PrismaClient } from "@prisma/client";
import { resolveInitialFrameTargetStoryState } from "@bearridge/core";
import {
  frameStoryStateOrigins,
  storyStateSchema,
  type FrameStoryStateDiagnostic,
  type FrameStoryStateOrigin,
  type FrameStoryStateProvenance,
  type StoryStateDocument
} from "@bearridge/shared";
import { AppError } from "../errors.js";

export type FrameStoryStateServiceErrorCode =
  | "FRAME_NOT_FOUND"
  | "TARGET_NOT_INITIALIZED"
  | "TARGET_INVALID"
  | "FRAME_LOCKED"
  | "FRAME_GENERATING"
  | "LEGACY_RECOVERY_REQUIRED"
  | "REVISION_CONFLICT"
  | "INITIALIZATION_BLOCKED"
  | "PREDECESSOR_INVALID"
  | "DATABASE_ERROR";

export class FrameStoryStateServiceError extends AppError {
  constructor(
    override readonly code: FrameStoryStateServiceErrorCode,
    message: string,
    statusCode: number,
    readonly diagnostics: FrameStoryStateDiagnostic[] = [],
    options?: ErrorOptions
  ) {
    super(message, statusCode, code);
    this.name = "FrameStoryStateServiceError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export interface PersistedFrameTargetStoryState {
  status: "AVAILABLE";
  id: string;
  frameId: string;
  document: StoryStateDocument;
  revision: number;
  provenance: FrameStoryStateProvenance;
  explicitlyEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissingFrameTargetStoryState {
  status: "MISSING";
  frameId: string;
  legacy: true;
}

export type FrameTargetStoryStateReadResult = PersistedFrameTargetStoryState | MissingFrameTargetStoryState;

export interface InitializedFrameTargetStoryState extends PersistedFrameTargetStoryState {
  diagnostics: FrameStoryStateDiagnostic[];
}

export class FrameStoryStateService {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async getFrameTargetStoryState(frameId: string): Promise<FrameTargetStoryStateReadResult> {
    return this.withDatabaseErrors(async () => {
      const frame = await this.prisma.frame.findUnique({
        where: { id: frameId },
        select: { id: true, targetStoryState: true }
      });
      if (!frame) throw serviceError("FRAME_NOT_FOUND", "Frame not found.", 404);
      return frame.targetStoryState ? parsePersistedState(frame.targetStoryState) : {
        status: "MISSING",
        frameId,
        legacy: true
      };
    });
  }

  async initializeFrameTargetStoryState(frameId: string): Promise<InitializedFrameTargetStoryState> {
    return this.withDatabaseErrors(async () => {
      const frame = await this.prisma.frame.findUnique({
        where: { id: frameId },
        include: { targetStoryState: true, scene: { include: { storyState: true } }, _count: { select: { generations: true } } }
      });
      if (!frame) throw serviceError("FRAME_NOT_FOUND", "Frame not found.", 404);
      if (frame.targetStoryState) {
        return { ...parsePersistedState(frame.targetStoryState), diagnostics: [] };
      }
      if (frame._count.generations > 0) {
        throw serviceError("LEGACY_RECOVERY_REQUIRED", "A legacy Frame with Generations must recover its target from an explicit Generation snapshot.", 409);
      }
      if (frame.status === "LOCKED") {
        throw serviceError("FRAME_LOCKED", "A target state cannot be initialized for a LOCKED Frame.", 409);
      }

      const predecessor = await this.prisma.frame.findFirst({
        where: { sceneId: frame.sceneId, sequence: { lt: frame.sequence } },
        orderBy: { sequence: "desc" },
        include: {
          targetStoryState: true,
          generations: { select: { id: true, status: true, storyStateSnapshot: true } }
        }
      });
      let predecessorTarget: { document: unknown; provenance: FrameStoryStateProvenance } | undefined;
      if (predecessor?.targetStoryState) {
        try {
          const parsed = parsePersistedState(predecessor.targetStoryState);
          predecessorTarget = { document: parsed.document, provenance: parsed.provenance };
        } catch (error) {
          if (error instanceof FrameStoryStateServiceError && error.code === "TARGET_INVALID") {
            throw serviceError("PREDECESSOR_INVALID", "The predecessor target Story State is invalid.", 409);
          }
          throw error;
        }
      }

      const resolution = resolveInitialFrameTargetStoryState({
        sceneId: frame.sceneId,
        ...(frame.scene.storyState ? { sceneStoryState: frame.scene.storyState.document } : {}),
        ...(predecessor ? { predecessor: {
          id: predecessor.id,
          status: predecessor.status,
          selectedGenerationId: predecessor.selectedGenerationId,
          generations: predecessor.generations,
          ...(predecessorTarget ? { target: predecessorTarget } : {})
        } } : {})
      });
      if (resolution.status === "BLOCKED") {
        const code = predecessor ? "PREDECESSOR_INVALID" : "INITIALIZATION_BLOCKED";
        throw serviceError(code, "Frame target Story State initialization is blocked.", 409, resolution.diagnostics);
      }

      const serialized = serializeDocument(resolution.target.document);
      const provenance = resolution.target.provenance;
      const inserted = await this.prisma.$executeRawUnsafe(
        `INSERT INTO "FrameStoryState" (
          "id", "frameId", "document", "originType", "sourceFrameId", "sourceGenerationId",
          "revision", "explicitlyEditedAt", "createdAt", "updatedAt"
        )
        SELECT ?, "id", ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM "Frame"
        WHERE "id" = ? AND "status" <> 'LOCKED'
          AND NOT EXISTS (SELECT 1 FROM "Generation" WHERE "frameId" = ?)
          AND NOT EXISTS (SELECT 1 FROM "FrameStoryState" WHERE "frameId" = ?)`,
        randomUUID(),
        serialized,
        provenance.origin,
        "sourceFrameId" in provenance ? provenance.sourceFrameId : null,
        "sourceGenerationId" in provenance ? provenance.sourceGenerationId : null,
        frameId,
        frameId,
        frameId
      );
      if (inserted === 0) {
        const current = await this.prisma.frame.findUnique({
          where: { id: frameId },
          include: { targetStoryState: true, _count: { select: { generations: true } } }
        });
        if (!current) throw serviceError("FRAME_NOT_FOUND", "Frame not found.", 404);
        if (current.targetStoryState) {
          return { ...parsePersistedState(current.targetStoryState), diagnostics: [] };
        }
        if (current._count.generations > 0) {
          throw serviceError("LEGACY_RECOVERY_REQUIRED", "A legacy Frame with Generations must recover its target from an explicit Generation snapshot.", 409);
        }
        if (current.status === "LOCKED") {
          throw serviceError("FRAME_LOCKED", "A target state cannot be initialized for a LOCKED Frame.", 409);
        }
        throw serviceError("DATABASE_ERROR", "Frame target Story State was not initialized.", 500);
      }

      const created = await this.prisma.frameStoryState.findUnique({ where: { frameId } });
      if (!created) throw serviceError("DATABASE_ERROR", "Initialized Frame target Story State could not be read.", 500);
      return { ...parsePersistedState(created), diagnostics: resolution.diagnostics };
    });
  }

  async updateFrameTargetStoryState(
    frameId: string,
    document: unknown,
    expectedRevision: number
  ): Promise<PersistedFrameTargetStoryState> {
    return this.withDatabaseErrors(async () => {
      const frame = await this.prisma.frame.findUnique({
        where: { id: frameId },
        include: { targetStoryState: true }
      });
      if (!frame) throw serviceError("FRAME_NOT_FOUND", "Frame not found.", 404);
      if (frame.status === "LOCKED") throw serviceError("FRAME_LOCKED", "A LOCKED Frame target state cannot be edited.", 409);
      if (frame.status === "GENERATING") throw serviceError("FRAME_GENERATING", "A GENERATING Frame target state cannot be edited.", 409);
      if (!frame.targetStoryState) {
        throw serviceError("TARGET_NOT_INITIALIZED", "Frame target Story State has not been initialized.", 409);
      }
      const nextDocument = validateDocument(document);
      const current = parsePersistedState(frame.targetStoryState);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
        throw serviceError("REVISION_CONFLICT", "Frame target Story State revision is stale.", 409);
      }
      const serialized = serializeDocument(nextDocument);
      if (serialized === serializeDocument(current.document)) return current;

      const updated = await this.prisma.$executeRaw`
        UPDATE "FrameStoryState"
         SET "document" = ${serialized}, "revision" = "revision" + 1,
             "explicitlyEditedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "frameId" = ${frameId} AND "revision" = ${expectedRevision}
           AND EXISTS (
             SELECT 1 FROM "Frame"
             WHERE "Frame"."id" = "FrameStoryState"."frameId"
               AND "Frame"."status" IN ('DRAFT', 'REVIEW', 'REJECTED')
           )`;
      if (updated === 0) {
        const latest = await this.prisma.frame.findUnique({
          where: { id: frameId },
          include: { targetStoryState: true }
        });
        if (!latest) throw serviceError("FRAME_NOT_FOUND", "Frame not found.", 404);
        if (latest.status === "LOCKED") throw serviceError("FRAME_LOCKED", "A LOCKED Frame target state cannot be edited.", 409);
        if (latest.status === "GENERATING") throw serviceError("FRAME_GENERATING", "A GENERATING Frame target state cannot be edited.", 409);
        if (!latest.targetStoryState) {
          throw serviceError("TARGET_NOT_INITIALIZED", "Frame target Story State has not been initialized.", 409);
        }
        throw serviceError("REVISION_CONFLICT", "Frame target Story State revision is stale.", 409);
      }

      const result = await this.prisma.frameStoryState.findUnique({ where: { frameId } });
      if (!result) throw serviceError("DATABASE_ERROR", "Updated Frame target Story State could not be read.", 500);
      return parsePersistedState(result);
    });
  }

  private async withDatabaseErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FrameStoryStateServiceError) throw error;
      throw serviceError("DATABASE_ERROR", "Frame target Story State database operation failed.", 500, [], error);
    }
  }
}

function parsePersistedState(record: FrameStoryState): PersistedFrameTargetStoryState {
  let candidate: unknown;
  try {
    candidate = JSON.parse(record.document) as unknown;
  } catch (error) {
    throw serviceError("TARGET_INVALID", "Persisted Frame target Story State contains invalid JSON.", 422, [], error);
  }
  const document = validateDocument(candidate);
  const provenance = parseProvenance(record);
  return {
    status: "AVAILABLE",
    id: record.id,
    frameId: record.frameId,
    document,
    revision: record.revision,
    provenance,
    explicitlyEditedAt: record.explicitlyEditedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function validateDocument(document: unknown): StoryStateDocument {
  const parsed = storyStateSchema.safeParse(document);
  if (!parsed.success) {
    throw serviceError(
      "TARGET_INVALID",
      `Frame target Story State is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`).join("; ")}`,
      422
    );
  }
  return clone(parsed.data);
}

function parseProvenance(record: FrameStoryState): FrameStoryStateProvenance {
  if (!frameStoryStateOrigins.includes(record.originType as FrameStoryStateOrigin)) {
    throw serviceError("TARGET_INVALID", `Unknown Frame target Story State origin: ${record.originType}.`, 422);
  }
  const origin = record.originType as FrameStoryStateOrigin;
  switch (origin) {
    case "INHERITED_FRAME_TARGET":
    case "INHERITED_UNCONFIRMED_FRAME_TARGET":
      if (!record.sourceFrameId) throw serviceError("TARGET_INVALID", "Persisted target provenance is missing sourceFrameId.", 422);
      return { origin, sourceFrameId: record.sourceFrameId };
    case "INHERITED_LOCKED_GENERATION":
    case "LEGACY_GENERATION_INPUT":
      if (!record.sourceFrameId || !record.sourceGenerationId) {
        throw serviceError("TARGET_INVALID", "Persisted target provenance is incomplete.", 422);
      }
      return {
        origin,
        sourceFrameId: record.sourceFrameId,
        sourceGenerationId: record.sourceGenerationId
      };
    case "SCENE_INITIAL":
    case "EXPLICIT":
    case "EMPTY_DEFAULT":
      return { origin };
  }
}

function serializeDocument(document: StoryStateDocument): string {
  return JSON.stringify(document);
}

function clone(document: StoryStateDocument): StoryStateDocument {
  return JSON.parse(JSON.stringify(document)) as StoryStateDocument;
}

function serviceError(
  code: FrameStoryStateServiceErrorCode,
  message: string,
  statusCode: number,
  diagnostics: FrameStoryStateDiagnostic[] = [],
  cause?: unknown
): FrameStoryStateServiceError {
  return new FrameStoryStateServiceError(code, message, statusCode, diagnostics, { cause });
}
