import { api } from "./api.js";
import type { Frame, Scene } from "./model.js";
import type { CreateFrameResult } from "@bearridge/shared";

export interface NewFrameOptions {
  action?: string | undefined;
  locationId?: string | undefined;
  locationAngleId?: string | undefined;
  styleProfileId?: string | undefined;
  targetWidth?: number | undefined;
  targetHeight?: number | undefined;
}

export function newFramePayload(scene: Scene, options: NewFrameOptions = {}) {
  const action = options.action?.trim() ?? "";
  return {
    sceneId: scene.id,
    type: "CG" as const,
    generationStrategy: "NEW_COMPOSITION" as const,
    continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
    action,
    camera: "medium close-up",
    composition: action,
    lighting: "",
    expressionNotes: "",
    continuityNotes: "Прямое продолжение локального состояния сцены.",
    locationId: options.locationId,
    locationAngleId: options.locationAngleId,
    styleProfileId: options.styleProfileId,
    targetWidth: options.targetWidth,
    targetHeight: options.targetHeight
  };
}

export function createFrameForScene(scene: Scene, options: NewFrameOptions = {}): Promise<CreateFrameResult<Frame>> {
  return api.post<CreateFrameResult<Frame>>("/api/frames", newFramePayload(scene, options));
}
