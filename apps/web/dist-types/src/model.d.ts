import type { StoryStateDocument } from "@bearridge/shared";
export type AssetStatus = "DRAFT" | "APPROVED" | "LOCKED" | "DEPRECATED" | "REJECTED";
export type FrameStatus = "DRAFT" | "GENERATING" | "REVIEW" | "LOCKED" | "REJECTED";
export type Section = "outfits" | "project" | "characters" | "locations" | "styles" | "scenes" | "storyboard" | "frames" | "generations" | "settings" | "advanced";
export type OwnerType = "character" | "outfit" | "location" | "locationAngle" | "style";
export interface RegistryProject {
    id: string;
    name: string;
    projectPath: string;
    lastOpenedAt: string | null;
    createdAt: string;
}
export interface Project {
    id: string;
    name: string;
    description: string;
    rootPath: string;
    defaultAspectRatio: string;
    defaultResolution: string;
    defaultDraftModel: string;
    defaultProductionModel: string;
    characters: Character[];
    locations: Location[];
    styleProfiles: StyleProfile[];
    scenes: Scene[];
}
export interface Character {
    id: string;
    name: string;
    slug: string;
    description: string;
    age: string;
    height: string;
    bodyDescription: string;
    faceDescription: string;
    hairDescription: string;
    distinctiveFeatures: string;
    immutableFeatures: string;
    status: AssetStatus;
    references: Reference[];
    outfits: Outfit[];
}
export type CharacterDraft = Pick<Character, "name" | "description" | "age" | "height" | "bodyDescription" | "faceDescription" | "hairDescription" | "distinctiveFeatures" | "immutableFeatures">;
export interface Outfit {
    id: string;
    name: string;
    slug: string;
    description: string;
    immutableFeatures: string;
    status: AssetStatus;
    references: Reference[];
}
export type OutfitDraft = Pick<Outfit, "name" | "description" | "immutableFeatures">;
export type LocationAngleDraft = {
    name: string;
    cameraDescription: string;
};
export interface Location {
    id: string;
    name: string;
    slug: string;
    description: string;
    architectureDescription: string;
    immutableFeatures: string;
    status: AssetStatus;
    references: Reference[];
    angles: LocationAngle[];
}
export interface LocationAngle {
    id: string;
    slug: string;
    name: string;
    description: string;
    cameraPositionDescription: string;
    status: AssetStatus;
    references: Reference[];
}
export interface StyleProfile {
    id: string;
    name: string;
    slug: string;
    description: string;
    linework: string;
    anatomy: string;
    faces: string;
    shading: string;
    backgroundDetail: string;
    cameraLanguage: string;
    lighting: string;
    colorPalette: string;
    negativeRules: string;
    status: AssetStatus;
    references: Reference[];
}
export type StyleDraft = Pick<StyleProfile, "name" | "description" | "lighting" | "colorPalette" | "linework" | "anatomy" | "faces" | "shading" | "backgroundDetail" | "cameraLanguage" | "negativeRules">;
export interface Scene {
    id: string;
    sequence: number;
    name: string;
    description: string;
    locationId: string | null;
    styleProfileId: string | null;
    characterIds: string[];
    timeDescription: string;
    storyState?: {
        document: StoryStateDocument;
    } | null;
    frames: Frame[];
}
export type SceneDraft = Pick<Scene, "name" | "description" | "locationId" | "styleProfileId" | "timeDescription" | "characterIds">;
export interface Frame {
    id: string;
    sceneId: string;
    sequence: number;
    frameCode: string;
    type: "STANDARD" | "CG";
    status: FrameStatus;
    generationStrategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME";
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
    effectiveCharacterIds?: string[];
    characterCastSource?: "EXPLICIT" | "INHERITED_PREVIOUS" | "INHERITED_SCENE" | "LEGACY_UNKNOWN";
    characterCastRevision?: number;
    additionalCharacterReferenceIds: Record<string, string[]>;
    locationId: string | null;
    locationAngleId: string | null;
    styleProfileId: string | null;
    targetWidth: number | null;
    targetHeight: number | null;
    targetAspectRatio: number | null;
    generations: Generation[];
}
export type ContinuityCategory = "character.position" | "character.pose" | "character.expression" | "character.outfit" | "character.props" | "camera" | "composition" | "lighting" | "environment" | "architecture" | "furniture";
export type ContinuityEditContract = {
    changes: string[];
    forbidden: string[];
    allowedChanges: ContinuityCategory[];
};
export declare const continuityCategories: ContinuityCategory[];
export type FrameDraft = Pick<Frame, "description" | "action" | "camera" | "composition" | "lighting" | "expressionNotes" | "continuityNotes" | "generationStrategy" | "continuityEditContract" | "characterIds" | "additionalCharacterReferenceIds" | "locationId" | "locationAngleId" | "styleProfileId"> & {
    characterCastMode: "INHERIT" | "EXPLICIT" | "LEGACY";
    targetWidth: string;
    targetHeight: string;
};
export interface Generation {
    id: string;
    status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "REJECTED";
    generationType: "INITIAL" | "RETRY" | "EDIT" | "REPAIR";
    provider: string;
    model: string;
    outputFilePath: string;
    createdAt: string;
    resolution?: string;
    aspectRatio?: string;
    rawMetadata?: string | null;
    completedAt?: string | null;
    parentGenerationId?: string | null;
    frameSnapshot?: string;
    storyStateSnapshot?: string | null;
    targetWidth?: number | null;
    targetHeight?: number | null;
    targetAspectRatio?: number | null;
    requiresCrop?: boolean;
    cropStrategy?: string;
    references?: Array<{
        id: string;
        code: string;
        referenceId: string;
    }>;
}
export interface ChatGPTExportSummary {
    exportId: string;
    createdAt: string;
    strategy: Frame["generationStrategy"];
    frameCode: string;
    baseFrameCode: string | null;
    operation?: "REPAIR" | null;
    repairSourceGenerationId?: string | null;
}
export interface Reference {
    id: string;
    code: string;
    type?: string;
    filePath: string;
    description: string;
    status: AssetStatus;
    isCanonical: boolean;
    version: number;
}
export interface PreviewResponse {
    productionTarget?: {
        revision: number;
        fingerprint: string;
    };
    strategy: Frame["generationStrategy"];
    baseReference?: {
        id: string;
        code: string;
        filePath: string;
        label?: string;
    };
    deltaInstructions?: string;
    detectedContinuityChanges: Array<{
        category: ContinuityCategory;
        entityId: string;
        label: string;
        previousValue: string;
        currentValue: string;
    }>;
    allowedContinuityChanges: ContinuityCategory[];
    references: Array<{
        id: string;
        code: string;
        filePath: string;
        kind: string;
        priority: number;
        label?: string;
        role?: string;
    }>;
    warnings: Array<{
        code: string;
        entityId: string;
        message: string;
        severity?: "blocking" | "warning";
    }>;
    prompt: string;
    context: {
        frame: Frame;
        characters: Character[];
        location: Location | null;
        locationAngle: LocationAngle | null;
        styleProfile: StyleProfile | null;
        storyState: StoryStateDocument;
        previousLockedFrame?: {
            id: string;
            frameCode: string;
            generationId: string;
            outputFilePath: string;
        };
    };
    geometry: {
        requestedAspectRatio: string;
        requestedResolution: string;
        requestedImageSize: "512" | "1K" | "2K" | "4K";
        targetAspectRatio: number;
        requiresCrop: boolean;
        cropStrategy: "NONE" | "CENTER" | "MANUAL";
        aspectRatioDifference: number;
    };
}
//# sourceMappingURL=model.d.ts.map