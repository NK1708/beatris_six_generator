import type { ReferenceAsset } from "@bearridge/shared";
import type { FrameContext, ResolvedReferences, ResolverWarning } from "./domain.js";
import { isCanonicalAsset } from "./lockRules.js";

const maxStyleReferences = 6;

export class ReferenceResolver {
  resolve(context: FrameContext): ResolvedReferences {
    const references: ReferenceAsset[] = [];
    const warnings: ResolverWarning[] = [];
    const selectedCharacterIds = new Set(context.frame.characterIds);
    const frameCharacters = context.characters.filter((character) => (
      selectedCharacterIds.size ? selectedCharacterIds.has(character.id) : context.storyState.characters[character.id]?.present
    ));

    for (const character of frameCharacters) {
      const state = context.storyState.characters[character.id];
      const master = currentLocked(character.references.filter((reference) => reference.type === "MASTER"));

      if (master && isCanonicalAsset(master.status)) {
        references.push({
          id: master.id,
          kind: "character",
          code: master.code,
          filePath: master.filePath,
          description: master.description,
          status: master.status,
          priority: 10,
          label: `Character: ${character.name} / MASTER V${versionFromCode(master.code)}`,
          role: `Canonical identity reference for ${character.name}.`
        });
      } else {
        warnings.push(blocking("MISSING_CHARACTER_MASTER", character.id, `У персонажа ${character.name} нет закрепленного канонического MASTER-референса.`));
      }

      const selectedAdditionalIds = context.frame.additionalCharacterReferenceIds?.[character.id] ?? [];
      const additionalReferences = selectedAdditionalIds.map((referenceId) => {
        const reference = character.references.find((candidate) => candidate.id === referenceId);
        if (!reference || reference.status !== "LOCKED" || reference.type === "MASTER") {
          throw new Error(`Invalid additional character reference selection: ${referenceId}`);
        }
        return reference;
      }).sort((left, right) => left.type.localeCompare(right.type) || left.code.localeCompare(right.code));
      additionalReferences.forEach((reference, index) => references.push({
        id: reference.id,
        kind: "character",
        code: reference.code,
        filePath: reference.filePath,
        description: reference.description,
        status: reference.status,
        priority: 11 + index,
        label: `Character: ${character.name} / ${reference.type} / ${reference.code}`,
        role: additionalCharacterRole(character.name, reference.type)
      }));

      const outfit = state?.outfitId ? character.outfits.find((candidate) => candidate.id === state.outfitId) : undefined;
      if (!outfit) {
        warnings.push(blocking("MISSING_CHARACTER_OUTFIT", character.id, `Для персонажа ${character.name} в Story State не выбран образ.`));
        continue;
      }

      const outfitMaster = currentLocked(outfit.references.filter((reference) => reference.type === "MASTER"));
      if (outfitMaster && isCanonicalAsset(outfitMaster.status)) {
        references.push({
          id: outfitMaster.id,
          kind: "outfit",
          code: outfitMaster.code,
          filePath: outfitMaster.filePath,
          description: outfitMaster.description,
          status: outfitMaster.status,
          priority: 20,
          label: `Outfit: ${character.name} / ${outfit.name} / ${outfitMaster.code}`,
          role: `Canonical outfit reference for ${character.name} / ${outfit.name}.`
        });
      } else {
        warnings.push(blocking("MISSING_OUTFIT_MASTER", outfit.id, `У образа ${outfit.name} нет закрепленного канонического MASTER-референса.`));
      }
    }

    if (context.location) {
      const canonicalLocation = currentLocked(context.location.references.filter((reference) => reference.type === "MASTER"));
      if (canonicalLocation && isCanonicalAsset(canonicalLocation.status)) {
        references.push({
          id: canonicalLocation.id,
          kind: "location",
          code: canonicalLocation.code,
          filePath: canonicalLocation.filePath,
          description: canonicalLocation.description,
          status: canonicalLocation.status,
          priority: 30,
          label: `Location: ${context.location.name} / MASTER V${versionFromCode(canonicalLocation.code)}`,
          role: `Canonical location reference for ${context.location.name}.`
        });
      } else {
        warnings.push(blocking("MISSING_LOCATION_MASTER", context.location.id, `У локации ${context.location.name} нет закрепленного канонического MASTER-референса.`));
      }

      if (context.locationAngle) {
        const angleReference = currentLocked(context.locationAngle.references);
        if (angleReference && isCanonicalAsset(angleReference.status)) {
          references.push({
            id: angleReference.id,
            kind: "location-angle",
            code: angleReference.code,
            filePath: angleReference.filePath,
            description: angleReference.description,
            status: angleReference.status,
            priority: 35,
            label: `Location Angle: ${context.location.name} / ${context.locationAngle.name} / ${angleReference.code}`,
            role: `Canonical location-angle reference for ${context.location.name} / ${context.locationAngle.name}.`
          });
        } else {
          warnings.push(blocking("MISSING_LOCATION_ANGLE_REFERENCE", context.locationAngle.id, `У ракурса ${context.locationAngle.name} нет закрепленного канонического референса.`));
        }
      }
    }

    const styleReferences = context.styleProfile ? currentLockedMany(context.styleProfile.references).slice(0, maxStyleReferences) : [];
    if (styleReferences.length && context.styleProfile) {
      styleReferences.forEach((styleReference, index) => {
        references.push({
          id: styleReference.id,
          kind: "style",
          code: styleReference.code,
          filePath: styleReference.filePath,
          description: styleReference.description,
          status: styleReference.status,
          priority: 40 + index,
          label: `Style: ${context.styleProfile?.name ?? "Default"} / ${styleReference.code}`,
          role: "Canonical visual style guidance. Use for style consistency only, not as source of scene content."
        });
      });
    } else if (context.styleProfile) {
      warnings.push(blocking("MISSING_STYLE_REFERENCE", context.styleProfile.id, `У стиля ${context.styleProfile.name} нет закрепленного канонического референса.`));
    }

    if (context.previousLockedFrame) {
      references.push({
        id: context.previousLockedFrame.id,
        kind: "previous-frame",
        code: context.previousLockedFrame.frameCode,
        filePath: context.previousLockedFrame.outputFilePath,
        status: "LOCKED",
        priority: 60,
        label: `Previous Frame: ${context.previousLockedFrame.frameCode}`,
        role: "Previous approved frame. Use only for continuity."
      });
    } else if (context.frame.previousFrameId) {
      warnings.push({
        code: "PREVIOUS_FRAME_NOT_LOCKED",
        entityId: context.frame.previousFrameId,
        message: "Предыдущий кадр существует, но не закреплен, поэтому он не использован как continuity-референс.",
        severity: "warning"
      });
    }

    return {
      references: references.sort((left, right) => left.priority - right.priority),
      warnings
    };
  }
}

function additionalCharacterRole(characterName: string, type: string): string {
  const normalized = type.toUpperCase();
  const purpose: Record<string, string> = {
    FRONT: "Use to preserve front-view facial geometry and identity.",
    THREE_QUARTER_LEFT: "Use to preserve left three-quarter facial geometry and identity.",
    THREE_QUARTER_RIGHT: "Use to preserve right three-quarter facial geometry and identity.",
    PROFILE_LEFT: "Use to preserve left-profile facial geometry and identity.",
    PROFILE_RIGHT: "Use to preserve right-profile facial geometry and identity.",
    FULL_BODY_FRONT: "Use to preserve body proportions, build, clothing silhouette, and full-body identity.",
    FULL_BODY_SIDE: "Use to preserve side-view body proportions, build, clothing silhouette, and full-body identity.",
    FULL_BODY_BACK: "Use to preserve rear-view body proportions, build, clothing silhouette, and full-body identity.",
    EXPRESSION: "Use to preserve canonical facial construction across expressions.",
    EXPRESSIONS: "Use to preserve canonical facial construction across expressions."
  };
  const fallback = `Use as canonical ${normalized.toLowerCase().replace(/_/g, " ")} visual evidence.`;
  return `Additional canonical ${normalized.toLowerCase().replace(/_/g, " ")} reference for ${characterName}. ${purpose[normalized] ?? fallback} This supplements the MASTER and must not redesign the character.`;
}

function currentLockedMany<T extends { status: string; code: string }>(references: T[]): T[] {
  return references
    .filter((reference) => reference.status === "LOCKED")
    .sort((left, right) => versionFromCode(left.code) - versionFromCode(right.code));
}

function currentLocked<T extends { status: string; code: string }>(references: T[]): T | undefined {
  return references
    .filter((reference) => reference.status === "LOCKED")
    .sort((left, right) => versionFromCode(right.code) - versionFromCode(left.code))[0];
}

function versionFromCode(code: string): number {
  const match = /_V(?<version>\d+)$/u.exec(code);
  return match?.groups?.version ? Number(match.groups.version) : 0;
}

function blocking(code: ResolverWarning["code"], entityId: string, message: string): ResolverWarning {
  return { code, entityId, message, severity: "blocking" };
}
