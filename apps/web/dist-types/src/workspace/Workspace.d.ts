import React from "react";
import type { Project, Section } from "../model.js";
export declare function Workspace(): React.JSX.Element;
export declare function ProductionSurface({ project, section: sectionOverride, showContextPane, hidden }: {
    project: Project;
    section?: Section;
    showContextPane?: boolean;
    hidden?: boolean;
}): React.JSX.Element;
export declare function ContextPane({ project, section: sectionOverride }: {
    project: Project;
    section?: Section;
}): React.JSX.Element;
//# sourceMappingURL=Workspace.d.ts.map