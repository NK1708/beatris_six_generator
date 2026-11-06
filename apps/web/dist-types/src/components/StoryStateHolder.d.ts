import React from "react";
import type { Character } from "../model.js";
type CharacterName = Pick<Character, "id" | "name">;
export declare function holderName(id: string, characters: readonly CharacterName[]): string;
/** Presentation only: never normalize or rewrite the persisted document. */
export declare function displayStoryStateValue(value: unknown, path: readonly string[], characters: readonly CharacterName[]): string;
export declare function StoryStateHolder({ value, characters, onChange }: {
    value: string | undefined;
    characters: readonly CharacterName[];
    onChange(value: string | undefined): void;
}): React.JSX.Element;
export {};
//# sourceMappingURL=StoryStateHolder.d.ts.map