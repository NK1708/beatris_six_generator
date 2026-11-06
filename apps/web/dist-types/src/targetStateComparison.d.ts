import { type FrameTargetStoryStateResponse, type StoryStateDocument } from "@bearridge/shared";
import type { Scene } from "./model.js";
export type TargetComparisonSource = {
    status: "AVAILABLE";
    document: StoryStateDocument;
    label: string;
    note: string;
    generationId?: string;
} | {
    status: "UNAVAILABLE";
    label: string;
    note: string;
};
export declare function resolveTargetComparisonSource(target: FrameTargetStoryStateResponse | undefined, scene: Scene | undefined): TargetComparisonSource;
export type TargetDiffStatus = "unchanged" | "changed" | "added" | "removed" | "unavailable";
export interface TargetPropertyDiff {
    path: string[];
    before: unknown;
    after: unknown;
    status: TargetDiffStatus;
}
export declare function compareTargetProperty(source: TargetComparisonSource, target: StoryStateDocument, path: string[]): TargetPropertyDiff;
export declare function targetStateDiff(source: TargetComparisonSource, target: StoryStateDocument): TargetPropertyDiff[];
export declare function formatTargetValue(value: unknown): string;
//# sourceMappingURL=targetStateComparison.d.ts.map