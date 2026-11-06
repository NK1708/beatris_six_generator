# Prop data in generation prompts

Story State keeps independent declarations:

- `props[key]` identifies a prop record by its existing string key. It is not necessarily a Prisma Prop ID or the same string used in `heldProps`.
- `holderCharacterId` declares a character association. It does not by itself describe holding, proximity, legal ownership or a transfer action.
- `location` and `state` are optional free text. Missing fields remain unspecified.
- `characters[id].heldProps` records held items independently. No automatic synchronization with holder, presence, Scene Roster or Frame Cast occurs. An explicit empty list is displayed as recorded data, not translated into an invented empty-hands instruction.

The core prop formatter renders only declared fields. Character labels always retain the exact ID alongside the currently available name. Unknown IDs stay unknown; matching by name or guessing another character is forbidden. Duplicate names remain distinguishable by ID. The identity map can bind characters to reference codes only from the already resolved/supplied reference list; it never selects additional assets. Identity metadata does not add visible characters to the Frame Cast.

`PromptBuilder.build()` uses `context.storyState`: persisted Target for production, existing Scene state for draft. The production preparation and snapshot contracts are unchanged. The formatter does not read live Scene state as a replacement for Target or overwrite snapshots.

Continuation already contains the complete current Story State JSON. Its supplemental text supplies identity interpretation and explicit record deltas, not another complete props serialization. Deltas compare only `continuityBaseline.storyState` when the baseline is AVAILABLE, meaning the selected successful Generation of the LOCKED predecessor. They do not use the mutable predecessor Target. Removing a record is not interpreted as physical disappearance; changing a holder is not interpreted as a physical handover. Actions remain explicit Frame creative intent.

The portable ChatGPT continuation prompt is a separate rendering path. It receives the same declared prop context because it does not otherwise include the full Target prompt/JSON. This context does not override its CHANGE ONLY contract, reference policy or style constraints. Manifest/package versions and receipt/import formats are unchanged. Localized historical Repair keeps its existing source-based contract; current Target data is not injected into an old Generation's repair snapshot.

The existing structured `ContinuityCategory` detector/API is unchanged. Prop record deltas here are prompt interpretation text, not new API categories or automatically allowed edits. Historical snapshots and stored prompts remain immutable; the new formatter applies to newly built prompts only.

Prompt coverage proves transmission of declared data, not visual compliance of generated images. Legal ownership, individual hands, shared contact and handover phases are not formalized by these fields.
