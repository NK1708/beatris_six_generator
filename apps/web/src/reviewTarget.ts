import type { Frame, Generation, Project, Section } from "./model.js";

export interface ReviewTarget {
  frame: Frame;
  generation: Generation;
  isSelected: boolean;
}

export function resolveReviewTarget(
  project: Project,
  section: Section,
  selectedFrameId: string | null,
  reviewFrameId: string | null,
  reviewGenerationId: string | null
): ReviewTarget | null {
  const frameId = section === "generations" ? reviewFrameId : section === "frames" ? selectedFrameId : null;
  const frame = project.scenes.flatMap((scene) => scene.frames).find((item) => item.id === frameId);
  if (!frame) return null;
  const generationId = section === "generations" ? reviewGenerationId : frame.selectedGenerationId;
  const generation = frame.generations.find((item) => item.id === generationId);
  if (!generation) return null;
  return { frame, generation, isSelected: generation.id === frame.selectedGenerationId };
}
