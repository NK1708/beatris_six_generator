import React from "react";
import type { LockConfirmation } from "./useFrameReviewActions.js";
export declare function LockConfirmationDialog({ confirmation, pending, onConfirm, onCancel }: {
    confirmation: LockConfirmation | null;
    pending: boolean;
    onConfirm(): void;
    onCancel(): void;
}): React.JSX.Element | null;
//# sourceMappingURL=LockConfirmationDialog.d.ts.map