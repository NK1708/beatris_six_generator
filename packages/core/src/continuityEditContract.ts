import type { ContinuityCategory, StoryStateDocument } from "@bearridge/shared";

export interface DetectedContinuityChange {
  category: ContinuityCategory;
  entityId: string;
  label: string;
  previousValue: string;
  currentValue: string;
}

export function detectStructuredContinuityChanges(
  previous: StoryStateDocument | undefined,
  current: StoryStateDocument,
  characterNames: Record<string, string> = {}
): DetectedContinuityChange[] {
  if (!previous) return [];
  const changes: DetectedContinuityChange[] = [];
  const characterFields: Array<{
    key: "locationPosition" | "pose" | "emotion" | "outfitId" | "heldProps";
    category: ContinuityCategory;
    label: string;
  }> = [
    { key: "locationPosition", category: "character.position", label: "position" },
    { key: "pose", category: "character.pose", label: "pose" },
    { key: "emotion", category: "character.expression", label: "expression" },
    { key: "outfitId", category: "character.outfit", label: "outfit" },
    { key: "heldProps", category: "character.props", label: "held props" }
  ];

  for (const characterId of Object.keys(current.characters).sort()) {
    const before = previous.characters[characterId];
    const after = current.characters[characterId];
    if (!before || !after) continue;
    for (const field of characterFields) {
      const previousValue = normalizedValue(before[field.key]);
      const currentValue = normalizedValue(after[field.key]);
      if (previousValue === currentValue) continue;
      changes.push({
        category: field.category,
        entityId: characterId,
        label: `${characterNames[characterId] ?? characterId}: ${field.label}`,
        previousValue,
        currentValue
      });
    }
  }

  const environmentKeys = new Set([...Object.keys(previous.environment), ...Object.keys(current.environment)]);
  for (const key of [...environmentKeys].sort()) {
    const previousValue = normalizedValue(previous.environment[key]);
    const currentValue = normalizedValue(current.environment[key]);
    if (previousValue === currentValue) continue;
    changes.push({ category: "environment", entityId: key, label: `Environment: ${key}`, previousValue, currentValue });
  }
  return changes;
}

export function effectiveAllowedChanges(
  detected: DetectedContinuityChange[],
  explicit: ContinuityCategory[]
): ContinuityCategory[] {
  return [...new Set([...detected.map((item) => item.category), ...explicit])];
}

function normalizedValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (value === undefined || value === null || value === "") return "(not set)";
  return String(value);
}
