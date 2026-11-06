import type { ChatGPTExportSummary, ContinuityEditContract, Frame, Generation, PreviewResponse } from "./model.js";

export type FrameWorkspaceMode = "image" | "state" | "generation" | "compare" | "review";
export const defaultInspectorCollapsed: Record<FrameWorkspaceMode, boolean> = { image: false, state: true, generation: true, compare: true, review: true };
export const frameStatusLabel = (status: Frame["status"]): string => ({ DRAFT: "Черновик", GENERATING: "Создаётся", REVIEW: "На проверке", LOCKED: "Закреплён", REJECTED: "Отклонён" })[status];
export const generationStatusLabel = (status: Generation["status"]): string => ({ PENDING: "Ожидает запуска", RUNNING: "Создаётся", SUCCESS: "Готов", FAILED: "Ошибка", REJECTED: "Отклонён" })[status];
export const generationModeLabel = (mode: string): string => mode === "Production" ? "Финальная генерация" : mode === "Draft" ? "Черновая генерация" : mode;

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

export function frameWorkspaceCandidates(frame: Frame): Generation[] {
  const selected = frame.generations.find(item => item.id === frame.selectedGenerationId);
  const others = frame.generations.filter(item => item.id !== selected?.id && item.status === "SUCCESS");
  return selected ? [selected, ...others] : others;
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
