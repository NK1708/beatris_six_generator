import React from "react";
import type { Frame, FrameDraft, Project, Scene, SceneDraft } from "../model.js";
export declare function emptySceneDraft(project: Project): SceneDraft;
export declare function sceneToDraft(scene: Scene): SceneDraft;
export declare function emptyFrameDraft(): FrameDraft;
export declare function frameToDraft(frame: Frame): FrameDraft;
export declare function DeleteProjectPanel({ project }: {
    project: Project;
}): React.JSX.Element;
export declare function CharactersScreen({ project }: {
    project: Project;
}): React.JSX.Element;
export declare function LocationsScreen({ project }: {
    project: Project;
}): React.JSX.Element;
export declare function StylesScreen({ project }: {
    project: Project;
}): React.JSX.Element;
//# sourceMappingURL=AssetLibrary.d.ts.map