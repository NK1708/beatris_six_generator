import type { Project, Section } from "./model.js";
import type { FrameWorkspaceMode } from "./frameWorkspaceUi.js";
export interface SavedWorkspaceContext {
    projectId: string;
    sceneId: string | null;
    frameId: string | null;
    section: Section;
}
export declare const workspaceStorageKey = "bearridge.studio.context.v1";
export declare function readWorkspaceContext(storage?: Pick<Storage, "getItem">): SavedWorkspaceContext | null;
export declare function validateWorkspaceContext(project: Project, saved: SavedWorkspaceContext): {
    selectedSceneId: string | null;
    selectedFrameId: string | null;
    section: Section;
};
interface UiState {
    frameInspectorPreferences: Record<string, Partial<Record<FrameWorkspaceMode, boolean>>>;
    setFrameInspectorCollapsed(projectId: string, mode: FrameWorkspaceMode, collapsed: boolean): void;
    navigationCollapsed: boolean;
    toggleNavigation(): void;
    restoreContext(project: Project, saved: SavedWorkspaceContext): void;
    selectedProjectId: string | null;
    section: Section;
    selectedCharacterId: string | null;
    selectedLocationId: string | null;
    selectedStyleId: string | null;
    selectedSceneId: string | null;
    selectedFrameId: string | null;
    reviewFrameId: string | null;
    reviewGenerationId: string | null;
    repairRequest: {
        frameId: string;
        generationId: string;
    } | null;
    frameDraftDirty: boolean;
    setFrameDraftDirty(dirty: boolean): void;
    sceneDraftDirty: boolean;
    setSceneDraftDirty(dirty: boolean): void;
    setProject(id: string): void;
    setSection(section: Section): void;
    selectCharacter(id: string): void;
    selectLocation(id: string): void;
    selectStyle(id: string): void;
    selectScene(id: string): void;
    selectFrame(id: string): void;
    openStoryboardFrame(sceneId: string, frameId: string): void;
    returnToStoryboard(): void;
    openGeneration(frameId: string, generationId: string): void;
    openRepair(frameId: string, generationId: string): void;
    clearRepairRequest(): void;
    clearProject(): void;
}
export declare function confirmFrameNavigation(state: Pick<UiState, "section" | "frameDraftDirty"> & Partial<Pick<UiState, "sceneDraftDirty">>, changesTarget: boolean): boolean;
export declare const useUiStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UiState>>;
export {};
//# sourceMappingURL=state.d.ts.map