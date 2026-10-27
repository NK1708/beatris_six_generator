import type { GenerationGeometryResult, ReferenceAsset } from "@bearridge/shared";
import type { FrameContext } from "./domain.js";
import { buildCompositionSafeAreaInstruction } from "./generationGeometryResolver.js";

export class PromptBuilder {
  build(context: FrameContext, references: ReferenceAsset[], geometry?: GenerationGeometryResult): string {
    const selectedIds = new Set(context.frame.effectiveCharacterIds ?? context.frame.characterIds);
    const presentCharacters = context.characters.filter((character) => selectedIds.has(character.id));
    const characterState = presentCharacters.flatMap((character) => {
      const state = context.storyState.characters[character.id];
      const outfit = character.outfits.find((candidate) => candidate.id === state?.outfitId);
      return [
        `${character.name}:`,
        outfit ? `Outfit: ${outfit.name}` : "Outfit: unspecified",
        outfit?.description ? `Outfit description: ${outfit.description}` : "",
        outfit?.immutableFeatures ? `Outfit immutable features: ${outfit.immutableFeatures}` : "",
        state?.hairState ? `Hair: ${state.hairState}` : "",
        state?.emotion ? `Emotion: ${state.emotion}` : "",
        state?.pose ? `Pose: ${state.pose}` : "",
        state?.locationPosition ? `Position: ${state.locationPosition}` : "",
        state?.heldProps?.length ? `Holding: ${state.heldProps.join(", ")}` : "",
        state?.notes?.length ? `Notes: ${state.notes.join("; ")}` : ""
      ].filter(Boolean);
    });

    const environmentEntries = Object.entries(context.storyState.environment)
      .map(([key, value]) => `${key}: ${String(value)}`);
    const preserve = [
      "facial identity",
      "facial proportions",
      "apparent age",
      "hairstyle",
      "body proportions",
      "outfit design",
      "room architecture",
      "furniture",
      "visual style"
    ];
    const negativeRules = [
      "add accessories",
      "change clothing",
      "change hair",
      "redesign furniture",
      "alter permanent architecture",
      "invent new props",
      context.styleProfile?.negativeRules ?? ""
    ].filter(Boolean);

    return [
      "PROJECT:",
      context.project.name,
      "",
      "FRAME:",
      context.frame.frameCode,
      "",
      "TYPE:",
      context.frame.type,
      "",
      "CANONICAL ASSETS:",
      presentCharacters.map((character) => [
        `Character: ${character.name}`,
        character.description ? `Description: ${character.description}` : "",
        character.bodyDescription ? `Body: ${character.bodyDescription}` : "",
        character.faceDescription ? `Face: ${character.faceDescription}` : "",
        character.hairDescription ? `Hair canon: ${character.hairDescription}` : "",
        character.immutableFeatures ? `Immutable character features: ${character.immutableFeatures}` : ""
      ].filter(Boolean).join("\n")).join("\n\n") || "No character canon selected.",
      context.location ? [
        `Location: ${context.location.name}`,
        context.location.description ? `Description: ${context.location.description}` : "",
        context.location.architectureDescription ? `Architecture: ${context.location.architectureDescription}` : "",
        context.location.immutableFeatures ? `Immutable location features: ${context.location.immutableFeatures}` : ""
      ].filter(Boolean).join("\n") : "Location: Unspecified",
      context.styleProfile ? [
        `Style: ${context.styleProfile.name}`,
        context.styleProfile.description ? `Description: ${context.styleProfile.description}` : "",
        context.styleProfile.lighting ? `Lighting: ${context.styleProfile.lighting}` : "",
        context.styleProfile.colorPalette ? `Palette: ${context.styleProfile.colorPalette}` : "",
        context.styleProfile.linework ? `Line: ${context.styleProfile.linework}` : "",
        context.styleProfile.anatomy ? `Anatomy: ${context.styleProfile.anatomy}` : "",
        context.styleProfile.faces ? `Faces: ${context.styleProfile.faces}` : "",
        context.styleProfile.shading ? `Shading: ${context.styleProfile.shading}` : "",
        context.styleProfile.backgroundDetail ? `Backgrounds: ${context.styleProfile.backgroundDetail}` : "",
        context.styleProfile.cameraLanguage ? `Camera: ${context.styleProfile.cameraLanguage}` : "",
        context.styleProfile.negativeRules ? `Negative rules: ${context.styleProfile.negativeRules}` : ""
      ].filter(Boolean).join("\n") : "Style: Default",
      "",
      "SCENE NARRATIVE CONTEXT:",
      context.scene.name,
      context.scene.description || "No scene narrative description.",
      context.scene.timeDescription ? `Scene time: ${context.scene.timeDescription}` : "",
      context.scene.characterIds.length ? `Scene characters: ${context.characters.filter((character) => context.scene.characterIds.includes(character.id)).map((character) => character.name).join(", ")}` : "",
      "",
      "CHARACTERS:",
      presentCharacters.map((character) => character.name).join(", ") || "None",
      "",
      "CURRENT STORY STATE:",
      characterState.join("\n") || "No characters present.",
      `Time: ${context.storyState.time.description || context.scene.timeDescription || "unspecified"}`,
      environmentEntries.join("\n") || "No environment state specified.",
      "",
      "FRAME INSTRUCTIONS:",
      "CAMERA:",
      context.frame.camera || "Use the established visual novel camera language.",
      context.styleProfile?.cameraLanguage ?? "",
      context.locationAngle ? `Location angle: ${context.locationAngle.name}` : "",
      context.locationAngle?.cameraPositionDescription ? `Camera: ${context.locationAngle.cameraPositionDescription}` : "",
      "",
      "COMPOSITION:",
      context.frame.composition || context.frame.description,
      geometry ? buildCompositionSafeAreaInstruction(geometry) : "",
      "",
      "ACTION:",
      context.frame.action,
      "",
      "EXPRESSION:",
      context.frame.expressionNotes,
      "",
      "LIGHTING:",
      context.frame.lighting || context.styleProfile?.lighting || "Follow scene lighting continuity.",
      "",
      "CONTINUITY:",
      context.frame.continuityNotes || "Direct continuation of local Story State.",
      context.storyState.storyFacts.length ? context.storyState.storyFacts.map((fact) => `- ${fact}`).join("\n") : "",
      "",
      "REFERENCE IDS:",
      references.map((reference) => `- ${reference.code}`).join("\n") || "No references resolved.",
      "",
      "REFERENCE ROLES:",
      references.map((reference, index) => [
        `Reference ${index + 1}:`,
        reference.role ?? roleFor(reference)
      ].join("\n")).join("\n\n") || "No reference roles resolved.",
      "",
      "CANONICAL IDENTITY:",
      "Character references define exact identity. Do not redesign the character.",
      references.some((reference) => reference.kind === "character" && reference.priority > 10)
        ? "Additional character references supplement the MASTER with view/body-specific canonical evidence. They do not replace MASTER and must not redesign the character."
        : "",
      "",
      "PRESERVE:",
      preserve.map((item) => `- ${item}`).join("\n"),
      "",
      "DO NOT:",
      negativeRules.map((item) => `- ${item}`).join("\n")
    ].filter((line) => line !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  buildRepairPrompt(problem: string): string {
    return [
      `Change ONLY: ${problem}`,
      "",
      "Preserve the entire existing image.",
      "",
      "Do not change:",
      "- face",
      "- pose",
      "- hair",
      "- clothing",
      "- hands except where required",
      "- camera",
      "- lighting",
      "- composition",
      "- background"
    ].join("\n");
  }

  buildContinuationInstructions(context: FrameContext): string {
    const frame = context.frame;
    const currentCast = frame.effectiveCharacterIds ?? frame.characterIds;
    const removesAllPreviousCharacters = currentCast.length === 0 && Boolean(context.previousFrameCharacterIds?.length);
    return [
      "EDIT THE PROVIDED PREVIOUS FRAME.",
      "The previous frame is the authoritative visual base.",
      "Preserve everything from the base image unless explicitly changed by the current Frame.",
      "Preserve camera position and framing unless changed below; room architecture; furniture geometry and placement; unchanged props; lighting unless changed below; visual style; and unchanged character identity, outfit, and state.",
      "Canonical references are supporting constraints. Preserve identity, canon, and style without redesigning unrelated content from the base image.",
      "Do not invent props, furniture, architecture, characters, or decorations unless explicitly requested.",
      "Apply only the following current Frame and Story State changes:",
      removesAllPreviousCharacters ? "Current frame contains no visible characters." : "",
      removesAllPreviousCharacters ? "Do not carry over characters from the previous frame." : "",
      frame.description ? `Description: ${frame.description}` : "",
      frame.action ? `Action: ${frame.action}` : "",
      frame.camera ? `Camera change: ${frame.camera}` : "",
      frame.composition ? `Composition change: ${frame.composition}` : "",
      frame.lighting ? `Lighting change: ${frame.lighting}` : "",
      frame.expressionNotes ? `Expression / pose change: ${frame.expressionNotes}` : "",
      frame.continuityNotes ? `Continuity notes: ${frame.continuityNotes}` : "",
      `Current Story State: ${JSON.stringify(context.storyState)}`
    ].filter(Boolean).join("\n");
  }
}

function roleFor(reference: ReferenceAsset): string {
  if (reference.kind === "character") return "Canonical identity reference.";
  if (reference.kind === "outfit") return "Canonical outfit reference.";
  if (reference.kind === "location-angle") return "Canonical location-angle reference.";
  if (reference.kind === "location") return "Canonical location reference.";
  if (reference.kind === "style") return "Canonical visual style reference.";
  if (reference.kind === "previous-frame") return "Previous approved frame. Use only for continuity.";
  return "Canonical prop reference.";
}
