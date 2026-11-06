import type { FrameLockReadiness } from "@bearridge/shared";
import type { Frame, Project } from "../model.js";
type Ready = Extract<FrameLockReadiness, {
    status: "READY";
}>;
export interface LockConfirmation {
    frameCode: string;
    generationStatus: string;
    frameNumber?: number | undefined;
    ready: Ready;
}
export declare function sameLockConfirmation(a: Ready, b: FrameLockReadiness): boolean;
export declare function useFrameReviewActions(project: Project, frame: Frame | undefined, dirty: boolean): {
    readiness: import("@tanstack/react-query").UseQueryResult<FrameLockReadiness, Error>;
    busy: boolean;
    select: (id: string) => void;
    canLock: boolean;
    requestLock: () => void;
    confirmation: LockConfirmation | null;
    confirmLock: () => void;
    cancelLock: () => void;
    refresh: () => Promise<void>;
    notice: string | null;
    error: Error | null;
    selectMutation: import("@tanstack/react-query").UseMutationResult<Pick<Frame, "id" | "status" | "selectedGenerationId">, Error, string, unknown>;
    lockMutation: import("@tanstack/react-query").UseMutationResult<Pick<Frame, "id" | "status" | "selectedGenerationId">, Error, LockConfirmation, unknown>;
};
export type FrameReviewActions = ReturnType<typeof useFrameReviewActions>;
export {};
//# sourceMappingURL=useFrameReviewActions.d.ts.map