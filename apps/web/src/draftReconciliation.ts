import type { FrameDraft } from "./model.js";

export function equalDrafts(a: unknown, b: unknown): boolean {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
    return value;
  };
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}

// Rebase only fields acknowledged by this save. Input entered after submission
// stays local; Cast fields form one selection and must move together.
export function reconcileFrameDraft(submitted: FrameDraft, current: FrameDraft, saved: FrameDraft): FrameDraft {
  const next = { ...saved };
  for (const key of Object.keys(current) as (keyof FrameDraft)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(submitted[key])) Object.assign(next, { [key]: current[key] });
  }
  const castKeys = ["characterCastMode", "characterIds", "additionalCharacterReferenceIds"] as const;
  if (castKeys.some(key => JSON.stringify(current[key]) !== JSON.stringify(submitted[key]))) {
    for (const key of castKeys) Object.assign(next, { [key]: current[key] });
  }
  return next;
}
