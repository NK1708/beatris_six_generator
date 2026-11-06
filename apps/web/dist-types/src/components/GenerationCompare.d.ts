import React from "react";
import type { Frame, Project } from "../model.js";
export declare function GenerationCompare({ project, frame, dirty, pending, onSelect, onReview, onView }: {
    project: Project;
    frame: Frame | undefined;
    dirty: boolean;
    pending: boolean;
    onSelect(id: string): void;
    onReview(): void;
    onView(id: string): void;
}): React.JSX.Element;
//# sourceMappingURL=GenerationCompare.d.ts.map