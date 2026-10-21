import type { Prisma } from "@prisma/client";
import { continuityEditContractSchema, type AssetStatus, type FrameStatus, type FrameType } from "@bearridge/shared";
import { type FrameContext, type FrameView, type ProjectView } from "@bearridge/core";
import { createEmptyStoryState, parseStoryState } from "@bearridge/core";
import { NotFoundError } from "../errors.js";
import { projectDbManager } from "../db.js";

const projectInclude = {
  characters: {
    include: {
      references: true,
      outfits: { include: { references: true } }
    }
  },
  locations: {
    include: {
      references: true,
      angles: { include: { references: true } }
    }
  },
  styleProfiles: {
    include: {
      references: true
    }
  },
  scenes: {
    include: {
      storyState: true,
      characters: true,
      frames: { include: { generations: true, characters: { include: { additionalReferences: true } } } }
    },
    orderBy: { sequence: "asc" as const }
  },
  modelPricing: true
} satisfies Prisma.ProjectInclude;

export async function loadProject(id: string) {
  const { prisma } = await projectDbManager.openRegisteredProject(id);
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project) {
    throw new NotFoundError("Project not found.");
  }
  return project;
}

export async function loadFrameContext(frameId: string): Promise<FrameContext> {
  const { prisma } = projectDbManager.getActiveProject();
  const frame = await prisma.frame.findUnique({
    where: { id: frameId },
    include: {
      characters: { include: { additionalReferences: true } },
      location: { include: { references: true, angles: { include: { references: true } } } },
      locationAngle: { include: { references: true } },
      styleProfile: { include: { references: true } }
    }
  });
  if (!frame) {
    throw new NotFoundError("Frame not found.");
  }

  const scene = await prisma.scene.findUnique({
    where: { id: frame.sceneId },
    include: {
      storyState: true,
      project: true,
      characters: true,
      location: { include: { references: true, angles: { include: { references: true } } } },
      styleProfile: { include: { references: true } }
    }
  });
  if (!scene) {
    throw new NotFoundError("Scene not found.");
  }

  const characters = await prisma.character.findMany({
    where: { projectId: scene.projectId },
    include: {
      references: true,
      outfits: { include: { references: true } }
    },
    orderBy: { name: "asc" }
  });
  const styleProfile = frame.styleProfile ?? scene.styleProfile ?? await prisma.styleProfile.findFirst({
    where: { projectId: scene.projectId, status: "LOCKED" },
    include: { references: true },
    orderBy: { name: "asc" }
  });
  const selectedLocation = frame.location ?? scene.location;
  const frameCharacterIds = frame.characters.sort((left, right) => left.order - right.order).map((item) => item.characterId);
  const additionalCharacterReferenceIds = Object.fromEntries(frame.characters.map((item) => [
    item.characterId,
    item.additionalReferences.sort((left, right) => left.order - right.order).map((selection) => selection.characterReferenceId)
  ]));
  const sceneCharacterIds = scene.characters.sort((left, right) => left.order - right.order).map((item) => item.characterId);
  const selectedLocationAngle = frame.locationAngle;
  const previousLockedFrame = frame.previousFrameId
    ? await prisma.frame.findFirst({
        where: { id: frame.previousFrameId, status: "LOCKED" },
        include: { generations: true }
      })
    : null;
  const selectedPreviousGeneration = previousLockedFrame?.generations.find((generation) => generation.id === previousLockedFrame.selectedGenerationId);

  return {
    project: mapProject(scene.project),
    scene: {
      id: scene.id,
      sequence: scene.sequence,
      name: scene.name,
      description: scene.description,
      locationId: scene.locationId,
      styleProfileId: scene.styleProfileId,
      characterIds: sceneCharacterIds,
      timeDescription: scene.timeDescription
    },
    frame: {
      id: frame.id,
      sceneId: frame.sceneId,
      sequence: frame.sequence,
      frameCode: frame.frameCode,
      type: frame.type as FrameType,
      status: frame.status as FrameStatus,
      generationStrategy: frame.generationStrategy as FrameView["generationStrategy"],
      continuityEditContract: parseContinuityEditContract(frame.continuityEditContract),
      description: frame.description,
      action: frame.action,
      camera: frame.camera,
      composition: frame.composition,
      lighting: frame.lighting,
      expressionNotes: frame.expressionNotes,
      continuityNotes: frame.continuityNotes,
      previousFrameId: frame.previousFrameId,
      selectedGenerationId: frame.selectedGenerationId,
      characterIds: frameCharacterIds.length ? frameCharacterIds : sceneCharacterIds,
      additionalCharacterReferenceIds,
      locationId: selectedLocation?.id ?? null,
      locationAngleId: selectedLocationAngle?.id ?? null,
      styleProfileId: styleProfile?.id ?? null,
      targetWidth: frame.targetWidth,
      targetHeight: frame.targetHeight,
      targetAspectRatio: frame.targetAspectRatio
    },
    storyState: scene.storyState ? parseStoryState(JSON.parse(scene.storyState.document) as unknown) : createEmptyStoryState(scene.id),
    previousStoryState: parsePreviousStoryState(selectedPreviousGeneration?.storyStateSnapshot),
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      bodyDescription: character.bodyDescription,
      faceDescription: character.faceDescription,
      hairDescription: character.hairDescription,
      immutableFeatures: character.immutableFeatures,
      masterReferenceId: character.masterReferenceId,
      status: character.status as AssetStatus,
      references: character.references.map((reference) => ({
        id: reference.id,
        code: reference.code,
        type: reference.type,
        filePath: reference.filePath,
        description: reference.description,
        status: reference.status as AssetStatus,
        isCanonical: reference.isCanonical
      })),
      outfits: character.outfits.map((outfit) => ({
        id: outfit.id,
        name: outfit.name,
        description: outfit.description,
        immutableFeatures: outfit.immutableFeatures,
        masterReferenceId: outfit.masterReferenceId,
        status: outfit.status as AssetStatus,
        references: outfit.references.map((reference) => ({
          id: reference.id,
          code: reference.code,
          type: reference.type,
          filePath: reference.filePath,
          description: reference.description,
          status: reference.status as AssetStatus,
          isCanonical: reference.isCanonical
        }))
      }))
    })),
    location: selectedLocation ? {
      id: selectedLocation.id,
      name: selectedLocation.name,
      description: selectedLocation.description,
      architectureDescription: selectedLocation.architectureDescription,
      immutableFeatures: selectedLocation.immutableFeatures,
      masterReferenceId: selectedLocation.masterReferenceId,
      status: selectedLocation.status as AssetStatus,
      references: selectedLocation.references.map((reference) => ({
        id: reference.id,
        code: reference.code,
        type: reference.type,
        filePath: reference.filePath,
        description: reference.description,
        status: reference.status as AssetStatus,
        isCanonical: reference.isCanonical
      })),
      angles: selectedLocation.angles.map((angle) => ({
        id: angle.id,
        slug: angle.slug,
        name: angle.name,
        description: angle.description,
        cameraPositionDescription: angle.cameraPositionDescription,
        referenceId: angle.referenceId,
        status: angle.status as AssetStatus,
        references: angle.references.map((reference) => ({
          id: reference.id,
          code: reference.code,
          type: reference.type,
          filePath: reference.filePath,
          description: reference.description,
          status: reference.status as AssetStatus,
          isCanonical: reference.isCanonical
        }))
      }))
    } : null,
    locationAngle: selectedLocationAngle ? {
      id: selectedLocationAngle.id,
      slug: selectedLocationAngle.slug,
      name: selectedLocationAngle.name,
      description: selectedLocationAngle.description,
      cameraPositionDescription: selectedLocationAngle.cameraPositionDescription,
      referenceId: selectedLocationAngle.referenceId,
      status: selectedLocationAngle.status as AssetStatus,
      references: selectedLocationAngle.references.map((reference) => ({
        id: reference.id,
        code: reference.code,
        type: reference.type,
        filePath: reference.filePath,
        description: reference.description,
        status: reference.status as AssetStatus,
        isCanonical: reference.isCanonical
      }))
    } : null,
    styleProfile: styleProfile ? {
      id: styleProfile.id,
      name: styleProfile.name,
      description: styleProfile.description,
      linework: styleProfile.linework,
      anatomy: styleProfile.anatomy,
      faces: styleProfile.faces,
      shading: styleProfile.shading,
      colorPalette: styleProfile.colorPalette,
      backgroundDetail: styleProfile.backgroundDetail,
      lighting: styleProfile.lighting,
      cameraLanguage: styleProfile.cameraLanguage,
      negativeRules: styleProfile.negativeRules,
      status: styleProfile.status as AssetStatus,
      references: styleProfile.references.map((reference) => ({
        id: reference.id,
        code: reference.code,
        filePath: reference.filePath,
        description: reference.description,
        status: reference.status as AssetStatus,
        isCanonical: reference.isCanonical
      }))
    } : null,
    previousLockedFrame: previousLockedFrame && selectedPreviousGeneration?.outputFilePath ? {
      id: previousLockedFrame.id,
      frameCode: previousLockedFrame.frameCode,
      generationId: selectedPreviousGeneration.id,
      outputFilePath: selectedPreviousGeneration.outputFilePath
    } : undefined
  };
}

function parseContinuityEditContract(value: string) {
  try {
    return continuityEditContractSchema.parse(JSON.parse(value) as unknown);
  } catch {
    return continuityEditContractSchema.parse({});
  }
}

function parsePreviousStoryState(value: string | undefined): FrameContext["previousStoryState"] {
  if (!value) return undefined;
  try {
    return parseStoryState(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

function mapProject(project: ProjectView & { rootPath?: string; slug?: string; defaultProvider?: string; createdAt?: Date; updatedAt?: Date }): ProjectView {
  return {
    id: project.id,
    name: project.name,
    defaultAspectRatio: project.defaultAspectRatio,
    defaultResolution: project.defaultResolution,
    defaultDraftModel: project.defaultDraftModel,
    defaultProductionModel: project.defaultProductionModel
  };
}

export { projectInclude };
