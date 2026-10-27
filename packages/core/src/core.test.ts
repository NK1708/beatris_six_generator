import { describe, expect, it } from "vitest";
import { frameCode, generationFileName, lockedFrameFileName, referenceVersionCode } from "./fileNaming.js";
import { initialConsistencyBenchmarkFrames } from "./benchmarkPlan.js";
import { GenerationGeometryResolver } from "./generationGeometryResolver.js";
import { canonicalMutationWarning, isCanonicalAsset } from "./lockRules.js";
import { PromptBuilder } from "./promptBuilder.js";
import { ReferenceResolver } from "./referenceResolver.js";
import { createEmptyStoryState, parseStoryState } from "./storyState.js";
import { detectStructuredContinuityChanges, effectiveAllowedChanges } from "./continuityEditContract.js";
import type { FrameContext } from "./domain.js";
import { resolveEffectiveFrameCast } from "./frameCast.js";

describe("effective Frame cast", () => {
  it("preserves explicit and inherited empty casts", () => {
    for (const source of ["EXPLICIT", "INHERITED_SCENE"] as const) {
      expect(resolveEffectiveFrameCast({ source, characterIds: [], sceneCharacterIds: ["scene"], storyStatePresentCharacterIds: ["story"] }).effectiveCharacterIds).toEqual([]);
    }
  });

  it("centralizes legacy frame, scene and Story State fallback", () => {
    expect(resolveEffectiveFrameCast({ source: null, characterIds: [], sceneCharacterIds: ["scene"], storyStatePresentCharacterIds: ["story"] }).effectiveCharacterIds).toEqual(["scene"]);
    expect(resolveEffectiveFrameCast({ source: null, characterIds: [], sceneCharacterIds: [], storyStatePresentCharacterIds: ["story"] }).effectiveCharacterIds).toEqual(["story"]);
  });

  it("emits a structured removal instruction when continuation cast becomes empty", () => {
    const empty = { ...context, frame: { ...context.frame, characterIds: [], effectiveCharacterIds: [] }, previousFrameCharacterIds: ["character-1"] };
    expect(new PromptBuilder().buildContinuationInstructions(empty)).toContain("Current frame contains no visible characters.\nDo not carry over characters from the previous frame.");
  });
});

const context: FrameContext = {
  project: {
    id: "project-1",
    name: "After Dark",
    defaultAspectRatio: "16:9",
    defaultResolution: "1536x864",
    defaultDraftModel: "draft-model",
    defaultProductionModel: "prod-model"
  },
  scene: {
    id: "scene-1",
    sequence: 14,
    name: "Bedroom message",
    description: "Anna receives a message that changes the tone of the night.",
    locationId: "location-1",
    styleProfileId: "style-1",
    characterIds: ["character-1"],
    timeDescription: "02:17"
  },
  frame: {
    id: "frame-1",
    sceneId: "scene-1",
    sequence: 27,
    frameCode: "S014_F027",
    type: "CG",
    status: "DRAFT",
    generationStrategy: "NEW_COMPOSITION",
    continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
    description: "",
    action: "Anna sits on the bed and reads a message on her phone",
    camera: "medium close-up",
    composition: "Anna sits on the edge of the bed.",
    lighting: "Warm bedside lamp from camera-right.",
    expressionNotes: "Anxious, subtle tension, not crying.",
    continuityNotes: "Direct continuation of previous approved frame.",
    previousFrameId: "frame-0",
    selectedGenerationId: null,
    characterIds: [],
    effectiveCharacterIds: ["character-1"],
    locationId: "location-1",
    locationAngleId: null,
    styleProfileId: "style-1",
    targetWidth: null,
    targetHeight: null,
    targetAspectRatio: null
  },
  sceneCurrentStoryState: createEmptyStoryState("scene-1"),
  frameTargetStoryState: { status: "MISSING", frameId: "frame-1", legacy: true },
  continuityBaseline: {
    status: "UNAVAILABLE",
    reason: "NOT_LOCKED",
    diagnostic: { kind: "MISSING", severity: "blocking", code: "NOT_LOCKED", message: "Test fixture has no locked predecessor." }
  },
  storyState: {
    sceneId: "scene-1",
    time: { description: "02:17" },
    environment: {
      mainLight: "off",
      curtains: "closed",
      window: "closed",
      door: "closed"
    },
    characters: {
      "character-1": {
        present: true,
        outfitId: "outfit-1",
        emotion: "anxious",
        hairState: "loose",
        locationPosition: "bed",
        heldProps: ["phone"]
      }
    },
    props: {},
    storyFacts: ["Anna has just received an important message."]
  },
  characters: [
    {
      id: "character-1",
      name: "Anna",
      description: "",
      bodyDescription: "",
      faceDescription: "",
      hairDescription: "long loose hair",
      immutableFeatures: "same face and age",
      masterReferenceId: "char-ref-1",
      status: "LOCKED",
      references: [
        {
          id: "char-ref-1",
          code: "CHAR_ANNA_MASTER_V1",
          type: "MASTER",
          filePath: "characters/anna/master.png",
          description: "Anna master",
          status: "LOCKED",
          isCanonical: true
        },
        {
          id: "char-ref-draft",
          code: "CHAR_ANNA_DRAFT",
          type: "OTHER",
          filePath: "characters/anna/draft.png",
          description: "",
          status: "DRAFT",
          isCanonical: false
        },
        {
          id: "char-ref-full-body",
          code: "CHAR_ANNA_FULL_BODY_FRONT_V1",
          type: "FULL_BODY_FRONT",
          filePath: "characters/anna/full-body-front.png",
          description: "Anna full body",
          status: "LOCKED",
          isCanonical: true
        },
        {
          id: "char-ref-profile",
          code: "CHAR_ANNA_PROFILE_LEFT_V1",
          type: "PROFILE_LEFT",
          filePath: "characters/anna/profile-left.png",
          description: "Anna profile",
          status: "LOCKED",
          isCanonical: true
        }
      ],
      outfits: [
        {
          id: "outfit-1",
          name: "Home 03",
          description: "oversized pale blue sleep shirt and dark leggings",
          immutableFeatures: "pale blue shirt, dark leggings, no jewelry",
          masterReferenceId: "outfit-ref-1",
          status: "LOCKED",
          references: [
            {
              id: "outfit-ref-1",
              code: "OUTFIT_ANNA_HOME_03",
              type: "MASTER",
              filePath: "characters/anna/outfits/home-03.png",
              description: "",
              status: "LOCKED",
              isCanonical: true
            }
          ]
        }
      ]
    }
  ],
  location: {
    id: "location-1",
    name: "Anna Bedroom",
    description: "",
    architectureDescription: "small bedroom with bed and bedside lamp",
    immutableFeatures: "bed against left wall",
    masterReferenceId: "loc-ref-1",
    status: "LOCKED",
    references: [
      {
        id: "loc-ref-1",
        code: "LOC_BEDROOM_B",
        type: "MASTER",
        filePath: "locations/bedroom/master.png",
        description: "",
        status: "LOCKED",
        isCanonical: true
      }
    ],
    angles: []
  },
  locationAngle: null,
  styleProfile: {
    id: "style-1",
    name: "Interior Night",
    description: "cinematic VN illustration",
    linework: "clean",
    anatomy: "natural VN proportions",
    faces: "expressive but consistent faces",
    shading: "soft cel shading",
    colorPalette: "warm amber and cool blue",
    backgroundDetail: "detailed lived-in interiors",
    lighting: "warm bedside lamp",
    cameraLanguage: "50mm equivalent",
    negativeRules: "do not switch to photorealism",
    status: "LOCKED",
    references: [
      {
        id: "style-ref-1",
        code: "STYLE_NIGHT_01",
        filePath: "style/night.png",
        description: "",
        status: "LOCKED",
        isCanonical: true
      },
      {
        id: "style-ref-2",
        code: "STYLE_NIGHT_02",
        filePath: "style/night-faces.png",
        description: "",
        status: "LOCKED",
        isCanonical: true
      }
    ]
  },
  previousLockedFrame: {
    id: "frame-0",
    frameCode: "S014_F026",
    generationId: "generation-0",
    outputFilePath: "frames/locked/S014_F026.png"
  }
};

describe("ReferenceResolver", () => {
  it("resolves only minimal locked canonical references in priority order", () => {
    const result = new ReferenceResolver().resolve(context);

    expect(result.references.map((reference) => reference.code)).toEqual([
      "CHAR_ANNA_MASTER_V1",
      "OUTFIT_ANNA_HOME_03",
      "LOC_BEDROOM_B",
      "STYLE_NIGHT_01",
      "STYLE_NIGHT_02",
      "S014_F026"
    ]);
    expect(result.references).toContainEqual(expect.objectContaining({
      kind: "outfit",
      code: "OUTFIT_ANNA_HOME_03",
      status: "LOCKED"
    }));
    expect(result.references.every((reference) => reference.status === "LOCKED")).toBe(true);
  });

  it("selects the current locked version instead of deprecated or draft versions", () => {
    const versioned: FrameContext = {
      ...context,
      characters: [{
        ...context.characters[0]!,
        masterReferenceId: null,
        references: [
          { id: "v1", code: "CHAR_ANNA_MASTER_V1", type: "MASTER", filePath: "v1.png", description: "", status: "DEPRECATED", isCanonical: false },
          { id: "v2", code: "CHAR_ANNA_MASTER_V2", type: "MASTER", filePath: "v2.png", description: "", status: "LOCKED", isCanonical: true },
          { id: "v3", code: "CHAR_ANNA_MASTER_V3", type: "MASTER", filePath: "v3.png", description: "", status: "DRAFT", isCanonical: false }
        ]
      }]
    };

    const result = new ReferenceResolver().resolve(versioned);

    expect(result.references.find((reference) => reference.kind === "character")?.code).toBe("CHAR_ANNA_MASTER_V2");
  });

  it("adds only explicitly selected additional character references after MASTER in deterministic order", () => {
    const selected: FrameContext = {
      ...context,
      frame: {
        ...context.frame,
        additionalCharacterReferenceIds: {
          "character-1": ["char-ref-profile", "char-ref-full-body"]
        }
      }
    };

    const result = new ReferenceResolver().resolve(selected);
    const characterReferences = result.references.filter((reference) => reference.kind === "character");

    expect(characterReferences.map((reference) => reference.code)).toEqual([
      "CHAR_ANNA_MASTER_V1",
      "CHAR_ANNA_FULL_BODY_FRONT_V1",
      "CHAR_ANNA_PROFILE_LEFT_V1"
    ]);
    expect(characterReferences[1]?.role).toContain("supplements the MASTER");
    expect(characterReferences[1]?.role).toContain("body proportions");
    expect(characterReferences[2]?.role).toContain("left-profile facial geometry");
  });

  it("warns when previous frame is not locked", () => {
    const result = new ReferenceResolver().resolve({ ...context, previousLockedFrame: undefined });

    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "PREVIOUS_FRAME_NOT_LOCKED",
      entityId: "frame-0",
      severity: "warning"
    }));
  });

  it("uses both location master and locked location angle view when a frame selects an angle", () => {
    const result = new ReferenceResolver().resolve({
      ...context,
      frame: { ...context.frame, locationAngleId: "angle-1" },
      locationAngle: {
        id: "angle-1",
        slug: "doorway-view",
        name: "Doorway view",
        description: "View from the doorway toward the bed.",
        cameraPositionDescription: "camera at bedroom door",
        referenceId: "angle-ref-1",
        status: "LOCKED",
        references: [
          {
            id: "angle-ref-1",
            code: "LOC_BEDROOM_DOOR_VIEW_V1",
            type: "VIEW",
            filePath: "locations/bedroom/angles/door.png",
            description: "",
            status: "LOCKED",
            isCanonical: true
          }
        ]
      }
    });

    expect(result.references.map((reference) => reference.code)).toContain("LOC_BEDROOM_DOOR_VIEW_V1");
    expect(result.references.map((reference) => reference.code)).toContain("LOC_BEDROOM_B");
    expect(result.references.map((reference) => reference.kind)).toEqual([
      "character",
      "outfit",
      "location",
      "location-angle",
      "style",
      "style",
      "previous-frame"
    ]);
    expect(result.references.find((reference) => reference.kind === "location-angle")?.role).toContain("Doorway view");
  });

  it("blocks production context when a selected location angle has no locked reference", () => {
    const result = new ReferenceResolver().resolve({
      ...context,
      frame: { ...context.frame, locationAngleId: "angle-1" },
      locationAngle: {
        id: "angle-1",
        slug: "doorway-view",
        name: "Doorway view",
        description: "",
        cameraPositionDescription: "",
        referenceId: null,
        status: "DRAFT",
        references: []
      }
    });

    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "MISSING_LOCATION_ANGLE_REFERENCE",
      entityId: "angle-1",
      severity: "blocking"
    }));
  });

  it("uses authoritative effective Frame cast instead of Story State presence", () => {
    const result = new ReferenceResolver().resolve({
      ...context,
      frame: { ...context.frame, characterIds: ["character-2"], effectiveCharacterIds: ["character-2"] },
      characters: [
        ...context.characters,
        {
          id: "character-2",
          name: "Mira",
          description: "",
          bodyDescription: "",
          faceDescription: "",
          hairDescription: "",
          immutableFeatures: "",
          masterReferenceId: "mira-ref-1",
          status: "LOCKED",
          references: [
            {
              id: "mira-ref-1",
              code: "CHAR_MIRA_MASTER_V1",
              type: "MASTER",
              filePath: "characters/mira/master.png",
              description: "",
              status: "LOCKED",
              isCanonical: true
            }
          ],
          outfits: []
        }
      ],
      storyState: {
        ...context.storyState,
        characters: {
          ...context.storyState.characters,
          "character-2": { present: false }
        }
      }
    });

    expect(result.references.map((reference) => reference.code)).toContain("CHAR_MIRA_MASTER_V1");
    expect(result.references.map((reference) => reference.code)).not.toContain("CHAR_ANNA_MASTER_V1");
  });
});

describe("continuity structured diff", () => {
  it("detects only supported Story State fields and merges explicit categories", () => {
    const previous = createEmptyStoryState("scene-1");
    previous.characters.hero = { present: true, locationPosition: "sofa", pose: "seated", emotion: "calm", heldProps: ["book"], notes: ["old arbitrary text"] };
    previous.environment.door = "closed";
    const current = createEmptyStoryState("scene-1");
    current.characters.hero = { present: true, locationPosition: "coffee maker", pose: "standing", emotion: "alert", heldProps: [], notes: ["new arbitrary text"] };
    current.environment.door = "open";

    const detected = detectStructuredContinuityChanges(previous, current, { hero: "Birdman" });

    expect(detected.map((item) => item.category)).toEqual([
      "character.position", "character.pose", "character.expression", "character.props", "environment"
    ]);
    expect(detected[0]?.label).toBe("Birdman: position");
    expect(JSON.stringify(detected)).not.toContain("arbitrary text");
    expect(effectiveAllowedChanges(detected, ["camera", "character.position"])).toEqual([
      "character.position", "character.pose", "character.expression", "character.props", "environment", "camera"
    ]);
  });

  it("returns no inferred changes when the previous structured snapshot is unavailable", () => {
    const current = createEmptyStoryState("scene-1");
    current.storyFacts = ["Camera should change according to arbitrary prose"];
    expect(detectStructuredContinuityChanges(undefined, current)).toEqual([]);
  });
});

describe("PromptBuilder", () => {
  it("builds a structured production prompt from local state", () => {
    const references = new ReferenceResolver().resolve(context).references;
    const prompt = new PromptBuilder().build(context, references);

    expect(prompt).toContain("PROJECT:\nAfter Dark");
    expect(prompt).toContain("FRAME:\nS014_F027");
    expect(prompt).toContain("CANONICAL ASSETS:");
    expect(prompt).toContain("SCENE NARRATIVE CONTEXT:");
    expect(prompt).toContain("Anna receives a message that changes the tone of the night.");
    expect(prompt).toContain("CURRENT STORY STATE:");
    expect(prompt).toContain("FRAME INSTRUCTIONS:");
    expect(prompt).toContain("Anna sits on the bed and reads a message on her phone");
    expect(prompt).toContain("Outfit description: oversized pale blue sleep shirt and dark leggings");
    expect(prompt).toContain("Outfit immutable features: pale blue shirt, dark leggings, no jewelry");
    expect(prompt).toContain("Description: cinematic VN illustration");
    expect(prompt).toContain("Lighting: warm bedside lamp");
    expect(prompt).toContain("Palette: warm amber and cool blue");
    expect(prompt).toContain("Line: clean");
    expect(prompt).toContain("Anatomy: natural VN proportions");
    expect(prompt).toContain("Faces: expressive but consistent faces");
    expect(prompt).toContain("Shading: soft cel shading");
    expect(prompt).toContain("Backgrounds: detailed lived-in interiors");
    expect(prompt).toContain("Camera: 50mm equivalent");
    expect(prompt).toContain("Negative rules: do not switch to photorealism");
    expect(prompt).toContain("- CHAR_ANNA_MASTER_V1");
    expect(prompt).toContain("- STYLE_NIGHT_01");
    expect(prompt).toContain("- STYLE_NIGHT_02");
    expect(prompt).toContain("Do not redesign the character.");
  });

  it("adds safe-area instructions when target panel needs cropping", () => {
    const references = new ReferenceResolver().resolve(context).references;
    const geometry = new GenerationGeometryResolver().resolve({
      targetWidth: 1200,
      targetHeight: 500,
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      fallbackAspectRatio: "16:9",
      fallbackResolution: "1536x864"
    });
    const prompt = new PromptBuilder().build(context, references, geometry);

    expect(prompt).toContain("COMPOSITION SAFE AREA:");
    expect(prompt).toContain("Planned crop strategy: MANUAL.");
  });

  it("adds selected location angle and reference roles to the production prompt", () => {
    const angleContext: FrameContext = {
      ...context,
      locationAngle: {
        id: "angle-1",
        slug: "doorway-view",
        name: "Doorway view",
        description: "View from the doorway toward the bed.",
        cameraPositionDescription: "camera at bedroom door",
        referenceId: "angle-ref-1",
        status: "LOCKED",
        references: [
          { id: "angle-ref-1", code: "LOC_BEDROOM_DOOR_VIEW_V1", type: "VIEW", filePath: "angle.png", description: "", status: "LOCKED", isCanonical: true }
        ]
      }
    };
    const references = new ReferenceResolver().resolve(angleContext).references;
    const prompt = new PromptBuilder().build(angleContext, references);

    expect(prompt).toContain("Location angle: Doorway view");
    expect(prompt).toContain("Camera: camera at bedroom door");
    expect(prompt).toContain("- LOC_BEDROOM_B");
    expect(prompt).toContain("- LOC_BEDROOM_DOOR_VIEW_V1");
    expect(prompt).toContain("REFERENCE ROLES:");
    expect(prompt).toContain("Canonical location-angle reference for Anna Bedroom / Doorway view.");
  });

  it("builds continuation instructions from the current frame delta and story state", () => {
    const instructions = new PromptBuilder().buildContinuationInstructions({
      ...context,
      frame: {
        ...context.frame,
        generationStrategy: "CONTINUE_PREVIOUS_FRAME",
        action: "Anna stands beside the coffee maker",
        camera: "keep the established camera",
        expressionNotes: "alert expression"
      }
    });

    expect(instructions).toContain("EDIT THE PROVIDED PREVIOUS FRAME.");
    expect(instructions).toContain("authoritative visual base");
    expect(instructions).toContain("Anna stands beside the coffee maker");
    expect(instructions).toContain("alert expression");
    expect(instructions).toContain("Current Story State:");
    expect(instructions).not.toContain("CANONICAL ASSETS:");
  });
});

describe("GenerationGeometryResolver", () => {
  it("maps a 16:9 OpenAI target to a valid arbitrary provider resolution", () => {
    const result = new GenerationGeometryResolver().resolve({
      targetWidth: 1536,
      targetHeight: 864,
      provider: "openai",
      model: "gpt-image-2.5-sunburst",
      fallbackAspectRatio: "16:9",
      fallbackResolution: "1536x864"
    });

    expect(result.requestedAspectRatio).toBe("16:9");
    expect(result.requestedResolution).toBe("1536x864");
    expect(result.requiresCrop).toBe(false);
  });

  it("uses exact Gemini geometry when the target panel is 16:9", () => {
    const result = new GenerationGeometryResolver().resolve({
      targetWidth: 1200,
      targetHeight: 675,
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      fallbackAspectRatio: "4:3",
      fallbackResolution: "1024x768"
    });

    expect(result.requestedAspectRatio).toBe("16:9");
    expect(result.requestedResolution).toBe("1376x768");
    expect(result.requiresCrop).toBe(false);
    expect(result.cropStrategy).toBe("NONE");
  });

  it("maps arbitrary wide panels to the closest supported Gemini request and marks manual crop", () => {
    const result = new GenerationGeometryResolver().resolve({
      targetWidth: 1200,
      targetHeight: 500,
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      fallbackAspectRatio: "16:9",
      fallbackResolution: "1536x864"
    });

    expect(result.targetAspectRatio).toBeCloseTo(2.4);
    expect(result.requestedAspectRatio).toBe("21:9");
    expect(result.requiresCrop).toBe(true);
    expect(result.cropStrategy).toBe("MANUAL");
  });

  it("falls back to the project default only when the frame has no target geometry", () => {
    const result = new GenerationGeometryResolver().resolve({
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      fallbackAspectRatio: "3:4",
      fallbackResolution: "768x1024"
    });

    expect(result.targetAspectRatio).toBeCloseTo(0.75);
    expect(result.requestedAspectRatio).toBe("3:4");
    expect(result.requiresCrop).toBe(false);
  });
});

describe("benchmark plan", () => {
  it("prepares 20 frames with varied target geometry", () => {
    const frames = initialConsistencyBenchmarkFrames();
    const uniqueRatios = new Set(frames.map((frame) => (frame.targetWidth / frame.targetHeight).toFixed(2)));

    expect(frames).toHaveLength(20);
    expect(uniqueRatios.size).toBeGreaterThanOrEqual(5);
    expect(frames.some((frame) => frame.tags.includes("crop-risk"))).toBe(true);
    expect(frames.some((frame) => frame.tags.includes("profile"))).toBe(true);
    expect(frames.some((frame) => frame.tags.includes("full-body"))).toBe(true);
  });
});

describe("StoryState", () => {
  it("serializes and validates state documents", () => {
    const state = createEmptyStoryState("scene-1");
    const parsed = parseStoryState(JSON.parse(JSON.stringify(state)));

    expect(parsed.sceneId).toBe("scene-1");
    expect(parsed.environment).toEqual({});
  });
});

describe("asset version selection and lock rules", () => {
  it("creates stable reference version codes", () => {
    expect(referenceVersionCode("CHAR", "anna-master", 3)).toBe("CHAR_ANNA_MASTER_V3");
  });

  it("treats only LOCKED assets as canonical by default", () => {
    expect(isCanonicalAsset("LOCKED")).toBe(true);
    expect(isCanonicalAsset("APPROVED")).toBe(false);
  });

  it("warns before mutating a used canonical asset", () => {
    expect(canonicalMutationWarning(2)).toContain("2 кадрах");
    expect(canonicalMutationWarning(0)).toBeNull();
  });
});

describe("generation file naming", () => {
  it("formats frame and generation file names", () => {
    expect(frameCode(14, 27)).toBe("S014_F027");
    expect(generationFileName("S014_F027", 2, "INITIAL")).toBe("S014_F027_G002.png");
    expect(generationFileName("S014_F027", 3, "REPAIR")).toBe("S014_F027_EDIT_G003.png");
    expect(lockedFrameFileName("S014_F027")).toBe("S014_F027_LOCKED.png");
  });
});
