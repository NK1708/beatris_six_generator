import React from "react";
import type { Generation, Project } from "../model.js";
export type InspectionZoom = "fit" | number;
export declare function InspectionImage({ project, generation, zoom, label, onFitScale }: {
    project: Project;
    generation: Generation;
    zoom?: InspectionZoom;
    label: string;
    onFitScale?: (percent: number) => void;
}): React.JSX.Element;
//# sourceMappingURL=InspectionImage.d.ts.map