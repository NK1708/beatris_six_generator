import type { ChatGPTExportSummary, ContinuityEditContract, Frame, Generation, PreviewResponse } from "./model.js";
export type FrameWorkspaceMode = "image" | "state" | "generation" | "compare" | "review";
export declare const defaultInspectorCollapsed: Record<FrameWorkspaceMode, boolean>;
export declare const frameStatusLabel: (status: Frame["status"]) => string;
export declare const generationStatusLabel: (status: Generation["status"]) => string;
export declare const generationModeLabel: (mode: string) => string;
export type FrameSection = "main" | "camera" | "continuity";
export type FrameSectionState = Record<FrameSection, boolean>;
export declare function initialFrameSections(strategy: Frame["generationStrategy"]): FrameSectionState;
export declare function toggleFrameSection(state: FrameSectionState, section: FrameSection): FrameSectionState;
export declare function openedFrameCandidate(candidates: Generation[], openedId: string | null): Generation | undefined;
export declare function frameWorkspaceCandidates(frame: Frame): Generation[];
export declare function selectedChatGPTReceipt(receipts: ChatGPTExportSummary[] | undefined, selectedId: string): ChatGPTExportSummary | undefined;
export interface ContinuityContractSummary {
    detectedCount: number;
    allowedCategoryCount: number;
    hasExplicitChanges: boolean;
    hasForbiddenChanges: boolean;
}
export declare function continuityContractSummary(contract: ContinuityEditContract, detected: PreviewResponse["detectedContinuityChanges"]): ContinuityContractSummary;
//# sourceMappingURL=frameWorkspaceUi.d.ts.map