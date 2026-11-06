import type { FrameReviewActions } from "./useFrameReviewActions.js";
import React from "react";
import type { Frame, PreviewResponse, Project } from "../model.js";
export interface GenerationWorkspaceProps {
    project: Project;
    frame: Frame | undefined;
    preview: PreviewResponse | undefined;
    previewLoading: boolean;
    previewError: Error | null;
    dirty: boolean;
    refresh(): void;
    onView(generationId: string): void;
    onTarget(): void;
    onCast(): void;
    manualControls: React.ReactNode;
    reviewActions?: FrameReviewActions;
    onCompare?: () => void;
    onReview?: () => void;
}
export declare function GenerationWorkspace({ project, frame, preview, previewLoading, previewError, dirty, refresh, onView, onTarget, onCast, manualControls, reviewActions, onCompare, onReview }: GenerationWorkspaceProps): React.JSX.Element;
//# sourceMappingURL=GenerationWorkspace.d.ts.map