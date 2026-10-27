import type { Section } from "./model.js";
interface UiState {
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
export declare function confirmFrameNavigation(state: Pick<UiState, "section" | "frameDraftDirty">, changesTarget: boolean): boolean;
export declare const useUiStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UiState>>;
export {};
//# sourceMappingURL=state.d.ts.map