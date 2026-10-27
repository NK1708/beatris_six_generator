import type { FrameCharacterCastSource } from "@bearridge/shared";

export interface EffectiveFrameCast {
  source: FrameCharacterCastSource;
  characterIds: string[];
  effectiveCharacterIds: string[];
}

export function resolveEffectiveFrameCast(input: {
  source: string | null;
  characterIds: string[];
  sceneCharacterIds: string[];
  storyStatePresentCharacterIds: string[];
}): EffectiveFrameCast {
  const source = normalizeSource(input.source);
  if (source !== "LEGACY_UNKNOWN") {
    return { source, characterIds: input.characterIds, effectiveCharacterIds: input.characterIds };
  }
  const effectiveCharacterIds = input.characterIds.length
    ? input.characterIds
    : input.sceneCharacterIds.length
      ? input.sceneCharacterIds
      : input.storyStatePresentCharacterIds;
  return { source, characterIds: input.characterIds, effectiveCharacterIds };
}

function normalizeSource(source: string | null): FrameCharacterCastSource {
  if (source === "EXPLICIT" || source === "INHERITED_PREVIOUS" || source === "INHERITED_SCENE") return source;
  return "LEGACY_UNKNOWN";
}
