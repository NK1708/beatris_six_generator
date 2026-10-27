import React from "react";
import type { AvailableFrameTargetStoryStateResponse } from "@bearridge/shared";
import type { Character, FrameStatus } from "../model.js";
export declare const frameTargetRecoveryCandidatesQueryKey: (frameId: string) => readonly ["frame-target-recovery-candidates", string];
export declare function FrameTargetRecoveryPanel({ frameId, frameStatus, characters, onRecovered, onTargetAlreadyExists }: {
    frameId: string;
    frameStatus: FrameStatus;
    characters: Character[];
    onRecovered(target: AvailableFrameTargetStoryStateResponse): void;
    onTargetAlreadyExists(): void;
}): React.JSX.Element | null;
export declare function recoveryErrorMessage(code: string): string;
//# sourceMappingURL=FrameTargetRecoveryPanel.d.ts.map