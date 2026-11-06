import { create } from "zustand";
export const workspaceStorageKey = "bearridge.studio.context.v1";
const sections = ["project", "characters", "outfits", "locations", "styles", "scenes", "storyboard", "frames", "generations", "settings", "advanced"];
export function readWorkspaceContext(storage) {
    try {
        const raw = JSON.parse((storage ?? localStorage).getItem(workspaceStorageKey) ?? "null");
        if (!raw || typeof raw !== "object")
            return null;
        const value = raw;
        if (typeof value.projectId !== "string" || !value.projectId || !(value.sceneId === null || typeof value.sceneId === "string") || !(value.frameId === null || typeof value.frameId === "string"))
            return null;
        return { projectId: value.projectId, sceneId: value.sceneId, frameId: value.frameId, section: sections.includes(value.section) ? value.section : "project" };
    }
    catch {
        return null;
    }
}
export function validateWorkspaceContext(project, saved) {
    const scene = project.scenes.find(item => item.id === saved.sceneId);
    const frame = scene?.frames.find(item => item.id === saved.frameId);
    return { selectedSceneId: scene?.id ?? null, selectedFrameId: frame?.id ?? null, section: saved.section === "frames" && !frame ? "storyboard" : saved.section };
}
export function confirmFrameNavigation(state, changesTarget) {
    if (!changesTarget)
        return true;
    if (state.section === "scenes" && state.sceneDraftDirty)
        return window.confirm("У сцены есть несохранённые изменения. Покинуть её без сохранения?");
    return state.section !== "frames" || !state.frameDraftDirty || window.confirm("У кадра есть несохранённые изменения. Покинуть его без сохранения?");
}
export const useUiStore = create((set, get) => ({
    frameInspectorPreferences: {},
    setFrameInspectorCollapsed: (projectId, mode, collapsed) => set(state => ({ frameInspectorPreferences: { ...state.frameInspectorPreferences, [projectId]: { ...state.frameInspectorPreferences[projectId], [mode]: collapsed } } })),
    navigationCollapsed: false,
    toggleNavigation: () => set(state => ({ navigationCollapsed: !state.navigationCollapsed })),
    restoreContext: (project, saved) => { if (get().selectedProjectId === project.id && saved.projectId === project.id)
        set(validateWorkspaceContext(project, saved)); },
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
    sceneDraftDirty: false,
    setSceneDraftDirty: (sceneDraftDirty) => set({ sceneDraftDirty }),
    setProject: (id) => { if (get().selectedProjectId === id)
        return; if (confirmFrameNavigation(get(), true))
        set({ selectedProjectId: id, section: "project", frameDraftDirty: false, sceneDraftDirty: false, selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null, reviewFrameId: null, reviewGenerationId: null }); },
    setSection: (section) => { if (confirmFrameNavigation(get(), get().section !== section))
        set({ section, frameDraftDirty: section === "frames" ? get().frameDraftDirty : false, sceneDraftDirty: section === "scenes" ? get().sceneDraftDirty : false }); },
    selectCharacter: (id) => { if (confirmFrameNavigation(get(), get().section !== "characters"))
        set({ selectedCharacterId: id, section: "characters", sceneDraftDirty: false }); },
    selectLocation: (id) => { if (confirmFrameNavigation(get(), get().section !== "locations"))
        set({ selectedLocationId: id, section: "locations", sceneDraftDirty: false }); },
    selectStyle: (id) => { if (confirmFrameNavigation(get(), get().section !== "styles"))
        set({ selectedStyleId: id, section: "styles", sceneDraftDirty: false }); },
    selectScene: (id) => { if (get().selectedSceneId !== id && confirmFrameNavigation(get(), true))
        set({ selectedSceneId: id, selectedFrameId: null, frameDraftDirty: false, sceneDraftDirty: false }); },
    selectFrame: (id) => { if (confirmFrameNavigation(get(), get().section !== "frames" || get().selectedFrameId !== id))
        set({ selectedFrameId: id, section: "frames", frameDraftDirty: get().selectedFrameId === id ? get().frameDraftDirty : false, sceneDraftDirty: false }); },
    openStoryboardFrame: (sceneId, frameId) => { if (confirmFrameNavigation(get(), get().section !== "frames" || get().selectedSceneId !== sceneId || get().selectedFrameId !== frameId))
        set({ selectedSceneId: sceneId, selectedFrameId: frameId, section: "frames", frameDraftDirty: false, sceneDraftDirty: false }); },
    returnToStoryboard: () => { if (confirmFrameNavigation(get(), true))
        set({ section: "storyboard", frameDraftDirty: false, sceneDraftDirty: false }); },
    openGeneration: (frameId, generationId) => set({ reviewFrameId: frameId, reviewGenerationId: generationId }),
    openRepair: (frameId, generationId) => { if (confirmFrameNavigation(get(), true))
        set({ reviewFrameId: frameId, reviewGenerationId: generationId, repairRequest: { frameId, generationId }, section: "generations", frameDraftDirty: false, sceneDraftDirty: false }); },
    clearRepairRequest: () => set({ repairRequest: null }),
    clearProject: () => { if (confirmFrameNavigation(get(), true))
        set({ selectedProjectId: null, section: "project", frameDraftDirty: false, sceneDraftDirty: false, selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null, reviewFrameId: null, reviewGenerationId: null }); }
}));
// Store navigation metadata only; startup never hydrates the active project.
useUiStore.subscribe((state) => {
    if (!state.selectedProjectId)
        return;
    try {
        const context = { projectId: state.selectedProjectId, sceneId: state.selectedSceneId, frameId: state.selectedFrameId, section: state.section };
        localStorage.setItem(workspaceStorageKey, JSON.stringify(context));
    }
    catch { /* Storage may be unavailable; the current session remains usable. */ }
});
