import type { PrismaClient } from "@prisma/client";
import { AppError } from "../errors.js";

export async function selectGenerationForFrame(prisma: PrismaClient, frameId: string, generationId: string) {
  const generation = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!generation || generation.frameId !== frameId) {
    throw new AppError("Generation does not belong to this Frame.", 400, "INVALID_GENERATION_SELECTION");
  }
  if (generation.status !== "SUCCESS") {
    throw new AppError("Only successful Generations can be selected.", 400, "INVALID_GENERATION_SELECTION");
  }
  return prisma.frame.update({
    where: { id: frameId },
    data: { selectedGenerationId: generation.id, status: "REVIEW" }
  });
}

export async function lockFrameWithSelectedGeneration(prisma: PrismaClient, frameId: string) {
  const frame = await prisma.frame.findUnique({ where: { id: frameId } });
  if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  if (!frame.selectedGenerationId) {
    throw new AppError("Select a successful Generation before locking the Frame.", 400, "LOCK_REJECTED");
  }
  const generation = await prisma.generation.findUnique({ where: { id: frame.selectedGenerationId } });
  if (!generation || generation.frameId !== frame.id || generation.status !== "SUCCESS") {
    throw new AppError("The selected Generation is not a successful result of this Frame.", 400, "LOCK_REJECTED");
  }
  return prisma.frame.update({ where: { id: frame.id }, data: { status: "LOCKED" } });
}
