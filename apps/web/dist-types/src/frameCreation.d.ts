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
export declare function newFramePayload(scene: Scene, options?: NewFrameOptions): {
    sceneId: string;
    type: "CG";
    generationStrategy: "NEW_COMPOSITION";
    continuityEditContract: {
        changes: never[];
        forbidden: never[];
        allowedChanges: never[];
    };
    action: string;
    camera: string;
    composition: string;
    lighting: string;
    expressionNotes: string;
    continuityNotes: string;
    locationId: string | undefined;
    locationAngleId: string | undefined;
    styleProfileId: string | undefined;
    targetWidth: number | undefined;
    targetHeight: number | undefined;
};
export declare function createFrameForScene(scene: Scene, options?: NewFrameOptions): Promise<CreateFrameResult<Frame>>;
//# sourceMappingURL=frameCreation.d.ts.map