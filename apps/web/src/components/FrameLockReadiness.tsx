import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { FrameLockReadiness, FrameLockReadinessReason } from "@bearridge/shared";
import { api } from "../api.js";

export const frameLockReadinessQueryKey = (frameId: string) => ["frame-lock-readiness", frameId] as const;

export function useFrameLockReadiness(frameId: string | null | undefined) {
  return useQuery({
    queryKey: frameLockReadinessQueryKey(frameId ?? "none"),
    queryFn: () => api.get<FrameLockReadiness>(`/api/frames/${encodeURIComponent(frameId!)}/lock-readiness`),
    enabled: Boolean(frameId),
    retry: false
  });
}

export const frameLockReasonLabels: Record<FrameLockReadinessReason, string> = {
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

export function canLockFrame(readiness: FrameLockReadiness | undefined, selected: boolean, generationStatus: string, frameStatus: string): boolean {
  return selected && generationStatus === "SUCCESS" && frameStatus !== "LOCKED" && readiness?.status === "READY";
}

export function canSelectFrameGeneration(frameStatus: string, generationStatus: string): boolean {
  return generationStatus === "SUCCESS" && frameStatus !== "LOCKED" && frameStatus !== "GENERATING";
}

export function FrameLockReadinessNotice({ readiness, loading }: { readiness: FrameLockReadiness | undefined; loading?: boolean }) {
  if (loading) return <p className="muted" role="status">Проверка готовности к закреплению...</p>;
  if (!readiness) return null;
  if (readiness.status === "READY") return <p className="targetStateNotice targetStateNotice-info" role="status">Готово к закреплению.</p>;
  return <div className="targetStateError" role="alert">{readiness.reasons.map(reason => <span key={reason}>{frameLockReasonLabels[reason]}</span>)}</div>;
}
