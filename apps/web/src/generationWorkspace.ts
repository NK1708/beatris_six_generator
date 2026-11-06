import { ApiError } from "./api.js";
import type { Generation, PreviewResponse, Project } from "./model.js";

export interface GenerationDiagnostic { code: string; message: string; entityId?: string }
export class GenerationRequestError extends ApiError {
  constructor(message: string, code: string | null, status: number, readonly problems: GenerationDiagnostic[]) { super(message, code, status); }
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Preserve server diagnostics; no readiness rules are reconstructed in the UI.
export async function generationRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseGenerationResponse<T>(response);
}

export async function parseGenerationResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const record = object(data) ? data : {};
    const problems = Array.isArray(record.diagnostics) ? record.diagnostics.flatMap((item: unknown): GenerationDiagnostic[] => object(item) && typeof item.message === "string" ? [{ code: typeof item.reason === "string" ? item.reason : typeof item.code === "string" ? item.code : "SERVER_DIAGNOSTIC", message: item.message, ...(typeof item.entityId === "string" ? { entityId: item.entityId } : {}) }] : []) : [];
    if (!problems.length && Array.isArray(record.reasons)) for (const reason of record.reasons) if (typeof reason === "string") problems.push({ code: reason, message: generationProblemLabel(reason) });
    throw new GenerationRequestError(typeof record.error === "string" ? record.error : "Не удалось выполнить запрос.", typeof record.code === "string" ? record.code : null, response.status, problems);
  }
  return data as T;
}

const labels: Record<string, string> = {
  PRODUCTION_GENERATION_BLOCKED: "Финальная генерация заблокирована серверной проверкой состояния кадра.", GENERATION_READINESS_STALE: "Состояние изменилось. Обновите проверку перед запуском.", FRAME_STATUS_NOT_GENERATABLE: "Текущий статус кадра не разрешает запуск.", TARGET_NOT_INITIALIZED: "Сначала подготовьте и сохраните целевое состояние кадра.", TARGET_INVALID: "Сохранённое целевое состояние повреждено. Откройте состояние кадра.", PREDECESSOR_NOT_LOCKED: "Предыдущий кадр должен быть закреплён.", PREDECESSOR_NOT_FOUND: "Предыдущий кадр недоступен.", PREDECESSOR_SELECTION_MISSING: "У предыдущего кадра не выбран результат.", PREDECESSOR_GENERATION_NOT_FOUND: "Выбранный результат предыдущего кадра недоступен.", PREDECESSOR_GENERATION_NOT_SUCCESS: "Выбранный результат предыдущего кадра не завершён успешно.", PREDECESSOR_SNAPSHOT_INVALID: "Историческое состояние предыдущего результата недоступно или повреждено.", VISUAL_BASE_MISSING: "Не найдена визуальная основа продолжения.", VISUAL_BASE_FILE_UNAVAILABLE: "Файл визуальной основы недоступен.", VISUAL_BASE_GENERATION_MISMATCH: "Визуальная основа не совпадает с выбранной генерацией.", GENERATION_START_CONFLICT: "Кадр изменился или уже генерируется. Обновите результаты перед повтором.", PROVIDER_EDIT_UNSUPPORTED: "Текущий provider не поддерживает продолжение изображения.", INVALID_CONTINUATION_BASE: "Визуальная основа продолжения не прошла проверку."
};
export function generationProblemLabel(code: string, fallback?: string): string { return labels[code] ?? fallback ?? code; }
export function generationMetadata(generation: Generation): { mode: string; error: string | null; targetRevision: number | null } {
  let metadata: unknown; try { metadata = JSON.parse(generation.rawMetadata ?? "null") as unknown; } catch { metadata = null; }
  const record = object(metadata) ? metadata : {};
  const targetRevision = object(record.productionTarget) && typeof record.productionTarget.revision === "number" ? record.productionTarget.revision : null;
  return { mode: record.manualImport === true ? "Ручной импорт" : targetRevision !== null ? "Production" : "Режим не сохранён", error: generation.status === "FAILED" && typeof record.message === "string" ? record.message : null, targetRevision };
}
export type GenerationFix = { kind: "target" | "cast"; label: string } | { kind: "character" | "outfit" | "location" | "style"; id: string; label: string } | { kind: "explain"; label: string };
export function generationFix(project: Project, issue: GenerationDiagnostic): GenerationFix {
  if (issue.code.includes("TARGET") || issue.code === "MISSING_CHARACTER_OUTFIT") return { kind: "target", label: "Открыть состояние кадра и образы" };
  const character = project.characters.find(item => item.id === issue.entityId);
  if (character) return { kind: "character", id: character.id, label: "Референсы: " + character.name };
  const owner = project.characters.find(item => item.outfits.some(outfit => outfit.id === issue.entityId));
  if (owner) return { kind: "outfit", id: owner.id, label: "Открыть образ у " + owner.name };
  const location = project.locations.find(item => item.id === issue.entityId || item.angles.some(angle => angle.id === issue.entityId));
  if (location) return { kind: "location", id: location.id, label: "Референсы локации: " + location.name };
  const style = project.styleProfiles.find(item => item.id === issue.entityId);
  if (style) return { kind: "style", id: style.id, label: "Открыть стиль: " + style.name };
  if (issue.code.includes("CAST")) return { kind: "cast", label: "Состав персонажей кадра" };
  return { kind: "explain", label: /PREDECESSOR|VISUAL_BASE|CONTINUATION|PREVIOUS_FRAME/u.test(issue.code) ? "Проверьте предыдущий кадр и выбранный успешный результат в ленте кадров. Для продолжения нужна закреплённая визуальная основа." : "Откройте «Контекст» в инспекторе и проверьте связи кадра. Если указанный asset отсутствует, выберите существующий вручную. Подробности причины доступны ниже." };
}
export function canPrepareProduction(preview: PreviewResponse | undefined): boolean { return Boolean(preview?.productionTarget && !preview.warnings.some(warning => warning.severity === "blocking")); }
