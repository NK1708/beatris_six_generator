import type { Prisma } from "@prisma/client";
import { AppError } from "../errors.js";

// The first write is conditional: SQLite holds its writer lock until commit,
// so Lock cannot interleave between this check and related context writes.
export async function updateEditableFrame(
  tx: Prisma.TransactionClient,
  frameId: string,
  data: Prisma.FrameUpdateManyMutationInput,
  errorCode = "FRAME_LOCKED"
) {
  const result = await tx.frame.updateMany({ where: { id: frameId, status: { not: "LOCKED" } }, data });
  if (result.count === 1) return;
  const frame = await tx.frame.findUnique({ where: { id: frameId }, select: { id: true } });
  if (!frame) throw new AppError("Frame not found.", 404, "NOT_FOUND");
  throw new AppError("Закреплённый кадр нельзя редактировать. Доступен только просмотр.", 409, errorCode);
}

