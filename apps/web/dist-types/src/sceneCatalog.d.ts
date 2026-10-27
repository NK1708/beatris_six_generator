import type { Scene } from "./model.js";
export interface SceneCatalogStats {
    total: number;
    locked: number;
    review: number;
    other: number;
    readinessPercent: number;
}
export declare function sceneIdentifier(scene: Pick<Scene, "sequence">): string;
export declare function sceneCatalogStats(scene: Pick<Scene, "frames">): SceneCatalogStats;
//# sourceMappingURL=sceneCatalog.d.ts.map