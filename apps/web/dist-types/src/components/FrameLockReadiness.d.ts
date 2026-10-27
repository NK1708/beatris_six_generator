import React from "react";
import type { FrameLockReadiness, FrameLockReadinessReason } from "@bearridge/shared";
export declare const frameLockReadinessQueryKey: (frameId: string) => readonly ["frame-lock-readiness", string];
export declare function useFrameLockReadiness(frameId: string | null | undefined): import("@tanstack/react-query").UseQueryResult<FrameLockReadiness, Error>;
export declare const frameLockReasonLabels: Record<FrameLockReadinessReason, string>;
export declare function canLockFrame(readiness: FrameLockReadiness | undefined, selected: boolean, generationStatus: string, frameStatus: string): boolean;
export declare function canSelectFrameGeneration(frameStatus: string, generationStatus: string): boolean;
export declare function FrameLockReadinessNotice({ readiness, loading }: {
    readiness: FrameLockReadiness | undefined;
    loading?: boolean;
}): React.JSX.Element | null;
//# sourceMappingURL=FrameLockReadiness.d.ts.map