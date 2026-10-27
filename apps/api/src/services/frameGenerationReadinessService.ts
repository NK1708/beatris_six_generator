import type { PrismaClient } from "@prisma/client";
import {
  resolveFrameGenerationReadiness,
  type FrameGenerationReadinessInput,
  type FrameTargetReadinessInput,
  type PhysicalVisualBaseReadiness
} from "@bearridge/core";
import type { FrameGenerationReadiness, FrameGenerationStrategy, FrameStatus } from "@bearridge/shared";
import { loadFrameContextFromPrisma } from "./contextService.js";
import { validateVisualBaseFile } from "./visualBaseValidation.js";

export async function resolveFrameGenerationReadinessForProject(
  prisma: PrismaClient,
  projectPath: string,
  frameId: string,
  missingFrameMode: FrameGenerationStrategy = "NEW_COMPOSITION"
): Promise<FrameGenerationReadiness> {
  const frame = await prisma.frame.findUnique({
    where: { id: frameId },
    select: { id: true, status: true, generationStrategy: true, previousFrameId: true, characterCastRevision: true }
  });
  if (!frame) return resolveFrameGenerationReadiness({ mode: missingFrameMode });

  const mode = frame.generationStrategy as FrameGenerationStrategy;
  const context = await loadFrameContextFromPrisma(prisma, frame.id);
  const predecessor = frame.previousFrameId
    ? await prisma.frame.findUnique({
        where: { id: frame.previousFrameId },
        select: {
          id: true,
          selectedGenerationId: true,
          generations: { select: { id: true, outputFilePath: true } }
        }
      })
    : null;

  let physicalVisualBase: PhysicalVisualBaseReadiness | undefined;
  if (mode === "CONTINUE_PREVIOUS_FRAME" && context.continuityBaseline.status === "AVAILABLE") {
    const selected = predecessor?.generations.find((generation) => generation.id === predecessor.selectedGenerationId);
    physicalVisualBase = selected?.outputFilePath
      ? await validateVisualBaseFile({ projectPath, filePath: selected.outputFilePath, generationId: selected.id })
      : { status: "UNAVAILABLE", message: "The selected previous Generation has no output image." };
  }

  const input: FrameGenerationReadinessInput = {
    mode,
    frame: {
      id: frame.id,
      status: frame.status as FrameStatus,
      previousFrameId: frame.previousFrameId
      , characterCastRevision: frame.characterCastRevision
    },
    target: mapTarget(context.frameTargetStoryState),
    predecessorExists: predecessor !== null,
    continuityBaseline: context.continuityBaseline,
    ...(physicalVisualBase ? { physicalVisualBase } : {})
  };
  return resolveFrameGenerationReadiness(input);
}

function mapTarget(target: Awaited<ReturnType<typeof loadFrameContextFromPrisma>>["frameTargetStoryState"]): FrameTargetReadinessInput {
  if (target.status === "AVAILABLE") {
    return {
      status: "AVAILABLE",
      document: target.document,
      revision: target.revision,
      provenance: target.provenance
    };
  }
  if (target.status === "INVALID") return { status: "INVALID", message: target.message };
  return { status: "MISSING" };
}
