import type { StoryStateDocument } from "@bearridge/shared";
import type { Project } from "./model.js";
export declare function projectFileUrl(project: Project, relativePath: string): string;
export declare function readFileAsDataUrl(file: File): Promise<string>;
export declare function environmentLabel(key: string): string;
export declare function referenceKindLabel(kind: string): string;
export declare function emptyState(sceneId: string): StoryStateDocument;
export declare function splitList(value: string): string[];
export declare function splitLines(value: string): string[];
export declare function toPositiveNumber(value: string): number | undefined;
export declare function parseRatio(value: string): number;
//# sourceMappingURL=utils.d.ts.map