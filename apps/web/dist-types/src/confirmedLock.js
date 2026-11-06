import { ApiError } from "./api.js";
import { parseGenerationResponse } from "./generationWorkspace.js";
export async function requestConfirmedLock(frameId, expected) {
    let response;
    try {
        response = await fetch(`/api/frames/${encodeURIComponent(frameId)}/lock-confirmed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expected) });
    }
    catch {
        throw unknownOutcome();
    }
    if (response.status === 404 || response.status === 405) {
        throw new ApiError("Сервер не поддерживает подтверждённое закрепление или кадр недоступен. Обновите сервер и проверьте кадр. Небезопасное закрепление не выполнялось.", "LOCK_API_INCOMPATIBLE", response.status);
    }
    if (response.status >= 500)
        throw unknownOutcome();
    try {
        return await parseGenerationResponse(response);
    }
    catch (error) {
        if (error instanceof ApiError)
            throw error;
        throw unknownOutcome();
    }
}
function unknownOutcome() {
    return new ApiError("Ответ на закрепление не получен. Операция могла выполниться; проверяется актуальный статус кадра. Не повторяйте её автоматически.", "LOCK_OUTCOME_UNKNOWN", 0);
}
