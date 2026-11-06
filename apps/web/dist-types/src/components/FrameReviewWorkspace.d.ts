import React from "react";
import type { Frame, Generation, Project } from "../model.js";
import type { FrameReviewActions } from "./useFrameReviewActions.js";
export declare function ReviewActionFeedback({ actions }: {
    actions: FrameReviewActions;
}): React.JSX.Element;
export declare function HistoricalGeneration({ project, generation }: {
    project: Project;
    generation: Generation;
}): React.JSX.Element;
export declare function FrameReviewWorkspace({ project, frame, dirty, actions, onCompare, onTarget }: {
    project: Project;
    frame: Frame | undefined;
    dirty: boolean;
    actions: FrameReviewActions;
    onCompare(): void;
    onTarget(): void;
}): React.JSX.Element;
//# sourceMappingURL=FrameReviewWorkspace.d.ts.map