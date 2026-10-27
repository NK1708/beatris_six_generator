export function orderedSceneFrames(frames) {
    return [...frames].sort((left, right) => left.sequence - right.sequence || left.frameCode.localeCompare(right.frameCode));
}
export function storyboardImageCandidates(frame) {
    const eligible = frame.generations.filter((generation) => generation.status === "SUCCESS" && Boolean(generation.outputFilePath));
    const selected = eligible.find((generation) => generation.id === frame.selectedGenerationId);
    const newestFirst = eligible.filter((generation) => generation.id !== selected?.id).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
    return selected ? [selected, ...newestFirst] : newestFirst;
}
export function storyboardStatus(frame) {
    if (frame.generations.length === 0)
        return "Без изображения";
    switch (frame.status) {
        case "LOCKED": return "Закреплён";
        case "REVIEW": return "На проверке";
        case "DRAFT": return "Черновик";
        case "GENERATING": return "Генерируется";
        case "REJECTED": return "Отклонён";
    }
}
export function frameAspectRatio(frame, fallback) {
    if (frame.targetWidth && frame.targetHeight)
        return frame.targetWidth / frame.targetHeight;
    if (frame.targetAspectRatio && frame.targetAspectRatio > 0)
        return frame.targetAspectRatio;
    const [width, height] = fallback.split(":").map(Number);
    return width && height && width > 0 && height > 0 ? width / height : 16 / 9;
}
