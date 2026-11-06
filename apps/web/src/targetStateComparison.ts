import { storyStateSchema, type FrameTargetStoryStateResponse, type StoryStateDocument } from "@bearridge/shared";
import type { Scene } from "./model.js";

export type TargetComparisonSource =
  | { status: "AVAILABLE"; document: StoryStateDocument; label: string; note: string; generationId?: string }
  | { status: "UNAVAILABLE"; label: string; note: string };

const unavailable = (note: string): TargetComparisonSource => ({ status: "UNAVAILABLE", label: "Исходное состояние недоступно", note });

// Display existing lineage only. This never initializes or inherits a Target.
export function resolveTargetComparisonSource(target: FrameTargetStoryStateResponse | undefined, scene: Scene | undefined): TargetComparisonSource {
  if (target?.status !== "AVAILABLE" || !scene || !scene.frames.some(frame => frame.id === target.frameId)) return unavailable("Не удалось проверить происхождение состояния в выбранной сцене.");
  if (target.originType === "SCENE_INITIAL") {
    const parsed = storyStateSchema.safeParse(scene.storyState?.document);
    if (!parsed.success || parsed.data.sceneId !== scene.id) return unavailable("Состояние сцены отсутствует или не прошло проверку.");
    return { status: "AVAILABLE", document: parsed.data, label: "Текущее состояние сцены", note: "Сравнение с текущим Scene Story State. Его снимок на момент создания кадра не хранится; это не исторически подтверждённый исходный снимок." };
  }
  if (target.originType === "INHERITED_LOCKED_GENERATION" || target.originType === "LEGACY_GENERATION_INPUT") {
    const frame = scene.frames.find(item => item.id === target.sourceFrameId);
    const generation = frame?.generations.find(item => item.id === target.sourceGenerationId);
    if (!generation || generation.status !== "SUCCESS") return unavailable("Указанная в происхождении успешная Generation недоступна. Другой результат или Target предыдущего кадра не подставляется.");
    let raw: unknown;
    try { raw = JSON.parse(generation.storyStateSnapshot ?? "null") as unknown; } catch { return unavailable("Исторический снимок Generation повреждён."); }
    const parsed = storyStateSchema.safeParse(raw);
    if (!parsed.success || parsed.data.sceneId !== scene.id) return unavailable("Исторический снимок отсутствует, не прошёл проверку или относится к другой сцене.");
    return { status: "AVAILABLE", document: parsed.data, generationId: generation.id, label: "Снимок Generation · " + frame!.frameCode, note: "Точный исторический вход Generation из происхождения Target. Он не является автоматическим доказательством визуального соответствия изображения." };
  }
  if (target.originType === "INHERITED_FRAME_TARGET" || target.originType === "INHERITED_UNCONFIRMED_FRAME_TARGET") return unavailable("Target унаследован от состояния другого кадра, но исходная revision не сохранена. Текущий Target того кадра нельзя выдать за историческое исходное состояние.");
  return unavailable("Для этого происхождения отдельное исходное состояние не сохранено. Текущий Target не используется как собственный исторический источник.");
}

export type TargetDiffStatus = "unchanged" | "changed" | "added" | "removed" | "unavailable";
export interface TargetPropertyDiff { path: string[]; before: unknown; after: unknown; status: TargetDiffStatus }

export function compareTargetProperty(source: TargetComparisonSource, target: StoryStateDocument, path: string[]): TargetPropertyDiff {
  const read = (document: StoryStateDocument): unknown => path.reduce<unknown>((value, key) => typeof value === "object" && value !== null && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, document);
  const before = source.status === "AVAILABLE" ? read(source.document) : undefined;
  const after = read(target);
  return { path, before, after, status: source.status !== "AVAILABLE" ? "unavailable" : before === undefined && after === undefined ? "unchanged" : before === undefined ? "added" : after === undefined ? "removed" : JSON.stringify(before) === JSON.stringify(after) ? "unchanged" : "changed" };
}

export function targetStateDiff(source: TargetComparisonSource, target: StoryStateDocument): TargetPropertyDiff[] {
  // Schema defaults normalize absent containers; optional undefined stays absent.
  const parsed = storyStateSchema.safeParse(target);
  if (!parsed.success) return [];
  const paths = new Map<string, string[]>();
  const collect = (document: StoryStateDocument) => {
    paths.set(JSON.stringify(["time", "description"]), ["time", "description"]);
    for (const section of ["environment", "characters", "props"] as const) for (const [id, value] of Object.entries(document[section])) {
      if (section === "environment") { const path = [section, id]; paths.set(JSON.stringify(path), path); }
      else {
        const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
        if (!entries.length) { const path = [section, id]; paths.set(JSON.stringify(path), path); }
        for (const [key] of entries) { const path = [section, id, key]; paths.set(JSON.stringify(path), path); }
      }
    }
    paths.set('["storyFacts"]', ["storyFacts"]);
  };
  if (source.status === "AVAILABLE") collect(source.document);
  collect(parsed.data);
  return [...paths.values()].map(path => compareTargetProperty(source, parsed.data, path));
}

export function formatTargetValue(value: unknown): string {
  if (value === undefined) return "Отсутствует";
  if (value === null) return "Не задано (null)";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.length ? value.join("; ") : "Пустой список";
  if (value === "") return "Пустая строка";
  if (typeof value === "object") return Object.keys(value).length ? "Структурированная запись" : "Запись без свойств";
  return String(value);
}
