export const defaultInspectorCollapsed = { image: false, state: true, generation: true, compare: true, review: true };
export const frameStatusLabel = (status) => ({ DRAFT: "Черновик", GENERATING: "Создаётся", REVIEW: "На проверке", LOCKED: "Закреплён", REJECTED: "Отклонён" })[status];
export const generationStatusLabel = (status) => ({ PENDING: "Ожидает запуска", RUNNING: "Создаётся", SUCCESS: "Готов", FAILED: "Ошибка", REJECTED: "Отклонён" })[status];
export const generationModeLabel = (mode) => mode === "Production" ? "Финальная генерация" : mode === "Draft" ? "Черновая генерация" : mode;
export function initialFrameSections(strategy) {
    return { main: true, camera: strategy === "NEW_COMPOSITION", continuity: false };
}
export function toggleFrameSection(state, section) {
    return { ...state, [section]: !state[section] };
}
export function openedFrameCandidate(candidates, openedId) {
    return candidates.find((item) => item.id === openedId) ?? candidates[0];
}
export function frameWorkspaceCandidates(frame) {
    const selected = frame.generations.find(item => item.id === frame.selectedGenerationId);
    const others = frame.generations.filter(item => item.id !== selected?.id && item.status === "SUCCESS");
    return selected ? [selected, ...others] : others;
}
export function selectedChatGPTReceipt(receipts, selectedId) {
    return receipts?.find((item) => item.exportId === selectedId);
}
export function continuityContractSummary(contract, detected) {
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
