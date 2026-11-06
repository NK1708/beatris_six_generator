import React from "react";
import type { Character } from "../model.js";
import { formatTargetValue } from "../targetStateComparison.js";

type CharacterName = Pick<Character, "id" | "name">;

export function holderName(id: string, characters: readonly CharacterName[]): string {
  return characters.find(character => character.id === id)?.name ?? `Неизвестный владелец (${id})`;
}

/** Presentation only: never normalize or rewrite the persisted document. */
export function displayStoryStateValue(value: unknown, path: readonly string[], characters: readonly CharacterName[]): string {
  if (path.length === 3 && path[0] === "props" && path[2] === "holderCharacterId") {
    return typeof value === "string" && value !== "" ? holderName(value, characters) : formatTargetValue(value);
  }
  if (path[0] === "props" && path.length < 3 && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).map(([key, item]) => `${key}: ${displayStoryStateValue(item, [...path, key], characters)}`).join("; ");
  }
  return formatTargetValue(value);
}

export function StoryStateHolder({ value, characters, onChange }: {
  value: string | undefined; characters: readonly CharacterName[]; onChange(value: string | undefined): void;
}) {
  return <select value={value ?? ""} onChange={event => onChange(event.target.value === "" ? undefined : event.target.value)}>
    <option value="">Без владельца</option>
    {value && !characters.some(character => character.id === value) ? <option value={value}>{holderName(value, characters)}</option> : null}
    {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
  </select>;
}
