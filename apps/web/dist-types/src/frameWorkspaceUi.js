export function initialFrameSections(strategy) {
    return { main: true, camera: strategy === "NEW_COMPOSITION", continuity: false };
}
export function toggleFrameSection(state, section) {
    return { ...state, [section]: !state[section] };
}
export function openedFrameCandidate(candidates, openedId) {
    return candidates.find((item) => item.id === openedId) ?? candidates[0];
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
