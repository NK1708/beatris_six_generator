import { jsx as _jsx } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
export const frameLockReadinessQueryKey = (frameId) => ["frame-lock-readiness", frameId];
export function useFrameLockReadiness(frameId) {
    return useQuery({
        queryKey: frameLockReadinessQueryKey(frameId ?? "none"),
        queryFn: () => api.get(`/api/frames/${encodeURIComponent(frameId)}/lock-readiness`),
        enabled: Boolean(frameId),
        retry: false
    });
}
export const frameLockReasonLabels = {
    FRAME_NOT_FOUND: "Кадр больше недоступен.",
    FRAME_ALREADY_LOCKED: "Кадр уже закреплён.",
    FRAME_GENERATING: "Дождитесь завершения текущей генерации.",
    SELECTION_MISSING: "Сначала выберите успешный результат.",
    GENERATION_NOT_FOUND: "Выбранная генерация недоступна.",
    GENERATION_NOT_SUCCESS: "Выбранная генерация не завершена успешно.",
    GENERATION_OWNERSHIP_MISMATCH: "Выбранная генерация относится к другому кадру.",
    OUTPUT_FILE_MISSING: "Файл выбранной генерации недоступен.",
    SNAPSHOT_MISSING: "У генерации отсутствует историческое состояние.",
    SNAPSHOT_INVALID: "Историческое состояние генерации повреждено.",
    TARGET_NOT_INITIALIZED: "Для кадра отсутствует сохранённое целевое состояние.",
    TARGET_INVALID: "Целевое состояние кадра повреждено.",
    TARGET_SNAPSHOT_MISMATCH: "Генерация создана для другого состояния кадра. Создайте новую генерацию или восстановите соответствующее целевое состояние.",
    GENERATION_METADATA_INCONSISTENT: "Метаданные генерации не совпадают с её историческим состоянием.",
    LOCK_READINESS_STALE: "Состояние изменилось во время закрепления. Проверьте его ещё раз."
};
export function canLockFrame(readiness, selected, generationStatus, frameStatus) {
    return selected && generationStatus === "SUCCESS" && frameStatus !== "LOCKED" && readiness?.status === "READY";
}
export function canSelectFrameGeneration(frameStatus, generationStatus) {
    return generationStatus === "SUCCESS" && frameStatus !== "LOCKED" && frameStatus !== "GENERATING";
}
export function FrameLockReadinessNotice({ readiness, loading }) {
    if (loading)
        return _jsx("p", { className: "muted", role: "status", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438 \u043A \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u044E..." });
    if (!readiness)
        return null;
    if (readiness.status === "READY")
        return _jsx("p", { className: "targetStateNotice targetStateNotice-info", role: "status", children: "\u0413\u043E\u0442\u043E\u0432\u043E \u043A \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u044E." });
    return _jsx("div", { className: "targetStateError", role: "alert", children: readiness.reasons.map(reason => _jsx("span", { children: frameLockReasonLabels[reason] }, reason)) });
}
