import React from "react";
export type InspectorTab = "staging" | "context" | "state" | "technical";
export declare function FrameInspector({ tab, onTab, collapsed, onClose, children }: {
    tab: InspectorTab;
    onTab(tab: InspectorTab): void;
    collapsed: boolean;
    onClose(): void;
    children: React.ReactNode;
}): React.JSX.Element;
export declare function FrameInspectorPanel({ id, active, children }: {
    id: InspectorTab;
    active: InspectorTab;
    children: React.ReactNode;
}): React.JSX.Element;
//# sourceMappingURL=FrameInspector.d.ts.map