import { z } from "zod";

export const assetStatuses = ["DRAFT", "APPROVED", "LOCKED", "DEPRECATED", "REJECTED"] as const;
export const frameStatuses = ["DRAFT", "GENERATING", "REVIEW", "LOCKED", "REJECTED"] as const;
export const frameTypes = ["STANDARD", "CG"] as const;
export const generationTypes = ["INITIAL", "RETRY", "EDIT", "REPAIR"] as const;
export const frameGenerationStrategies = ["NEW_COMPOSITION", "CONTINUE_PREVIOUS_FRAME"] as const;
export const continuityCategories = [
  "character.position", "character.pose", "character.expression", "character.outfit", "character.props",
  "camera", "composition", "lighting", "environment", "architecture", "furniture"
] as const;

export type AssetStatus = (typeof assetStatuses)[number];
export type FrameStatus = (typeof frameStatuses)[number];
export type FrameType = (typeof frameTypes)[number];
export type GenerationType = (typeof generationTypes)[number];
export type GenerationMode = "draft" | "production";
export type FrameGenerationStrategy = (typeof frameGenerationStrategies)[number];
export type ContinuityCategory = (typeof continuityCategories)[number];

export const continuityEditContractSchema = z.object({
  changes: z.array(z.string().trim().min(1)).default([]),
  forbidden: z.array(z.string().trim().min(1)).default([]),
  allowedChanges: z.array(z.enum(continuityCategories)).default([])
});

export type ContinuityEditContract = z.infer<typeof continuityEditContractSchema>;

export interface ReferenceAsset {
  id: string;
  kind: "character" | "outfit" | "location" | "location-angle" | "style" | "prop" | "previous-frame";
  code: string;
  filePath: string;
  description?: string;
  status: AssetStatus | FrameStatus;
  priority: number;
  label?: string;
  role?: string;
}

export interface GenerationRequest {
  prompt: string;
  references: ReferenceAsset[];
  aspectRatio: string;
  resolution: string;
  mode: GenerationMode;
  frameId: string;
  geometry?: GenerationGeometryResult | undefined;
}

export interface EditRequest extends GenerationRequest {
  baseImagePath: string;
  repairInstructions: string;
}

export interface GenerationResult {
  provider: string;
  model: string;
  outputFilePath: string;
  rawMetadata: unknown;
  createdAt: Date;
  estimatedCost?: number;
}

export interface GenerationGeometryInput {
  targetWidth?: number | undefined;
  targetHeight?: number | undefined;
  targetAspectRatio?: number | undefined;
  provider: string;
  model: string;
  fallbackAspectRatio: string;
  fallbackResolution: string;
}

export interface GenerationGeometryResult {
  requestedAspectRatio: string;
  requestedResolution: string;
  requestedImageSize: "512" | "1K" | "2K" | "4K";
  targetAspectRatio: number;
  requiresCrop: boolean;
  cropStrategy: "NONE" | "CENTER" | "MANUAL";
  aspectRatioDifference: number;
}

export interface ImageProvider {
  readonly capabilities: { generate: true; trueEdit: boolean };
  generate(request: GenerationRequest): Promise<GenerationResult>;
  edit(request: EditRequest): Promise<GenerationResult>;
}

const storyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const storyStateSchema = z.object({
  sceneId: z.string(),
  time: z.object({
    description: z.string().default("")
  }),
  environment: z.record(storyValueSchema).default({}),
  characters: z.record(z.object({
    present: z.boolean(),
    outfitId: z.string().optional(),
    emotion: z.string().optional(),
    pose: z.string().optional(),
    hairState: z.string().optional(),
    locationPosition: z.string().optional(),
    heldProps: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional()
  })).default({}),
  props: z.record(z.object({
    location: z.string().optional(),
    holderCharacterId: z.string().optional(),
    state: z.string().optional()
  })).default({}),
  storyFacts: z.array(z.string()).default([])
});

export type StoryStateDocument = z.infer<typeof storyStateSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  rootPath: z.string().optional(),
  defaultAspectRatio: z.string().default("16:9"),
  defaultResolution: z.string().default("1536x864"),
  defaultDraftModel: z.string().default("gemini-3.1-flash-image"),
  defaultProductionModel: z.string().default("gemini-3.1-flash-image")
});

export const openProjectSchema = z.object({
  projectPath: z.string().min(1)
});

export const deleteProjectSchema = z.object({
  projectId: z.string(),
  deleteFiles: z.boolean().default(false),
  confirmationName: z.string().optional()
});

export const createCharacterSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  age: z.string().default(""),
  height: z.string().default(""),
  bodyDescription: z.string().default(""),
  faceDescription: z.string().default(""),
  hairDescription: z.string().default(""),
  distinctiveFeatures: z.string().default(""),
  immutableFeatures: z.string().default("")
});

export const updateCharacterSchema = createCharacterSchema.omit({ projectId: true }).extend({
  characterId: z.string()
});

export const createLocationSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  architectureDescription: z.string().default(""),
  immutableFeatures: z.string().default("")
});

export const createStyleProfileSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  linework: z.string().default(""),
  anatomy: z.string().default(""),
  faces: z.string().default(""),
  shading: z.string().default(""),
  colorPalette: z.string().default(""),
  backgroundDetail: z.string().default(""),
  lighting: z.string().default(""),
  cameraLanguage: z.string().default(""),
  negativeRules: z.string().default("")
});

export const updateStyleProfileSchema = createStyleProfileSchema.omit({ projectId: true }).extend({
  styleId: z.string()
});

export const createSceneSchema = z.object({
  projectId: z.string(),
  sequence: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().default(""),
  locationId: z.string().optional(),
  styleId: z.string().optional(),
  styleProfileId: z.string().optional(),
  characterIds: z.array(z.string()).default([]),
  timeDescription: z.string().default("")
});

export const updateSceneSchema = createSceneSchema.omit({ projectId: true, sequence: true }).extend({
  sceneId: z.string(),
  locationId: z.string().nullable().optional(),
  styleId: z.string().nullable().optional(),
  styleProfileId: z.string().nullable().optional()
});

export const createFrameSchema = z.object({
  sceneId: z.string(),
  sequence: z.number().int().positive(),
  type: z.enum(frameTypes).default("CG"),
  generationStrategy: z.enum(frameGenerationStrategies).default("NEW_COMPOSITION"),
  continuityEditContract: continuityEditContractSchema.default({ changes: [], forbidden: [], allowedChanges: [] }),
  description: z.string().default(""),
  action: z.string().default(""),
  camera: z.string().default(""),
  composition: z.string().default(""),
  lighting: z.string().default(""),
  expressionNotes: z.string().default(""),
  continuityNotes: z.string().default(""),
  previousFrameId: z.string().optional(),
  characterIds: z.array(z.string()).default([]),
  locationId: z.string().optional(),
  locationAngleId: z.string().optional(),
  styleProfileId: z.string().optional(),
  targetWidth: z.number().int().positive().optional(),
  targetHeight: z.number().int().positive().optional(),
  targetAspectRatio: z.number().positive().optional()
});

export const updateFrameSchema = z.object({
  frameId: z.string(),
  generationStrategy: z.enum(frameGenerationStrategies).optional(),
  continuityEditContract: continuityEditContractSchema.optional(),
  description: z.string().default(""),
  action: z.string().default(""),
  camera: z.string().default(""),
  composition: z.string().default(""),
  lighting: z.string().default(""),
  expressionNotes: z.string().default(""),
  continuityNotes: z.string().default(""),
  characterIds: z.array(z.string()).optional(),
  locationId: z.string().nullable().optional(),
  locationAngleId: z.string().nullable().optional(),
  styleProfileId: z.string().nullable().optional(),
  additionalCharacterReferenceIds: z.record(z.array(z.string())).optional(),
  targetWidth: z.number().int().positive().nullable().optional(),
  targetHeight: z.number().int().positive().nullable().optional(),
  targetAspectRatio: z.number().positive().nullable().optional()
});

export const updateFrameContextSchema = z.object({
  frameId: z.string(),
  characterIds: z.array(z.string()).default([]),
  locationId: z.string().nullable().optional(),
  locationAngleId: z.string().nullable().optional(),
  styleProfileId: z.string().nullable().optional(),
  additionalCharacterReferenceIds: z.record(z.array(z.string())).default({})
});

export const seedBenchmarkSchema = z.object({
  projectId: z.string(),
  characterId: z.string(),
  outfitId: z.string(),
  locationId: z.string(),
  styleProfileId: z.string(),
  locationAngleId: z.string().optional()
});

export const updateProjectSettingsSchema = z.object({
  projectId: z.string(),
  defaultAspectRatio: z.string().min(1),
  defaultResolution: z.string().min(1),
  defaultDraftModel: z.string().min(1),
  defaultProductionModel: z.string().min(1)
});

export const createOutfitSchema = z.object({
  characterId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  immutableFeatures: z.string().default("")
});

export const updateOutfitSchema = createOutfitSchema.omit({ characterId: true }).extend({
  outfitId: z.string()
});

export const createLocationAngleSchema = z.object({
  locationId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  cameraPositionDescription: z.string().default("")
});

export const updateLocationAngleSchema = z.object({
  locationAngleId: z.string(),
  name: z.string().min(1),
  cameraDescription: z.string().default(""),
  cameraPositionDescription: z.string().optional()
});

export const saveStoryStateSchema = z.object({
  sceneId: z.string(),
  document: storyStateSchema
});

export const generateFrameSchema = z.object({
  frameId: z.string(),
  mode: z.enum(["draft", "production"]).default("draft")
});

export const importChatGPTResultSchema = z.object({
  frameId: z.string(),
  exportId: z.string().uuid(),
  fileName: z.string().min(1),
  dataUrl: z.string().min(1)
});

export const uploadReferenceSchema = z.object({
  ownerId: z.string(),
  type: z.string().min(1),
  fileName: z.string().min(1),
  dataUrl: z.string().min(1),
  description: z.string().default("")
});

export const updateReferenceStatusSchema = z.object({
  ownerType: z.enum(["character", "outfit", "location", "locationAngle", "style"]),
  referenceId: z.string()
});

export const lockFrameSchema = z.object({
  frameId: z.string()
});

export const selectFrameGenerationSchema = z.object({
  frameId: z.string(),
  generationId: z.string()
});
