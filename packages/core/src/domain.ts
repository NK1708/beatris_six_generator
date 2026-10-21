import type { AssetStatus, ContinuityEditContract, FrameGenerationStrategy, FrameStatus, FrameType, ReferenceAsset, StoryStateDocument } from "@bearridge/shared";

export interface ProjectView {
  id: string;
  name: string;
  defaultAspectRatio: string;
  defaultResolution: string;
  defaultDraftModel: string;
  defaultProductionModel: string;
}

export interface CharacterView {
  id: string;
  name: string;
  description: string;
  bodyDescription: string;
  faceDescription: string;
  hairDescription: string;
  immutableFeatures: string;
  masterReferenceId: string | null;
  status: AssetStatus;
  references: Array<{
    id: string;
    code: string;
    type: string;
    filePath: string;
    description: string;
    status: AssetStatus;
    isCanonical: boolean;
  }>;
  outfits: OutfitView[];
}

export interface OutfitView {
  id: string;
  name: string;
  description: string;
  immutableFeatures: string;
  masterReferenceId: string | null;
  status: AssetStatus;
  references: Array<{
    id: string;
    code: string;
    type: string;
    filePath: string;
    description: string;
    status: AssetStatus;
    isCanonical: boolean;
  }>;
}

export interface LocationView {
  id: string;
  name: string;
  description: string;
  architectureDescription: string;
  immutableFeatures: string;
  masterReferenceId: string | null;
  status: AssetStatus;
  references: Array<{
    id: string;
    code: string;
    type: string;
    filePath: string;
    description: string;
    status: AssetStatus;
    isCanonical: boolean;
  }>;
  angles: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    cameraPositionDescription: string;
    referenceId: string | null;
    status: AssetStatus;
    references: Array<{
      id: string;
      code: string;
      type: string;
      filePath: string;
      description: string;
      status: AssetStatus;
      isCanonical: boolean;
    }>;
  }>;
}

export interface StyleProfileView {
  id: string;
  name: string;
  description: string;
  linework: string;
  anatomy: string;
  faces: string;
  shading: string;
  colorPalette: string;
  backgroundDetail: string;
  lighting: string;
  cameraLanguage: string;
  negativeRules: string;
  status: AssetStatus;
  references: Array<{
    id: string;
    code: string;
    filePath: string;
    description: string;
    status: AssetStatus;
    isCanonical: boolean;
  }>;
}

export interface SceneView {
  id: string;
  sequence: number;
  name: string;
  description: string;
  locationId: string | null;
  styleProfileId: string | null;
  characterIds: string[];
  timeDescription: string;
}

export interface ScreenView {
  id: string;
  sceneId: string;
  sequence: number;
  code: string;
  width: number | null;
  height: number | null;
  panels: PanelView[];
}

export interface PanelView {
  id: string;
  screenId: string;
  frameId: string;
  sequence: number;
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  zIndex: number | null;
}

export interface FrameView {
  id: string;
  sceneId: string;
  sequence: number;
  frameCode: string;
  type: FrameType;
  status: FrameStatus;
  generationStrategy: FrameGenerationStrategy;
  continuityEditContract: ContinuityEditContract;
  description: string;
  action: string;
  camera: string;
  composition: string;
  lighting: string;
  expressionNotes: string;
  continuityNotes: string;
  previousFrameId: string | null;
  selectedGenerationId: string | null;
  characterIds: string[];
  additionalCharacterReferenceIds?: Record<string, string[]>;
  locationId: string | null;
  locationAngleId: string | null;
  styleProfileId: string | null;
  targetWidth: number | null;
  targetHeight: number | null;
  targetAspectRatio: number | null;
}

export interface FrameContext {
  project: ProjectView;
  scene: SceneView;
  frame: FrameView;
  storyState: StoryStateDocument;
  previousStoryState?: StoryStateDocument | undefined;
  characters: CharacterView[];
  location: LocationView | null;
  locationAngle: LocationView["angles"][number] | null;
  styleProfile: StyleProfileView | null;
  previousLockedFrame?: {
    id: string;
    frameCode: string;
    generationId: string;
    outputFilePath: string;
  } | undefined;
}

export interface ResolvedReferences {
  references: ReferenceAsset[];
  warnings: ResolverWarning[];
}

export interface ResolverWarning {
  code:
    | "MISSING_CANONICAL_CHARACTER_MASTER"
    | "MISSING_CHARACTER_MASTER"
    | "MISSING_CANONICAL_OUTFIT_MASTER"
    | "MISSING_OUTFIT_MASTER"
    | "MISSING_CANONICAL_LOCATION_MASTER"
    | "MISSING_LOCATION_MASTER"
    | "MISSING_LOCATION_ANGLE_REFERENCE"
    | "MISSING_CANONICAL_STYLE_REFERENCE"
    | "MISSING_STYLE_REFERENCE"
    | "MISSING_CHARACTER_OUTFIT"
    | "PREVIOUS_FRAME_NOT_LOCKED"
    | "INVALID_CONTINUATION_BASE"
    | "PROVIDER_EDIT_UNSUPPORTED";
  entityId: string;
  message: string;
  severity?: "blocking" | "warning";
}
