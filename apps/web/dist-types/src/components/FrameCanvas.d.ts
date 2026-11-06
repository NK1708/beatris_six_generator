import React from "react";
export interface FrameCanvasSource {
    id: string;
    url: string | null;
    label: string;
}
export declare function FrameCanvas({ source, targetWidth, targetHeight, targetRatio, onGenerate }: {
    source: FrameCanvasSource | null;
    targetWidth: number | null;
    targetHeight: number | null;
    targetRatio: number;
    onGenerate?: () => void;
}): React.JSX.Element;
//# sourceMappingURL=FrameCanvas.d.ts.map