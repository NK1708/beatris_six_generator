export function sceneIdentifier(scene) {
    return `S${scene.sequence.toString().padStart(3, "0")}`;
}
export function sceneCatalogStats(scene) {
    const total = scene.frames.length;
    const locked = scene.frames.filter((frame) => frame.status === "LOCKED").length;
    const review = scene.frames.filter((frame) => frame.status === "REVIEW").length;
    return {
        total,
        locked,
        review,
        other: total - locked - review,
        readinessPercent: total === 0 ? 0 : Math.round((locked / total) * 100)
    };
}
