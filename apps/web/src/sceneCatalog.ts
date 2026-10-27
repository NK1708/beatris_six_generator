import type { Scene } from "./model.js";

export interface SceneCatalogStats {
  total: number;
  locked: number;
  review: number;
  other: number;
  readinessPercent: number;
}

export function sceneIdentifier(scene: Pick<Scene, "sequence">): string {
  return `S${scene.sequence.toString().padStart(3, "0")}`;
}

export function sceneCatalogStats(scene: Pick<Scene, "frames">): SceneCatalogStats {
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
