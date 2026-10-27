import type { Frame, Prisma, PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { frameCode } from "@bearridge/core";
import { createFrameSchema, type FrameStoryStateDiagnostic } from "@bearridge/shared";
import { AppError } from "../errors.js";
import { FrameStoryStateService, type InitializedFrameTargetStoryState } from "./frameStoryStateService.js";

export type CreateFrameInput = z.infer<typeof createFrameSchema>;

export interface CreatedFrameWithTarget {
  frame: Frame & { characters: Array<{ characterId: string; order: number }> };
  target: InitializedFrameTargetStoryState;
  diagnostics: FrameStoryStateDiagnostic[];
}

export interface FrameCreationDependencies {
  initializeTarget(
    transaction: Prisma.TransactionClient,
    frameId: string
  ): Promise<InitializedFrameTargetStoryState>;
}

const defaultDependencies: FrameCreationDependencies = {
  initializeTarget: (transaction, frameId) => new FrameStoryStateService(transaction).initializeFrameTargetStoryState(frameId)
};

export async function createFrameWithTargetStoryState(
  prisma: PrismaClient,
  input: CreateFrameInput,
  dependencies: FrameCreationDependencies = defaultDependencies
): Promise<CreatedFrameWithTarget> {
  return prisma.$transaction(async (transaction) => {
    const scene = await transaction.scene.findUnique({
      where: { id: input.sceneId },
      include: {
        characters: { orderBy: { order: "asc" }, select: { characterId: true } },
        frames: {
          ...(input.sequence ? { where: { sequence: { lt: input.sequence } } } : {}),
          orderBy: [{ sequence: "desc" }, { frameCode: "desc" }],
          take: 1,
          include: { characters: { orderBy: { order: "asc" }, select: { characterId: true } } }
        }
      }
    });
    if (!scene) throw new AppError("Scene not found.", 404, "NOT_FOUND");

    const predecessor = scene.frames[0];
    const sequence = input.sequence ?? (predecessor?.sequence ?? 0) + 1;
    const inheritedCharacterIds = predecessor
      ? (predecessor.characters.length > 0
          ? predecessor.characters.map((item) => item.characterId)
          : scene.characters.map((item) => item.characterId))
      : scene.characters.map((item) => item.characterId);
    const requestedCharacterIds = input.characterIds ?? inheritedCharacterIds;
    const characterIds = await validateCharacterIds(transaction, scene.projectId, requestedCharacterIds);
    const characterCastSource = input.characterIds !== undefined
      ? "EXPLICIT"
      : predecessor?.characters.length
        ? "INHERITED_PREVIOUS"
        : "INHERITED_SCENE";

    const frame = await transaction.frame.create({
      data: {
        sceneId: scene.id,
        sequence,
        type: input.type,
        generationStrategy: input.generationStrategy,
        continuityEditContract: JSON.stringify(input.continuityEditContract),
        description: input.description,
        action: input.action,
        camera: input.camera,
        composition: input.composition,
        lighting: input.lighting,
        expressionNotes: input.expressionNotes,
        continuityNotes: input.continuityNotes,
        previousFrameId: predecessor?.id ?? null,
        characterCastSource,
        locationId: input.locationId ?? scene.locationId ?? null,
        locationAngleId: input.locationAngleId ?? null,
        styleProfileId: input.styleProfileId ?? null,
        targetWidth: input.targetWidth ?? null,
        targetHeight: input.targetHeight ?? null,
        targetAspectRatio: input.targetAspectRatio ?? null,
        frameCode: frameCode(scene.sequence, sequence),
        characters: {
          create: characterIds.map((characterId, index) => ({ characterId, order: index + 1 }))
        }
      },
      include: { characters: { orderBy: { order: "asc" }, select: { characterId: true, order: true } } }
    });
    const target = await dependencies.initializeTarget(transaction, frame.id);
    return { frame, target, diagnostics: target.diagnostics };
  }, { maxWait: 5_000, timeout: 10_000 });
}

async function validateCharacterIds(
  transaction: Prisma.TransactionClient,
  projectId: string,
  candidates: string[]
): Promise<string[]> {
  const unique = [...new Set(candidates)];
  if (unique.length !== candidates.length) {
    throw new AppError("Frame characters contain duplicates.", 400, "INVALID_FRAME_CHARACTER_SELECTION");
  }
  if (unique.length === 0) return [];
  const available = new Set((await transaction.character.findMany({
    where: { projectId, id: { in: unique } },
    select: { id: true }
  })).map((character) => character.id));
  const invalid = unique.filter((characterId) => !available.has(characterId));
  if (invalid.length) {
    throw new AppError(`Frame characters are missing or belong to another Project: ${invalid.join(", ")}.`, 400, "INVALID_FRAME_CHARACTER_SELECTION");
  }
  return unique;
}
