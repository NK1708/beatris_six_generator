import type { Frame, Generation } from "./model.js";
export declare function orderedSceneFrames(frames: Frame[]): Frame[];
export declare function storyboardImageCandidates(frame: Frame): Generation[];
export declare function storyboardStatus(frame: Frame): string;
export declare function frameAspectRatio(frame: Frame, fallback: string): number;
//# sourceMappingURL=storyboard.d.ts.map