import type { ReferenceAsset, StoryStateDocument } from "@bearridge/shared";
import type { FrameContext } from "./domain.js";

/** Resolve by exact ID only. Names supplement identity; they never replace it. */
export function promptCharacterIdentity(context: FrameContext, id: string): string {
  const character = context.characters.find(candidate => candidate.id === id);
  return `${character ? JSON.stringify(character.name) : "Unknown character"} [Character ID: ${JSON.stringify(id)}]`;
}

const semantics = "Holder association records only the declared character link; it does not imply holding, proximity or legal ownership. heldProps records holding independently. Missing fields are unspecified. These are declared data, not visual verification.";

export function buildCharacterIdentityMap(context: FrameContext, references: readonly Pick<ReferenceAsset, "id" | "code">[] = []): string {
  const cast = new Set(context.frame.effectiveCharacterIds ?? context.frame.characterIds);
  const ids = new Set([...cast, ...context.scene.characterIds, ...Object.keys(context.storyState.characters)]);
  const collect = (state: StoryStateDocument) => {
    for (const prop of Object.values(state.props)) if (prop.holderCharacterId !== undefined) ids.add(prop.holderCharacterId);
    for (const id of Object.keys(state.characters)) ids.add(id);
  };
  collect(context.storyState);
  if (context.continuityBaseline.status === "AVAILABLE") collect(context.continuityBaseline.storyState);
  return ["CHARACTER IDENTITY MAP:",
    "Labels for interpreting IDs only. This map does not add visible characters; only Frame Cast defines the visible cast.",
    ...[...ids].sort().map(id => {
      const character = context.characters.find(candidate => candidate.id === id);
      const codes = references.filter(reference => character?.references?.some(candidate => candidate.id === reference.id)
        || character?.outfits.some(outfit => outfit.references?.some(candidate => candidate.id === reference.id))).map(reference => reference.code);
      return `- ${promptCharacterIdentity(context, id)}; Frame Cast: ${cast.has(id) ? "yes" : "no"}${codes.length ? `; Supplied reference codes: ${JSON.stringify(codes)}` : ""}`;
    })
  ].join("\n");
}

export function buildPropState(context: FrameContext): string {
  const entries = Object.entries(context.storyState.props);
  const held = Object.entries(context.storyState.characters).filter(([, state]) => state.heldProps !== undefined);
  if (!entries.length && !held.length) return "";
  return ["DECLARED PROP STATE:", semantics,
    ...entries.flatMap(([id, prop]) => [
      `Prop key: ${JSON.stringify(id)}`,
      ...(prop.holderCharacterId !== undefined ? [`Holder association: ${promptCharacterIdentity(context, prop.holderCharacterId)}`] : []),
      ...(prop.location !== undefined ? [`Recorded location: ${JSON.stringify(prop.location)}`] : []),
      ...(prop.state !== undefined ? [`Recorded state: ${JSON.stringify(prop.state)}`] : [])
    ]),
    ...held.map(([id, state]) => `Recorded heldProps for ${promptCharacterIdentity(context, id)}: ${JSON.stringify(state.heldProps)}`)
  ].join("\n");
}

/** Textual record deltas only; never infer a transfer, release or disappearance. */
export function buildPropRecordChanges(context: FrameContext): string {
  if (context.continuityBaseline.status !== "AVAILABLE") return "";
  const previous = context.continuityBaseline.storyState;
  const current = context.storyState;
  const lines: string[] = [];
  const show = (value: string | undefined, holder = false) => value === undefined ? "not recorded" : holder ? promptCharacterIdentity(context, value) : JSON.stringify(value);
  for (const id of [...new Set([...Object.keys(previous.props), ...Object.keys(current.props)])].sort()) {
    const before = previous.props[id], after = current.props[id];
    if (before && !after) { lines.push(`Prop key ${JSON.stringify(id)}: record removed from current Story State; physical disappearance is not implied.`); continue; }
    if (!before && after) lines.push(`Prop key ${JSON.stringify(id)}: record added to current Story State; physical appearance is not implied.`);
    for (const field of ["holderCharacterId", "location", "state"] as const) {
      if (before?.[field] !== after?.[field]) lines.push(`Prop key ${JSON.stringify(id)} / ${field}: ${show(before?.[field], field === "holderCharacterId")} -> ${show(after?.[field], field === "holderCharacterId")}`);
    }
  }
  for (const id of [...new Set([...Object.keys(previous.characters), ...Object.keys(current.characters)])].sort()) {
    const before = previous.characters[id]?.heldProps, after = current.characters[id]?.heldProps;
    const normalized = (value: string[] | undefined) => value === undefined ? undefined : JSON.stringify([...value].sort());
    if (normalized(before) !== normalized(after)) lines.push(`Recorded heldProps for ${promptCharacterIdentity(context, id)}: ${before === undefined ? "not recorded" : JSON.stringify(before)} -> ${after === undefined ? "not recorded" : JSON.stringify(after)}`);
  }
  return lines.length ? ["PROP RECORD CHANGES FROM SELECTED LOCKED GENERATION:", "Record changes only; do not infer physical actions from associations or omitted data.", ...lines].join("\n") : "";
}

/** Portable continuation does not otherwise include the full Target prompt/JSON. */
export function buildPortablePropContext(context: FrameContext, references: readonly Pick<ReferenceAsset, "id" | "code">[] = []): string {
  return [buildCharacterIdentityMap(context, references), buildPropState(context), buildPropRecordChanges(context)].filter(Boolean).join("\n\n");
}

export function buildPropContinuationContext(context: FrameContext): string {
  // Current values already occur in Current Story State JSON; add interpretation and deltas only.
  return [buildCharacterIdentityMap(context), semantics, buildPropRecordChanges(context)].filter(Boolean).join("\n\n");
}
