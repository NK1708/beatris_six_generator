import type { Frame, Generation, Project, Section } from "./model.js";
export interface ReviewTarget {
    frame: Frame;
    generation: Generation;
    isSelected: boolean;
}
export declare function resolveReviewTarget(project: Project, section: Section, selectedFrameId: string | null, reviewFrameId: string | null, reviewGenerationId: string | null): ReviewTarget | null;
//# sourceMappingURL=reviewTarget.d.ts.map