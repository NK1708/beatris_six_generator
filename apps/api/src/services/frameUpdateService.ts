import type { PrismaClient } from "@prisma/client";
import { updateFrameSchema } from "@bearridge/shared";
import { updateEditableFrame } from "./frameMutationGuard.js";
import { updateFrameContextInTransaction } from "./frameContextService.js";

export async function updateFrame(prisma: PrismaClient, rawInput: unknown) {
  const input = updateFrameSchema.parse(rawInput);
  return prisma.$transaction(async tx => {
    await updateEditableFrame(tx, input.frameId, {
      ...(input.generationStrategy ? { generationStrategy: input.generationStrategy } : {}),
      ...(input.continuityEditContract ? { continuityEditContract: JSON.stringify(input.continuityEditContract) } : {}),
      description: input.description,
      action: input.action,
      camera: input.camera,
      composition: input.composition,
      lighting: input.lighting,
      expressionNotes: input.expressionNotes,
      continuityNotes: input.continuityNotes,
      targetWidth: input.targetWidth ?? null,
      targetHeight: input.targetHeight ?? null,
      targetAspectRatio: input.targetAspectRatio ?? (input.targetWidth && input.targetHeight ? input.targetWidth / input.targetHeight : null)
    });
    if (input.characterIds !== undefined || input.characterCastMode !== undefined || input.locationId !== undefined || input.locationAngleId !== undefined || input.styleProfileId !== undefined || input.additionalCharacterReferenceIds !== undefined) {
      return updateFrameContextInTransaction(tx, { ...input, additionalCharacterReferenceIds: input.additionalCharacterReferenceIds ?? {} });
    }
    return tx.frame.findUniqueOrThrow({ where: { id: input.frameId } });
  }, { maxWait: 5_000, timeout: 10_000 });
}
