import React from "react";
import type { Frame, Project } from "../model.js";
export declare function FrameFilmstrip({ project, frames, selectedId, onSelect, onCreate, creating, canCreate }: {
    project: Project;
    frames: Frame[];
    selectedId: string | null;
    onSelect(id: string): void;
    onCreate(): void;
    creating: boolean;
    canCreate: boolean;
}): React.JSX.Element;
//# sourceMappingURL=FrameFilmstrip.d.ts.map