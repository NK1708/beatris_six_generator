import type { ContinuityEditContract } from "@bearridge/shared";
import type { FrameContext } from "./domain.js";
import { detectStructuredContinuityChanges, effectiveAllowedChanges } from "./continuityEditContract.js";
import { promptCharacterIdentity } from "./propPrompt.js";

/** Export-only effective contract; persisted Frame intent and historical snapshots stay untouched. */
export function resolveContinuationExportContract(context: FrameContext): ContinuityEditContract {
  const explicit = context.frame.continuityEditContract;
  const detected = detectStructuredContinuityChanges(
    context.continuityBaseline.status === "AVAILABLE" ? context.continuityBaseline.storyState : undefined,
    context.storyState,
    Object.fromEntries(context.characters.map(character => [character.id, promptCharacterIdentity(context, character.id)]))
  );
  return {
    changes: [...new Set([...explicit.changes, ...detected.map(change =>
      `Update ${change.label}: ${JSON.stringify(change.previousValue)} -> ${JSON.stringify(change.currentValue)}.`
    )])],
    forbidden: [...explicit.forbidden],
    allowedChanges: effectiveAllowedChanges(detected, explicit.allowedChanges)
  };
}
