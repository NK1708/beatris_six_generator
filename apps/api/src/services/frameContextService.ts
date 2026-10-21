import type { PrismaClient } from "@prisma/client";
import { AppError } from "../errors.js";

export async function updateFrameContext(
  prisma: PrismaClient,
  input: {
    frameId: string;
    characterIds: string[];
    locationId?: string | null | undefined;
    locationAngleId?: string | null | undefined;
    styleProfileId?: string | null | undefined;
    additionalCharacterReferenceIds: Record<string, string[]>;
  }
) {
  validateUnique(input.characterIds, "Frame characters contain duplicates.");
  const selectedCharacters = new Set(input.characterIds);
  const requestedReferenceIds: string[] = [];

  for (const [characterId, referenceIds] of Object.entries(input.additionalCharacterReferenceIds)) {
    if (!selectedCharacters.has(characterId) && referenceIds.length) {
      throw new AppError("Additional references can only be selected for a character present in the Frame.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
    }
    validateUnique(referenceIds, "An additional character reference was selected more than once.");
    requestedReferenceIds.push(...referenceIds);
  }

  const references = requestedReferenceIds.length
    ? await prisma.characterReference.findMany({ where: { id: { in: requestedReferenceIds } } })
    : [];
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  for (const [characterId, referenceIds] of Object.entries(input.additionalCharacterReferenceIds)) {
    for (const referenceId of referenceIds) {
      const reference = referencesById.get(referenceId);
      if (!reference) {
        throw new AppError(`Character reference not found: ${referenceId}`, 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
      }
      if (reference.characterId !== characterId) {
        throw new AppError("Selected character reference belongs to a different Character.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
      }
      if (reference.status !== "LOCKED") {
        throw new AppError("Only LOCKED character references can be selected for a Frame.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
      }
      if (reference.type === "MASTER") {
        throw new AppError("MASTER is resolved automatically and cannot be selected as an additional reference.", 400, "INVALID_CHARACTER_REFERENCE_SELECTION");
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.frameCharacter.deleteMany({ where: { frameId: input.frameId } });
    return tx.frame.update({
      where: { id: input.frameId },
      data: {
        locationId: input.locationId ?? null,
        locationAngleId: input.locationAngleId ?? null,
        styleProfileId: input.styleProfileId ?? null,
        characters: {
          create: input.characterIds.map((characterId, index) => ({
            characterId,
            order: index + 1,
            additionalReferences: {
              create: (input.additionalCharacterReferenceIds[characterId] ?? []).map((characterReferenceId, referenceIndex) => ({
                characterReferenceId,
                order: referenceIndex + 1
              }))
            }
          }))
        }
      }
    });
  });
}

function validateUnique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new AppError(message, 400, "DUPLICATE_REFERENCE_SELECTION");
  }
}
