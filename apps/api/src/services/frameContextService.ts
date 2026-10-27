import type { Prisma, PrismaClient } from "@prisma/client";
import type { FrameCharacterCastMode } from "@bearridge/shared";
import { AppError } from "../errors.js";

export async function updateFrameContext(prisma: PrismaClient, input: {
  frameId: string;
  characterIds?: string[] | undefined;
  characterCastMode?: FrameCharacterCastMode | undefined;
  expectedCharacterCastRevision?: number | undefined;
  locationId?: string | null | undefined;
  locationAngleId?: string | null | undefined;
  styleProfileId?: string | null | undefined;
  additionalCharacterReferenceIds?: Record<string, string[]> | undefined;
}) {
  if (input.characterCastMode === "EXPLICIT" && input.characterIds === undefined) throw new AppError("characterIds is required for EXPLICIT cast mode.", 400, "INVALID_FRAME_CHARACTER_SELECTION");
  if (input.characterCastMode === "INHERIT" && input.characterIds !== undefined) throw new AppError("characterIds cannot be supplied with INHERIT cast mode.", 400, "INVALID_FRAME_CHARACTER_SELECTION");
  const changesCast = input.characterCastMode !== undefined || input.characterIds !== undefined;

  return prisma.$transaction(async (tx) => {
    const frame = await tx.frame.findUnique({ where: { id: input.frameId }, include: { scene: { include: { characters: { orderBy: { order: "asc" } } } } } });
    if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
    if (changesCast && ["GENERATING", "LOCKED"].includes(frame.status)) throw new AppError("Frame cast cannot be changed while the Frame is GENERATING or LOCKED.", 409, "FRAME_CAST_MUTATION_FORBIDDEN");
    if (changesCast && input.expectedCharacterCastRevision !== undefined && input.expectedCharacterCastRevision !== frame.characterCastRevision) throw new AppError("Frame cast changed since it was loaded.", 409, "FRAME_CAST_REVISION_CONFLICT");

    let characterIds: string[] | undefined;
    let source: "EXPLICIT" | "INHERITED_PREVIOUS" | "INHERITED_SCENE" | undefined;
    if (changesCast) {
      if (input.characterCastMode === "INHERIT") {
        const predecessor = await tx.frame.findFirst({ where: { sceneId: frame.sceneId, sequence: { lt: frame.sequence } }, orderBy: [{ sequence: "desc" }, { frameCode: "desc" }], include: { characters: { orderBy: { order: "asc" } } } });
        if (predecessor?.characters.length) {
          characterIds = predecessor.characters.map((item) => item.characterId);
          source = "INHERITED_PREVIOUS";
        } else {
          characterIds = frame.scene.characters.map((item) => item.characterId);
          source = "INHERITED_SCENE";
        }
      } else {
        characterIds = input.characterIds ?? [];
        source = "EXPLICIT";
      }
      await validateCharacters(tx, frame.scene.projectId, characterIds);
      await validateReferences(tx, characterIds, input.additionalCharacterReferenceIds ?? {});
      await tx.frameCharacter.deleteMany({ where: { frameId: frame.id } });
    }

    const data: Prisma.FrameUpdateInput = {
      ...(input.locationId !== undefined ? { location: input.locationId ? { connect: { id: input.locationId } } : { disconnect: true } } : {}),
      ...(input.locationAngleId !== undefined ? { locationAngle: input.locationAngleId ? { connect: { id: input.locationAngleId } } : { disconnect: true } } : {}),
      ...(input.styleProfileId !== undefined ? { styleProfile: input.styleProfileId ? { connect: { id: input.styleProfileId } } : { disconnect: true } } : {}),
      ...(changesCast ? { characterCastSource: source!, characterCastRevision: { increment: 1 }, characters: { create: characterIds!.map((characterId, index) => ({ characterId, order: index + 1, additionalReferences: { create: (input.additionalCharacterReferenceIds?.[characterId] ?? []).map((characterReferenceId, referenceIndex) => ({ characterReferenceId, order: referenceIndex + 1 })) } })) } } : {})
    };
    return tx.frame.update({ where: { id: frame.id }, data, include: { characters: { orderBy: { order: "asc" }, include: { additionalReferences: true } } } });
  }, { maxWait: 5_000, timeout: 10_000 });
}

async function validateCharacters(tx: Prisma.TransactionClient, projectId: string, ids: string[]): Promise<void> {
  if (new Set(ids).size !== ids.length) throw new AppError("Frame characters contain duplicates.", 400, "INVALID_FRAME_CHARACTER_SELECTION");
  const found = ids.length ? await tx.character.findMany({ where: { projectId, id: { in: ids } }, select: { id: true } }) : [];
  const valid = new Set(found.map((item) => item.id));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length) throw new AppError(`Frame characters are missing or belong to another Project: ${invalid.join(", ")}.`, 400, "INVALID_FRAME_CHARACTER_SELECTION");
}

async function validateReferences(tx: Prisma.TransactionClient, characterIds: string[], selections: Record<string, string[]>): Promise<void> {
  const selected = new Set(characterIds);
  const ids = Object.values(selections).flat();
  if (new Set(ids).size !== ids.length) throw new AppError("An additional character reference was selected more than once.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
  const references = ids.length ? await tx.characterReference.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  for (const [characterId, referenceIds] of Object.entries(selections)) {
    if (referenceIds.length && !selected.has(characterId)) throw new AppError("Additional references require a selected Frame character.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
    for (const id of referenceIds) {
      const reference = byId.get(id);
      if (!reference || reference.characterId !== characterId || reference.status !== "LOCKED" || reference.type === "MASTER") throw new AppError(`Invalid additional character reference: ${id}.`, 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
    }
  }
}
