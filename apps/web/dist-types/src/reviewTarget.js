export function resolveReviewTarget(project, section, selectedFrameId, reviewFrameId, reviewGenerationId) {
    const frameId = section === "generations" ? reviewFrameId : section === "frames" ? selectedFrameId : null;
    const frame = project.scenes.flatMap((scene) => scene.frames).find((item) => item.id === frameId);
    if (!frame)
        return null;
    const generationId = section === "generations" ? reviewGenerationId : frame.selectedGenerationId;
    const generation = frame.generations.find((item) => item.id === generationId);
    if (!generation)
        return null;
    return { frame, generation, isSelected: generation.id === frame.selectedGenerationId };
}
