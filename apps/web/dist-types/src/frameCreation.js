import { api } from "./api.js";
export function newFramePayload(scene, options = {}) {
    const action = options.action?.trim() ?? "";
    return {
        sceneId: scene.id,
        type: "CG",
        generationStrategy: "NEW_COMPOSITION",
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
export function createFrameForScene(scene, options = {}) {
    return api.post("/api/frames", newFramePayload(scene, options));
}
