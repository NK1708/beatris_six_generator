import { create } from "zustand";
export function confirmFrameNavigation(state, changesTarget) {
    return !changesTarget || state.section !== "frames" || !state.frameDraftDirty || window.confirm("У кадра есть несохранённые изменения. Покинуть его без сохранения?");
}
export const useUiStore = create((set, get) => ({
    selectedProjectId: null,
    section: "project",
    selectedCharacterId: null,
    selectedLocationId: null,
    selectedStyleId: null,
    selectedSceneId: null,
    selectedFrameId: null,
    reviewFrameId: null,
    reviewGenerationId: null,
    repairRequest: null,
    frameDraftDirty: false,
    setFrameDraftDirty: (frameDraftDirty) => set({ frameDraftDirty }),
    setProject: (id) => { if (confirmFrameNavigation(get(), get().selectedProjectId !== id))
        set({ selectedProjectId: id, section: "project", frameDraftDirty: false, selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null, reviewFrameId: null, reviewGenerationId: null }); },
    setSection: (section) => { if (confirmFrameNavigation(get(), get().section !== section))
        set({ section, frameDraftDirty: section === "frames" ? get().frameDraftDirty : false }); },
    selectCharacter: (id) => set({ selectedCharacterId: id, section: "characters" }),
    selectLocation: (id) => set({ selectedLocationId: id, section: "locations" }),
    selectStyle: (id) => set({ selectedStyleId: id, section: "styles" }),
    selectScene: (id) => { if (get().selectedSceneId !== id && confirmFrameNavigation(get(), true))
        set({ selectedSceneId: id, selectedFrameId: null, frameDraftDirty: false }); },
    selectFrame: (id) => { if (confirmFrameNavigation(get(), get().selectedFrameId !== id))
        set({ selectedFrameId: id, section: "frames", frameDraftDirty: get().selectedFrameId === id ? get().frameDraftDirty : false }); },
    openStoryboardFrame: (sceneId, frameId) => { if (confirmFrameNavigation(get(), get().selectedFrameId !== frameId))
        set({ selectedSceneId: sceneId, selectedFrameId: frameId, section: "frames", frameDraftDirty: false }); },
    returnToStoryboard: () => { if (confirmFrameNavigation(get(), true))
        set({ section: "storyboard", frameDraftDirty: false }); },
    openGeneration: (frameId, generationId) => set({ reviewFrameId: frameId, reviewGenerationId: generationId }),
    openRepair: (frameId, generationId) => { if (confirmFrameNavigation(get(), true))
        set({ reviewFrameId: frameId, reviewGenerationId: generationId, repairRequest: { frameId, generationId }, section: "generations", frameDraftDirty: false }); },
    clearRepairRequest: () => set({ repairRequest: null }),
    clearProject: () => { if (confirmFrameNavigation(get(), true))
        set({ selectedProjectId: null, section: "project", frameDraftDirty: false, selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null, reviewFrameId: null, reviewGenerationId: null }); }
}));
