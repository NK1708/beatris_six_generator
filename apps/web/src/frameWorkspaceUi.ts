import type { ChatGPTExportSummary, ContinuityEditContract, Frame, Generation, PreviewResponse } from "./model.js";

export type FrameSection = "main" | "camera" | "continuity";
export type FrameSectionState = Record<FrameSection, boolean>;

export function initialFrameSections(strategy: Frame["generationStrategy"]): FrameSectionState {
  return { main: true, camera: strategy === "NEW_COMPOSITION", continuity: false };
}

export function toggleFrameSection(state: FrameSectionState, section: FrameSection): FrameSectionState {
  return { ...state, [section]: !state[section] };
}

export function openedFrameCandidate(candidates: Generation[], openedId: string | null): Generation | undefined {
  return candidates.find((item) => item.id === openedId) ?? candidates[0];
}

export function selectedChatGPTReceipt(receipts: ChatGPTExportSummary[] | undefined, selectedId: string): ChatGPTExportSummary | undefined {
  return receipts?.find((item) => item.exportId === selectedId);
}

export interface ContinuityContractSummary {
  detectedCount: number;
  allowedCategoryCount: number;
  hasExplicitChanges: boolean;
  hasForbiddenChanges: boolean;
}

export function continuityContractSummary(
  contract: ContinuityEditContract,
  detected: PreviewResponse["detectedContinuityChanges"]
): ContinuityContractSummary {
  const allowedCategories = new Set([
    ...contract.allowedChanges,
    ...detected.map((change) => change.category)
  ]);
  return {
    detectedCount: detected.length,
    allowedCategoryCount: allowedCategories.size,
    hasExplicitChanges: contract.changes.length > 0,
    hasForbiddenChanges: contract.forbidden.length > 0
  };
}
