import type { Prisma, PrismaClient } from "@prisma/client";
import { referenceVersionCode, slugify } from "@bearridge/core";
import type { AssetStatus } from "@bearridge/shared";
import { AppError } from "../errors.js";
import { FileService } from "./fileService.js";

type OwnerType = "character" | "outfit" | "location" | "locationAngle" | "style";

const fileService = new FileService();
const maxLockedStyleReferences = 6;

export async function uploadReferenceVersion(
  prisma: PrismaClient,
  projectRoot: string,
  ownerType: OwnerType,
  ownerId: string,
  input: { type: string; fileName: string; dataUrl: string; description: string }
) {
  if (ownerType === "character") {
    const owner = await prisma.character.findUnique({ where: { id: ownerId } });
    if (!owner) throw new AppError("Character not found.", 404, "NOT_FOUND");
    const type = normalizeReferenceType(input.type, "MASTER");
    const version = await prisma.characterReference.count({ where: { characterId: owner.id, type } }) + 1;
    const code = referenceVersionCode("CHAR", `${owner.slug}-${type.toLowerCase()}`, version);
    const filePath = await fileService.writeDataUrl(projectRoot, `characters/${owner.slug}`, input.fileName, input.dataUrl);
    return prisma.characterReference.create({
      data: { characterId: owner.id, type, version, code, filePath, description: input.description, status: "DRAFT", isCanonical: false }
    });
  }

  if (ownerType === "outfit") {
    const owner = await prisma.outfit.findUnique({ where: { id: ownerId }, include: { character: true } });
    if (!owner) throw new AppError("Outfit not found.", 404, "NOT_FOUND");
    const type = normalizeReferenceType(input.type, "MASTER");
    const version = await prisma.outfitReference.count({ where: { outfitId: owner.id, type } }) + 1;
    const code = referenceVersionCode("OUTFIT", `${owner.character.slug}-${owner.slug}-${type.toLowerCase()}`, version);
    const filePath = await fileService.writeDataUrl(projectRoot, `characters/${owner.character.slug}/outfits/${owner.slug}`, input.fileName, input.dataUrl);
    return prisma.outfitReference.create({
      data: { outfitId: owner.id, type, version, code, filePath, description: input.description, status: "DRAFT", isCanonical: false }
    });
  }

  if (ownerType === "location") {
    const owner = await prisma.location.findUnique({ where: { id: ownerId } });
    if (!owner) throw new AppError("Location not found.", 404, "NOT_FOUND");
    const type = normalizeReferenceType(input.type, "MASTER");
    const version = await prisma.locationReference.count({ where: { locationId: owner.id, type } }) + 1;
    const code = referenceVersionCode("LOC", `${owner.slug}-${type.toLowerCase()}`, version);
    const filePath = await fileService.writeDataUrl(projectRoot, `locations/${owner.slug}`, input.fileName, input.dataUrl);
    return prisma.locationReference.create({
      data: { locationId: owner.id, type, version, code, filePath, description: input.description, status: "DRAFT", isCanonical: false }
    });
  }

  if (ownerType === "locationAngle") {
    const owner = await prisma.locationAngle.findUnique({ where: { id: ownerId }, include: { location: true } });
    if (!owner) throw new AppError("Location angle not found.", 404, "NOT_FOUND");
    const type = normalizeReferenceType(input.type, "VIEW");
    const version = await prisma.locationAngleReference.count({ where: { locationAngleId: owner.id, type } }) + 1;
    const code = referenceVersionCode("ANGLE", `${owner.location.slug}-${owner.slug}-${type.toLowerCase()}`, version);
    const filePath = await fileService.writeDataUrl(projectRoot, `locations/${owner.location.slug}/angles/${owner.slug}`, input.fileName, input.dataUrl);
    return prisma.locationAngleReference.create({
      data: { locationAngleId: owner.id, type, version, code, filePath, description: input.description, status: "DRAFT", isCanonical: false }
    });
  }

  const owner = await prisma.styleProfile.findUnique({ where: { id: ownerId } });
  if (!owner) throw new AppError("Style not found.", 404, "NOT_FOUND");
  const type = normalizeReferenceType(input.type, "REF");
  const version = await prisma.styleReference.count({ where: { styleProfileId: owner.id } }) + 1;
  const code = referenceVersionCode("STYLE", `${owner.slug}-${type.toLowerCase()}`, version);
  const filePath = await fileService.writeDataUrl(projectRoot, `style/${owner.slug}`, input.fileName, input.dataUrl);
  return prisma.styleReference.create({
    data: { styleProfileId: owner.id, version, code, filePath, description: input.description, status: "DRAFT", isCanonical: false }
  });
}

export async function setReferenceStatus(prisma: PrismaClient, ownerType: OwnerType, referenceId: string, status: Extract<AssetStatus, "APPROVED" | "REJECTED" | "DEPRECATED">) {
  return updateReference(prisma, ownerType, referenceId, { status, isCanonical: false });
}

export async function lockReferenceAsCanonical(prisma: PrismaClient, ownerType: OwnerType, referenceId: string) {
  return prisma.$transaction(async (tx) => {
    const reference = await findReference(tx, ownerType, referenceId);
    if (!reference) throw new AppError("Reference not found.", 404, "NOT_FOUND");
    if (reference.status === "REJECTED") {
      throw new AppError("Rejected reference cannot be locked.", 400, "LOCK_REJECTED");
    }

    if (ownerType === "character") {
      await tx.characterReference.updateMany({ where: { characterId: reference.ownerId, type: reference.type, status: "LOCKED" }, data: { status: "DEPRECATED", isCanonical: false } });
      const locked = await tx.characterReference.update({ where: { id: referenceId }, data: { status: "LOCKED", isCanonical: true } });
      await tx.character.update({ where: { id: reference.ownerId }, data: { masterReferenceId: locked.id, status: "LOCKED" } });
      return locked;
    }
    if (ownerType === "outfit") {
      await tx.outfitReference.updateMany({ where: { outfitId: reference.ownerId, type: reference.type, status: "LOCKED" }, data: { status: "DEPRECATED", isCanonical: false } });
      const locked = await tx.outfitReference.update({ where: { id: referenceId }, data: { status: "LOCKED", isCanonical: true } });
      await tx.outfit.update({ where: { id: reference.ownerId }, data: { masterReferenceId: locked.id, status: "LOCKED" } });
      return locked;
    }
    if (ownerType === "location") {
      await tx.locationReference.updateMany({ where: { locationId: reference.ownerId, type: reference.type, status: "LOCKED" }, data: { status: "DEPRECATED", isCanonical: false } });
      const locked = await tx.locationReference.update({ where: { id: referenceId }, data: { status: "LOCKED", isCanonical: true } });
      await tx.location.update({ where: { id: reference.ownerId }, data: { masterReferenceId: locked.id, status: "LOCKED" } });
      return locked;
    }
    if (ownerType === "locationAngle") {
      await tx.locationAngleReference.updateMany({ where: { locationAngleId: reference.ownerId, type: reference.type, status: "LOCKED" }, data: { status: "DEPRECATED", isCanonical: false } });
      const locked = await tx.locationAngleReference.update({ where: { id: referenceId }, data: { status: "LOCKED", isCanonical: true } });
      await tx.locationAngle.update({ where: { id: reference.ownerId }, data: { referenceId: locked.id, status: "LOCKED" } });
      return locked;
    }

    if (reference.status !== "LOCKED") {
      const lockedCount = await tx.styleReference.count({ where: { styleProfileId: reference.ownerId, status: "LOCKED" } });
      if (lockedCount >= maxLockedStyleReferences) {
        throw new AppError(`Style can have at most ${maxLockedStyleReferences} active LOCKED references. Deprecate one before locking another.`, 400, "STYLE_REFERENCE_LIMIT_REACHED");
      }
    }
    return tx.styleReference.update({ where: { id: referenceId }, data: { status: "LOCKED", isCanonical: true } });
  });
}

export async function createLocationAngle(prisma: PrismaClient, locationId: string, input: { name: string; description: string; cameraPositionDescription: string }) {
  return prisma.locationAngle.create({
    data: {
      locationId,
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      cameraPositionDescription: input.cameraPositionDescription
    }
  });
}

async function updateReference(prisma: PrismaClient, ownerType: OwnerType, referenceId: string, data: { status: string; isCanonical: boolean }) {
  if (ownerType === "character") return prisma.characterReference.update({ where: { id: referenceId }, data });
  if (ownerType === "outfit") return prisma.outfitReference.update({ where: { id: referenceId }, data });
  if (ownerType === "location") return prisma.locationReference.update({ where: { id: referenceId }, data });
  if (ownerType === "locationAngle") return prisma.locationAngleReference.update({ where: { id: referenceId }, data });
  return prisma.styleReference.update({ where: { id: referenceId }, data });
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

async function findReference(prisma: PrismaLike, ownerType: OwnerType, referenceId: string): Promise<{ ownerId: string; type: string; status: string } | null> {
  if (ownerType === "character") {
    const reference = await prisma.characterReference.findUnique({ where: { id: referenceId } });
    return reference ? { ownerId: reference.characterId, type: reference.type, status: reference.status } : null;
  }
  if (ownerType === "outfit") {
    const reference = await prisma.outfitReference.findUnique({ where: { id: referenceId } });
    return reference ? { ownerId: reference.outfitId, type: reference.type, status: reference.status } : null;
  }
  if (ownerType === "location") {
    const reference = await prisma.locationReference.findUnique({ where: { id: referenceId } });
    return reference ? { ownerId: reference.locationId, type: reference.type, status: reference.status } : null;
  }
  if (ownerType === "locationAngle") {
    const reference = await prisma.locationAngleReference.findUnique({ where: { id: referenceId } });
    return reference ? { ownerId: reference.locationAngleId, type: reference.type, status: reference.status } : null;
  }
  const reference = await prisma.styleReference.findUnique({ where: { id: referenceId } });
  return reference ? { ownerId: reference.styleProfileId, type: "REF", status: reference.status } : null;
}

function normalizeReferenceType(type: string, fallback: string): string {
  const normalized = type.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return normalized || fallback;
}
