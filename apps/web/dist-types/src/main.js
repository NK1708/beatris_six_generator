import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import "./styles.css";
const queryClient = new QueryClient();
const continuityCategories = ["character.position", "character.pose", "character.expression", "character.outfit", "character.props", "camera", "composition", "lighting", "environment", "architecture", "furniture"];
const useUiStore = create((set) => ({
    selectedProjectId: null,
    section: "project",
    selectedCharacterId: null,
    selectedLocationId: null,
    selectedStyleId: null,
    selectedSceneId: null,
    selectedFrameId: null,
    setProject: (id) => set({ selectedProjectId: id, section: "project", selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null }),
    setSection: (section) => set({ section }),
    selectCharacter: (id) => set({ selectedCharacterId: id, section: "characters" }),
    selectLocation: (id) => set({ selectedLocationId: id, section: "locations" }),
    selectStyle: (id) => set({ selectedStyleId: id, section: "styles" }),
    selectScene: (id) => set({ selectedSceneId: id }),
    selectFrame: (id) => set({ selectedFrameId: id, section: "frames" }),
    clearProject: () => set({ selectedProjectId: null, section: "project", selectedCharacterId: null, selectedLocationId: null, selectedStyleId: null, selectedSceneId: null, selectedFrameId: null })
}));
const api = {
    async get(url) {
        return parseResponse(await fetch(url));
    },
    async post(url, body) {
        return parseResponse(await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    },
    async put(url, body) {
        return parseResponse(await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    },
    async delete(url, body) {
        return parseResponse(await fetch(url, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }));
    }
};
async function parseResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Запрос не выполнен";
        throw new Error(message);
    }
    return data;
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(Workspace, {}) }));
}
function Workspace() {
    const { selectedProjectId, setProject, section, setSection } = useUiStore();
    const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get("/api/projects") });
    const project = useQuery({
        queryKey: ["project", selectedProjectId],
        queryFn: () => api.get(`/api/projects/${selectedProjectId}/full`),
        enabled: Boolean(selectedProjectId)
    });
    React.useEffect(() => {
        if (!selectedProjectId && projects.data?.[0]) {
            setProject(projects.data[0].id);
        }
    }, [projects.data, selectedProjectId, setProject]);
    return (_jsxs("div", { className: "appShell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand", children: [_jsx(Clapperboard, { size: 18 }), " Bearridge"] }), _jsx(ProjectCreator, {}), _jsx(ProjectOpener, {}), _jsx("nav", { children: projects.data?.map((item) => _jsx(ProjectNavItem, { item: item, active: item.id === selectedProjectId, onSelect: () => setProject(item.id) }, item.id)) }), _jsx("div", { className: "sections", children: sectionItems.map(([id, label, Icon]) => (_jsxs("button", { className: section === id ? "active navItem" : "navItem", onClick: () => setSection(id), children: [_jsx(Icon, { size: 15 }), " ", label] }, id))) })] }), project.data ? _jsx(ProductionSurface, { project: project.data }) : _jsx("main", { className: "empty", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430." })] }));
}
function ProjectNavItem({ item, active, onSelect }) {
    const queryClient = useQueryClient();
    const clearProject = useUiStore((state) => state.clearProject);
    const selectedProjectId = useUiStore((state) => state.selectedProjectId);
    const mutation = useMutation({
        mutationFn: () => api.delete(`/api/projects/${item.id}`, { projectId: item.id, deleteFiles: false }),
        onSuccess: () => {
            if (selectedProjectId === item.id)
                clearProject();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.removeQueries({ queryKey: ["project", item.id] });
        }
    });
    const removeFromList = (event) => {
        event.stopPropagation();
        if (window.confirm(`Удалить "${item.name}" из списка приложения? Файлы проекта останутся на диске.`)) {
            mutation.mutate();
        }
    };
    return (_jsxs("div", { className: active ? "active projectNavRow" : "projectNavRow", children: [_jsxs("button", { className: "navItem projectNavOpen", onClick: onSelect, children: [_jsx(Folder, { size: 16 }), " ", item.name] }), _jsx("button", { className: "projectNavDelete", disabled: mutation.isPending, onClick: removeFromList, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430", children: _jsx(Trash2, { size: 14 }) })] }));
}
const sectionItems = [
    ["project", "Проект", BookOpen],
    ["characters", "Персонажи", User],
    ["locations", "Локации", Map],
    ["styles", "Стили", Brush],
    ["scenes", "Сцены", Clapperboard],
    ["frames", "Кадры", ImagePlus],
    ["generations", "Генерации", Box],
    ["settings", "Настройки", Settings]
];
function ProjectCreator() {
    const queryClient = useQueryClient();
    const [name, setName] = React.useState("Новый проект");
    const mutation = useMutation({
        mutationFn: () => api.post("/api/projects", { name, description: "Локальный production-проект визуальной новеллы." }),
        onSuccess: (project) => {
            useUiStore.getState().setProject(project.id);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
    return (_jsxs("form", { className: "compactForm", onSubmit: (event) => { event.preventDefault(); mutation.mutate(); }, children: [_jsx("input", { value: name, onChange: (event) => setName(event.target.value) }), _jsx("button", { type: "submit", title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", children: _jsx(Save, { size: 16 }) })] }));
}
function ProjectOpener() {
    const queryClient = useQueryClient();
    const [projectPath, setProjectPath] = React.useState("");
    const mutation = useMutation({
        mutationFn: () => api.post("/api/projects/open", { projectPath }),
        onSuccess: (project) => {
            useUiStore.getState().setProject(project.id);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
    return (_jsxs("form", { className: "compactForm", onSubmit: (event) => { event.preventDefault(); mutation.mutate(); }, children: [_jsx("input", { placeholder: "\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", value: projectPath, onChange: (event) => setProjectPath(event.target.value) }), _jsx("button", { type: "submit", title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", children: _jsx(Folder, { size: 16 }) })] }));
}
function ProductionSurface({ project }) {
    const { section } = useUiStore();
    return (_jsxs(_Fragment, { children: [_jsxs("main", { className: "centerPane", children: [_jsx(ProjectHeader, { project: project }), section === "project" ? _jsx(ProjectOverview, { project: project }) : null, section === "characters" ? _jsx(CharactersScreen, { project: project }) : null, section === "locations" ? _jsx(LocationsScreen, { project: project }) : null, section === "styles" ? _jsx(StylesScreen, { project: project }) : null, section === "scenes" ? _jsx(ScenesScreen, { project: project }) : null, section === "frames" ? _jsx(FrameEditor, { project: project }) : null, section === "generations" ? _jsx(GenerationsScreen, { project: project }) : null, section === "settings" ? _jsx(SettingsScreen, { project: project }) : null] }), _jsx("aside", { className: "rightPane", children: _jsx(ContextPane, { project: project }) })] }));
}
function ContextPane({ project }) {
    const section = useUiStore((state) => state.section);
    if (section === "frames") {
        return (_jsxs(_Fragment, { children: [_jsx(StoryStateEditor, { project: project }), _jsx(ReviewPanel, { project: project })] }));
    }
    if (section === "scenes") {
        return _jsx(StoryStateEditor, { project: project });
    }
    if (section === "generations") {
        return _jsx(ReviewPanel, { project: project });
    }
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h2", { children: "Production checklist" }), _jsxs("div", { className: "refRow", children: [_jsx(User, { size: 15 }), _jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), _jsxs("small", { children: [project.characters.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Box, { size: 15 }), _jsx("span", { children: "\u041E\u0431\u0440\u0430\u0437\u044B" }), _jsxs("small", { children: [project.characters.flatMap((item) => item.outfits).filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438" }), _jsxs("small", { children: [project.locations.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Brush, { size: 15 }), _jsx("span", { children: "\u0421\u0442\u0438\u043B\u0438" }), _jsxs("small", { children: [project.styleProfiles.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] })] }));
}
function ProjectHeader({ project }) {
    return (_jsx("section", { className: "setupWrap", children: _jsx("div", { className: "setupBand", children: _jsxs("div", { children: [_jsx("h1", { children: project.name }), _jsx("p", { children: project.rootPath })] }) }) }));
}
function ProjectOverview({ project }) {
    const queryClient = useQueryClient();
    const firstCharacter = project.characters[0];
    const [characterId, setCharacterId] = React.useState(firstCharacter?.id ?? "");
    const character = project.characters.find((item) => item.id === characterId) ?? firstCharacter;
    const [outfitId, setOutfitId] = React.useState(character?.outfits[0]?.id ?? "");
    const [locationId, setLocationId] = React.useState(project.locations[0]?.id ?? "");
    const location = project.locations.find((item) => item.id === locationId) ?? project.locations[0];
    const [locationAngleId, setLocationAngleId] = React.useState("");
    const [styleProfileId, setStyleProfileId] = React.useState(project.styleProfiles[0]?.id ?? "");
    React.useEffect(() => {
        if (character && !character.outfits.some((outfit) => outfit.id === outfitId)) {
            setOutfitId(character.outfits[0]?.id ?? "");
        }
    }, [character?.id, outfitId]);
    React.useEffect(() => {
        if (location && !location.angles.some((angle) => angle.id === locationAngleId)) {
            setLocationAngleId("");
        }
    }, [location?.id, locationAngleId]);
    const seedBenchmark = useMutation({
        mutationFn: () => api.post(`/api/projects/${project.id}/benchmark/seed`, {
            projectId: project.id,
            characterId,
            outfitId,
            locationId,
            styleProfileId,
            locationAngleId: locationAngleId || undefined
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    const benchmarkReady = Boolean(characterId && outfitId && locationId && styleProfileId);
    return (_jsxs("section", { className: "frameEditor", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "\u0421\u0432\u043E\u0434\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }), _jsxs("button", { disabled: !benchmarkReady || seedBenchmark.isPending, onClick: () => seedBenchmark.mutate(), children: [seedBenchmark.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Clapperboard, { size: 16 }), " \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C benchmark"] })] }), _jsxs("div", { className: "summaryGrid", children: [_jsx(Metric, { label: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438", value: project.characters.length }), _jsx(Metric, { label: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438", value: project.locations.length }), _jsx(Metric, { label: "\u0421\u0442\u0438\u043B\u0438", value: project.styleProfiles.length }), _jsx(Metric, { label: "\u0421\u0446\u0435\u043D\u044B", value: project.scenes.length })] }), _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "Benchmark 20 \u043A\u0430\u0434\u0440\u043E\u0432" }), _jsxs("div", { className: "switchGrid", children: [_jsxs("label", { children: ["\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436", _jsx("select", { value: characterId, onChange: (event) => setCharacterId(event.target.value), children: project.characters.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041E\u0431\u0440\u0430\u0437", _jsx("select", { value: outfitId, onChange: (event) => setOutfitId(event.target.value), children: character?.outfits.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041B\u043E\u043A\u0430\u0446\u0438\u044F", _jsx("select", { value: locationId, onChange: (event) => setLocationId(event.target.value), children: project.locations.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u0420\u0430\u043A\u0443\u0440\u0441", _jsxs("select", { value: locationAngleId, onChange: (event) => setLocationAngleId(event.target.value), children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u0430\u043A\u0443\u0440\u0441\u0430" }), location?.angles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0438\u043B\u044C", _jsx("select", { value: styleProfileId, onChange: (event) => setStyleProfileId(event.target.value), children: project.styleProfiles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] })] }), !benchmarkReady ? _jsx("p", { className: "warning", children: "\u0414\u043B\u044F benchmark \u043D\u0443\u0436\u043D\u044B \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436, \u043E\u0431\u0440\u0430\u0437, \u043B\u043E\u043A\u0430\u0446\u0438\u044F \u0438 \u0441\u0442\u0438\u043B\u044C." }) : null] }), seedBenchmark.data ? _jsxs("p", { className: "muted", children: ["Benchmark-\u0441\u0446\u0435\u043D\u0430 \u0433\u043E\u0442\u043E\u0432\u0430: ", seedBenchmark.data.totalFrames, " \u043A\u0430\u0434\u0440\u043E\u0432, \u043D\u043E\u0432\u044B\u0445 \u0441\u043E\u0437\u0434\u0430\u043D\u043E ", seedBenchmark.data.createdCount, "."] }) : null, _jsx("p", { className: "muted", children: "\u041F\u0440\u043E\u0435\u043A\u0442 self-contained: production database \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0432 `project.sqlite` \u0432\u043D\u0443\u0442\u0440\u0438 \u044D\u0442\u043E\u0439 \u043F\u0430\u043F\u043A\u0438." }), _jsx(DeleteProjectPanel, { project: project })] }));
}
function Metric({ label, value }) {
    return _jsxs("div", { className: "metric", children: [_jsx("strong", { children: value }), _jsx("span", { children: label })] });
}
function emptyCharacterDraft() {
    return {
        name: "",
        description: "",
        age: "",
        height: "",
        bodyDescription: "",
        faceDescription: "",
        hairDescription: "",
        distinctiveFeatures: "",
        immutableFeatures: ""
    };
}
function characterToDraft(character) {
    return {
        name: character.name,
        description: character.description,
        age: character.age,
        height: character.height,
        bodyDescription: character.bodyDescription,
        faceDescription: character.faceDescription,
        hairDescription: character.hairDescription,
        distinctiveFeatures: character.distinctiveFeatures,
        immutableFeatures: character.immutableFeatures
    };
}
function OutfitEditor({ project, outfit, onChanged }) {
    const [draft, setDraft] = React.useState(outfitToDraft(outfit));
    React.useEffect(() => setDraft(outfitToDraft(outfit)), [outfit.id, outfit.name, outfit.description, outfit.immutableFeatures]);
    const updateOutfit = useMutation({
        mutationFn: () => api.put(`/api/outfits/${outfit.id}`, draft),
        onSuccess: onChanged
    });
    const changed = JSON.stringify(draft) !== JSON.stringify(outfitToDraft(outfit));
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: outfit.name }), _jsxs("button", { disabled: !changed || !draft.name.trim() || updateOutfit.isPending, onClick: () => updateOutfit.mutate(), children: [updateOutfit.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0440\u0430\u0437"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043E\u0434\u0435\u0436\u0434\u044B", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0438\u0437\u043C\u0435\u043D\u044F\u0435\u043C\u044B\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B", _jsx("textarea", { value: draft.immutableFeatures, onChange: (event) => setDraft({ ...draft, immutableFeatures: event.target.value }) })] })] }), updateOutfit.error ? _jsx("p", { className: "warning", children: updateOutfit.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "outfit", ownerId: outfit.id, references: outfit.references, slots: outfitSlots, onChanged: onChanged })] }));
}
function outfitToDraft(outfit) {
    return {
        name: outfit.name,
        description: outfit.description,
        immutableFeatures: outfit.immutableFeatures
    };
}
function emptyStyleDraft() {
    return {
        name: "",
        description: "",
        lighting: "",
        colorPalette: "",
        linework: "",
        anatomy: "",
        faces: "",
        shading: "",
        backgroundDetail: "",
        cameraLanguage: "",
        negativeRules: ""
    };
}
function styleToDraft(style) {
    return {
        name: style.name,
        description: style.description,
        lighting: style.lighting,
        colorPalette: style.colorPalette,
        linework: style.linework,
        anatomy: style.anatomy,
        faces: style.faces,
        shading: style.shading,
        backgroundDetail: style.backgroundDetail,
        cameraLanguage: style.cameraLanguage,
        negativeRules: style.negativeRules
    };
}
function emptySceneDraft(project) {
    return {
        name: "",
        description: "",
        locationId: project.locations[0]?.id ?? null,
        styleProfileId: project.styleProfiles[0]?.id ?? null,
        timeDescription: "",
        characterIds: []
    };
}
function sceneToDraft(scene) {
    return {
        name: scene.name,
        description: scene.description,
        locationId: scene.locationId,
        styleProfileId: scene.styleProfileId,
        timeDescription: scene.timeDescription,
        characterIds: scene.characterIds
    };
}
function emptyFrameDraft() {
    return {
        description: "",
        action: "",
        camera: "",
        composition: "",
        lighting: "",
        expressionNotes: "",
        continuityNotes: "",
        generationStrategy: "NEW_COMPOSITION",
        continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
        characterIds: [],
        additionalCharacterReferenceIds: {},
        locationId: null,
        locationAngleId: null,
        styleProfileId: null,
        targetWidth: "1200",
        targetHeight: "675"
    };
}
function frameToDraft(frame) {
    return {
        description: frame.description,
        action: frame.action,
        camera: frame.camera,
        composition: frame.composition,
        lighting: frame.lighting,
        expressionNotes: frame.expressionNotes,
        continuityNotes: frame.continuityNotes,
        generationStrategy: frame.generationStrategy,
        continuityEditContract: frame.continuityEditContract,
        characterIds: frame.characterIds,
        additionalCharacterReferenceIds: frame.additionalCharacterReferenceIds,
        locationId: frame.locationId,
        locationAngleId: frame.locationAngleId,
        styleProfileId: frame.styleProfileId,
        targetWidth: frame.targetWidth ? String(frame.targetWidth) : "",
        targetHeight: frame.targetHeight ? String(frame.targetHeight) : ""
    };
}
function LocationAngleEditor({ project, angle, onChanged }) {
    const [draft, setDraft] = React.useState(locationAngleToDraft(angle));
    React.useEffect(() => setDraft(locationAngleToDraft(angle)), [angle.id, angle.name, angle.cameraPositionDescription]);
    const updateAngle = useMutation({
        mutationFn: () => api.put(`/api/location-angles/${angle.id}`, draft),
        onSuccess: onChanged
    });
    const changed = JSON.stringify(draft) !== JSON.stringify(locationAngleToDraft(angle));
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: angle.name }), _jsxs("button", { disabled: !changed || !draft.name.trim() || updateAngle.isPending, onClick: () => updateAngle.mutate(), children: [updateAngle.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u043A\u0443\u0440\u0441\u0430", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u043C\u0435\u0440\u044B", _jsx("textarea", { value: draft.cameraDescription, onChange: (event) => setDraft({ ...draft, cameraDescription: event.target.value }) })] })] }), updateAngle.error ? _jsx("p", { className: "warning", children: updateAngle.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "locationAngle", ownerId: angle.id, references: angle.references, slots: ["VIEW"], onChanged: onChanged })] }));
}
function locationAngleToDraft(angle) {
    return {
        name: angle.name,
        cameraDescription: angle.cameraPositionDescription
    };
}
function DeleteProjectPanel({ project }) {
    const queryClient = useQueryClient();
    const clearProject = useUiStore((state) => state.clearProject);
    const [deleteFiles, setDeleteFiles] = React.useState(false);
    const [confirmationName, setConfirmationName] = React.useState("");
    const mutation = useMutation({
        mutationFn: () => api.delete(`/api/projects/${project.id}`, {
            projectId: project.id,
            deleteFiles,
            confirmationName: deleteFiles ? confirmationName : undefined
        }),
        onSuccess: () => {
            clearProject();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.removeQueries({ queryKey: ["project", project.id] });
        }
    });
    const canDelete = !deleteFiles || confirmationName === project.name;
    const submit = () => {
        const message = deleteFiles
            ? `Удалить проект "${project.name}" из списка и стереть папку проекта с диска?`
            : `Удалить проект "${project.name}" только из списка приложения? Папка проекта останется на диске.`;
        if (window.confirm(message)) {
            mutation.mutate();
        }
    };
    return (_jsxs("div", { className: "dangerZone", children: [_jsxs("div", { children: [_jsx("h3", { children: "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }), _jsx("p", { className: "muted", children: "\u0411\u0435\u0437 \u0433\u0430\u043B\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442 \u0443\u0434\u0430\u043B\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430. \u041F\u0430\u043F\u043A\u0443 \u043C\u043E\u0436\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0441\u043D\u043E\u0432\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E \u043F\u0443\u0442\u0438." })] }), _jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: deleteFiles, onChange: (event) => setDeleteFiles(event.target.checked) }), " \u0422\u0430\u043A\u0436\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430"] }), deleteFiles ? _jsxs("label", { children: ["\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", _jsx("input", { value: confirmationName, onChange: (event) => setConfirmationName(event.target.value), placeholder: project.name })] }) : null, mutation.error ? _jsx("p", { className: "warning", children: mutation.error.message }) : null, _jsxs("button", { className: "dangerButton", disabled: !canDelete || mutation.isPending, onClick: submit, children: [mutation.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Trash2, { size: 16 }), " \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442"] })] }));
}
function CharactersScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedCharacterId);
    const selectCharacter = useUiStore((state) => state.selectCharacter);
    const selected = project.characters.find((character) => character.id === selectedId) ?? project.characters[0];
    const [draft, setDraft] = React.useState(emptyCharacterDraft());
    const [edit, setEdit] = React.useState(emptyCharacterDraft());
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createCharacter = useMutation({
        mutationFn: () => api.post("/api/characters", { projectId: project.id, ...draft }),
        onSuccess: (character) => {
            selectCharacter(character.id);
            setDraft(emptyCharacterDraft());
            void refresh();
        }
    });
    const updateCharacter = useMutation({
        mutationFn: () => api.put(`/api/characters/${selected?.id}`, edit),
        onSuccess: () => refresh()
    });
    const createOutfit = useMutation({
        mutationFn: (name) => api.post(`/api/characters/${selected?.id}/outfits`, { name, description: "", immutableFeatures: "" }),
        onSuccess: refresh
    });
    React.useEffect(() => {
        if (selected)
            setEdit(characterToDraft(selected));
    }, [selected?.id]);
    const hasCharacterChanges = selected ? JSON.stringify(edit) !== JSON.stringify(characterToDraft(selected)) : false;
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), project.characters.map((character) => (_jsxs("button", { className: character.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectCharacter(character.id), children: [_jsx(User, { size: 15 }), " ", character.name] }, character.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u0418\u043C\u044F", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u0437\u0440\u0430\u0441\u0442", _jsx("input", { value: draft.age, onChange: (event) => setDraft({ ...draft, age: event.target.value }) })] }), _jsxs("label", { children: ["\u0420\u043E\u0441\u0442", _jsx("input", { value: draft.height, onChange: (event) => setDraft({ ...draft, height: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createCharacter.mutate(), children: [_jsx(User, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: selected.name }), _jsxs("button", { disabled: !hasCharacterChanges || !edit.name.trim() || updateCharacter.isPending, onClick: () => updateCharacter.mutate(), children: [updateCharacter.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u0418\u043C\u044F", _jsx("input", { value: edit.name, onChange: (event) => setEdit({ ...edit, name: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u0437\u0440\u0430\u0441\u0442", _jsx("input", { value: edit.age, onChange: (event) => setEdit({ ...edit, age: event.target.value }) })] }), _jsxs("label", { children: ["\u0420\u043E\u0441\u0442", _jsx("input", { value: edit.height, onChange: (event) => setEdit({ ...edit, height: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: edit.description, onChange: (event) => setEdit({ ...edit, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0422\u0435\u043B\u043E", _jsx("textarea", { value: edit.bodyDescription, onChange: (event) => setEdit({ ...edit, bodyDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u0446\u043E", _jsx("textarea", { value: edit.faceDescription, onChange: (event) => setEdit({ ...edit, faceDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u043B\u043E\u0441\u044B", _jsx("textarea", { value: edit.hairDescription, onChange: (event) => setEdit({ ...edit, hairDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u0442\u043B\u0438\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438", _jsx("textarea", { value: edit.distinctiveFeatures, onChange: (event) => setEdit({ ...edit, distinctiveFeatures: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0438\u0437\u043C\u0435\u043D\u044F\u0435\u043C\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438", _jsx("textarea", { value: edit.immutableFeatures, onChange: (event) => setEdit({ ...edit, immutableFeatures: event.target.value }) })] })] }), updateCharacter.error ? _jsx("p", { className: "warning", children: updateCharacter.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "character", ownerId: selected.id, references: selected.references, slots: characterSlots, onChanged: refresh }), _jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u041E\u0431\u0440\u0430\u0437\u044B" }), _jsxs("button", { onClick: () => createOutfit.mutate(`Образ ${selected.outfits.length + 1}`), children: [_jsx(Box, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043E\u0431\u0440\u0430\u0437"] })] }), selected.outfits.map((outfit) => (_jsx(OutfitEditor, { project: project, outfit: outfit, onChanged: refresh }, outfit.id)))] })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430." }) })] }));
}
function LocationsScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedLocationId);
    const selectLocation = useUiStore((state) => state.selectLocation);
    const selected = project.locations.find((location) => location.id === selectedId) ?? project.locations[0];
    const [draft, setDraft] = React.useState({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createLocation = useMutation({
        mutationFn: () => api.post("/api/locations", { projectId: project.id, ...draft }),
        onSuccess: (location) => {
            selectLocation(location.id);
            setDraft({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
            void refresh();
        }
    });
    const createAngle = useMutation({
        mutationFn: (name) => api.post(`/api/locations/${selected?.id}/angles`, { name, description: "", cameraPositionDescription: "" }),
        onSuccess: refresh
    });
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438" }), project.locations.map((location) => (_jsxs("button", { className: location.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectLocation(location.id), children: [_jsx(Map, { size: 15 }), " ", location.name] }, location.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0410\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u0430", _jsx("textarea", { value: draft.architectureDescription, onChange: (event) => setDraft({ ...draft, architectureDescription: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createLocation.mutate(), children: [_jsx(Map, { size: 16 }), " \u041D\u043E\u0432\u0430\u044F \u043B\u043E\u043A\u0430\u0446\u0438\u044F"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsx("h2", { children: selected.name }), _jsx("p", { className: "muted", children: selected.architectureDescription || selected.description }), _jsx(ReferenceSlots, { project: project, ownerType: "location", ownerId: selected.id, references: selected.references, slots: locationSlots, onChanged: refresh }), _jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u0420\u0430\u043A\u0443\u0440\u0441\u044B" }), _jsxs("button", { onClick: () => createAngle.mutate(`Ракурс ${selected.angles.length + 1}`), children: [_jsx(ImagePlus, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u0440\u0430\u043A\u0443\u0440\u0441"] })] }), selected.angles.map((angle) => (_jsx(LocationAngleEditor, { project: project, angle: angle, onChanged: refresh }, angle.id)))] })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u043B\u043E\u043A\u0430\u0446\u0438\u044E." }) })] }));
}
function StylesScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedStyleId);
    const selectStyle = useUiStore((state) => state.selectStyle);
    const selected = project.styleProfiles.find((style) => style.id === selectedId) ?? project.styleProfiles[0];
    const [draft, setDraft] = React.useState(emptyStyleDraft());
    const [edit, setEdit] = React.useState(emptyStyleDraft());
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createStyle = useMutation({
        mutationFn: () => api.post("/api/styles", { projectId: project.id, ...draft }),
        onSuccess: (style) => {
            selectStyle(style.id);
            setDraft(emptyStyleDraft());
            void refresh();
        }
    });
    const updateStyle = useMutation({
        mutationFn: () => api.put(`/api/styles/${selected?.id}`, edit),
        onSuccess: () => refresh()
    });
    React.useEffect(() => {
        if (selected)
            setEdit(styleToDraft(selected));
    }, [selected?.id]);
    const hasStyleChanges = selected ? JSON.stringify(edit) !== JSON.stringify(styleToDraft(selected)) : false;
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u0421\u0442\u0438\u043B\u0438" }), project.styleProfiles.map((style) => (_jsxs("button", { className: style.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectStyle(style.id), children: [_jsx(Brush, { size: 15 }), " ", style.name] }, style.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { value: draft.lighting, onChange: (event) => setDraft({ ...draft, lighting: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createStyle.mutate(), children: [_jsx(Brush, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u0441\u0442\u0438\u043B\u044C"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: selected.name }), _jsxs("button", { disabled: !hasStyleChanges || !edit.name.trim() || updateStyle.isPending, onClick: () => updateStyle.mutate(), children: [updateStyle.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: edit.name, onChange: (event) => setEdit({ ...edit, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: edit.description, onChange: (event) => setEdit({ ...edit, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { value: edit.lighting, onChange: (event) => setEdit({ ...edit, lighting: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u0430\u043B\u0438\u0442\u0440\u0430", _jsx("textarea", { value: edit.colorPalette, onChange: (event) => setEdit({ ...edit, colorPalette: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u043D\u0438\u044F", _jsx("textarea", { value: edit.linework, onChange: (event) => setEdit({ ...edit, linework: event.target.value }) })] }), _jsxs("label", { children: ["\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u044F", _jsx("textarea", { value: edit.anatomy, onChange: (event) => setEdit({ ...edit, anatomy: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u0446\u0430", _jsx("textarea", { value: edit.faces, onChange: (event) => setEdit({ ...edit, faces: event.target.value }) })] }), _jsxs("label", { children: ["\u0428\u0435\u0439\u0434\u0438\u043D\u0433", _jsx("textarea", { value: edit.shading, onChange: (event) => setEdit({ ...edit, shading: event.target.value }) })] }), _jsxs("label", { children: ["\u0424\u043E\u043D\u044B", _jsx("textarea", { value: edit.backgroundDetail, onChange: (event) => setEdit({ ...edit, backgroundDetail: event.target.value }) })] }), _jsxs("label", { children: ["\u041A\u0430\u043C\u0435\u0440\u0430", _jsx("textarea", { value: edit.cameraLanguage, onChange: (event) => setEdit({ ...edit, cameraLanguage: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0433\u0430\u0442\u0438\u0432\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430", _jsx("textarea", { value: edit.negativeRules, onChange: (event) => setEdit({ ...edit, negativeRules: event.target.value }) })] })] }), updateStyle.error ? _jsx("p", { className: "warning", children: updateStyle.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "style", ownerId: selected.id, references: selected.references, slots: ["REF"], onChanged: refresh })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0441\u0442\u0438\u043B\u044C." }) })] }));
}
function ScenesScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const selectScene = useUiStore((state) => state.selectScene);
    const selected = project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0];
    const [draft, setDraft] = React.useState(emptySceneDraft(project));
    const [edit, setEdit] = React.useState(emptySceneDraft(project));
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createScene = useMutation({
        mutationFn: () => api.post("/api/scenes", { projectId: project.id, sequence: project.scenes.length + 1, ...draft }),
        onSuccess: (scene) => {
            selectScene(scene.id);
            setDraft(emptySceneDraft(project));
            void refresh();
        }
    });
    const updateScene = useMutation({
        mutationFn: () => api.put(`/api/scenes/${selected?.id}`, edit),
        onSuccess: () => refresh()
    });
    React.useEffect(() => {
        if (selected)
            setEdit(sceneToDraft(selected));
    }, [selected?.id]);
    const hasSceneChanges = selected ? JSON.stringify(edit) !== JSON.stringify(sceneToDraft(selected)) : false;
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u0421\u0446\u0435\u043D\u044B" }), project.scenes.map((scene) => (_jsxs("button", { className: scene.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectScene(scene.id), children: [_jsx(Clapperboard, { size: 15 }), " S", scene.sequence.toString().padStart(3, "0"), " / ", scene.name] }, scene.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createScene.mutate(), children: [_jsx(Clapperboard, { size: 16 }), " \u041D\u043E\u0432\u0430\u044F \u0441\u0446\u0435\u043D\u0430"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "toolbar", children: [_jsxs("h2", { children: ["S", selected.sequence.toString().padStart(3, "0"), " / ", selected.name] }), _jsxs("button", { disabled: !hasSceneChanges || !edit.name.trim() || updateScene.isPending, onClick: () => updateScene.mutate(), children: [updateScene.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: edit.name, onChange: (event) => setEdit({ ...edit, name: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u0440\u0435\u043C\u044F", _jsx("input", { value: edit.timeDescription, onChange: (event) => setEdit({ ...edit, timeDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u043E\u043A\u0430\u0446\u0438\u044F", _jsxs("select", { value: edit.locationId ?? "", onChange: (event) => setEdit({ ...edit, locationId: event.target.value || null }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430" }), project.locations.map((location) => _jsx("option", { value: location.id, children: location.name }, location.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0438\u043B\u044C", _jsxs("select", { value: edit.styleProfileId ?? "", onChange: (event) => setEdit({ ...edit, styleProfileId: event.target.value || null }), children: [_jsx("option", { value: "", children: "\u041F\u0435\u0440\u0432\u044B\u0439 LOCKED \u0441\u0442\u0438\u043B\u044C" }), project.styleProfiles.map((style) => _jsx("option", { value: style.id, children: style.name }, style.id))] })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B", _jsx("textarea", { value: edit.description, onChange: (event) => setEdit({ ...edit, description: event.target.value }) })] })] }), _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438 \u0441\u0446\u0435\u043D\u044B" }), project.characters.map((character) => (_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: edit.characterIds.includes(character.id), onChange: (event) => setEdit({ ...edit, characterIds: event.target.checked ? [...edit.characterIds, character.id] : edit.characterIds.filter((id) => id !== character.id) }) }), character.name] }, character.id))), _jsx("p", { className: "muted", children: "Outfit \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u0441\u0446\u0435\u043D\u0435: \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043E\u0431\u0440\u0430\u0437 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0437\u0430\u0434\u0430\u0451\u0442\u0441\u044F \u0432 Story State." })] }), updateScene.error ? _jsx("p", { className: "warning", children: updateScene.error.message }) : null, _jsxs("section", { className: "referenceList", children: [_jsx("h3", { children: "\u041A\u0430\u0434\u0440\u044B \u0441\u0446\u0435\u043D\u044B" }), selected.frames.map((frame) => _jsxs("div", { className: "refRow", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: frame.frameCode }), _jsx("small", { children: frame.status })] }, frame.id))] })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u0441\u0446\u0435\u043D\u0443." }) })] }));
}
function FrameEditor({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const selectedFrameId = useUiStore((state) => state.selectedFrameId);
    const selectScene = useUiStore((state) => state.selectScene);
    const selectFrame = useUiStore((state) => state.selectFrame);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
    const frame = scene?.frames.find((item) => item.id === selectedFrameId) ?? scene?.frames[0];
    const [action, setAction] = React.useState("");
    const [frameDraft, setFrameDraft] = React.useState(emptyFrameDraft());
    const [targetWidth, setTargetWidth] = React.useState("1200");
    const [targetHeight, setTargetHeight] = React.useState("675");
    const inheritedLocationId = frameDraft.locationId || scene?.locationId || "";
    const selectedLocation = project.locations.find((location) => location.id === inheritedLocationId) ?? project.locations[0];
    const [selectedExportId, setSelectedExportId] = React.useState("");
    const importInput = React.useRef(null);
    const preview = useQuery({
        queryKey: ["preview", frame?.id],
        queryFn: () => api.get(`/api/frames/${frame?.id}/preview`),
        enabled: Boolean(frame?.id)
    });
    const blockingWarnings = preview.data?.warnings.filter((warning) => warning.severity === "blocking") ?? [];
    const chatGPTExports = useQuery({
        queryKey: ["chatgpt-exports", frame?.id],
        queryFn: () => api.get(`/api/frames/${frame?.id}/exports/chatgpt`),
        enabled: Boolean(frame?.id)
    });
    const newFrameAction = action.trim();
    const hasFrameChanges = frame ? JSON.stringify(frameDraft) !== JSON.stringify(frameToDraft(frame)) : false;
    const createFrame = useMutation({
        mutationFn: () => api.post("/api/frames", {
            sceneId: scene?.id,
            sequence: (scene?.frames.length ?? 0) + 1,
            type: "CG",
            generationStrategy: "NEW_COMPOSITION",
            continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
            action: newFrameAction,
            camera: "medium close-up",
            composition: newFrameAction,
            lighting: "",
            expressionNotes: "",
            continuityNotes: "Прямое продолжение локального состояния сцены.",
            previousFrameId: scene?.frames.at(-1)?.id,
            characterIds: frameDraft.characterIds,
            locationId: frameDraft.locationId || undefined,
            locationAngleId: frameDraft.locationAngleId || undefined,
            styleProfileId: frameDraft.styleProfileId || undefined,
            targetWidth: toPositiveNumber(targetWidth),
            targetHeight: toPositiveNumber(targetHeight)
        }),
        onSuccess: (created) => {
            selectFrame(created.id);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
        }
    });
    const saveFrame = useMutation({
        mutationFn: () => api.put(`/api/frames/${frame?.id}`, {
            ...frameDraft,
            targetWidth: toPositiveNumber(frameDraft.targetWidth),
            targetHeight: toPositiveNumber(frameDraft.targetHeight)
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
        }
    });
    const generate = useMutation({
        mutationFn: (mode) => api.post("/api/generations", { frameId: frame?.id, mode }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    const exportForChatGPT = useMutation({
        mutationFn: async () => {
            if (!frame)
                throw new Error("Выберите кадр для экспорта.");
            const response = await fetch(`/api/frames/${frame.id}/export/chatgpt`, { method: "POST" });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error ?? "Не удалось подготовить экспорт для ChatGPT.");
            }
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") ?? "";
            const fileName = /filename="(?<name>[^"]+)"/u.exec(disposition)?.groups?.name ?? `${frame.frameCode}_CHATGPT.zip`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            return response.headers.get("X-Bearridge-Export-Id") ?? "";
        },
        onSuccess: (exportId) => {
            if (exportId)
                setSelectedExportId(exportId);
            void queryClient.invalidateQueries({ queryKey: ["chatgpt-exports", frame?.id] });
        }
    });
    const importChatGPT = useMutation({
        mutationFn: async (file) => {
            if (!frame || !selectedExportId)
                throw new Error("Выберите ChatGPT export для привязки результата.");
            return api.post(`/api/frames/${frame.id}/import/chatgpt`, {
                exportId: selectedExportId,
                fileName: file.name,
                dataUrl: await readFileAsDataUrl(file)
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
        }
    });
    React.useEffect(() => {
        if (scene)
            selectScene(scene.id);
        if (frame)
            selectFrame(frame.id);
    }, [scene?.id, frame?.id]);
    React.useEffect(() => {
        setFrameDraft(frame ? frameToDraft(frame) : emptyFrameDraft());
    }, [frame?.id, project.id]);
    React.useEffect(() => {
        setSelectedExportId(chatGPTExports.data?.[0]?.exportId ?? "");
    }, [frame?.id, chatGPTExports.data?.[0]?.exportId]);
    React.useEffect(() => {
        if (frameDraft.locationAngleId && selectedLocation && !selectedLocation.angles.some((angle) => angle.id === frameDraft.locationAngleId)) {
            setFrameDraft((current) => ({ ...current, locationAngleId: null }));
        }
    }, [selectedLocation?.id, frameDraft.locationAngleId]);
    return (_jsxs("section", { className: "frameEditor", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("h2", { children: [scene ? `СЦЕНА ${scene.sequence.toString().padStart(3, "0")}` : "СЦЕНА", " / ", frame?.frameCode ?? "КАДР"] }), _jsxs("button", { disabled: !scene || createFrame.isPending, onClick: () => createFrame.mutate(), children: [createFrame.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(ImagePlus, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043A\u0430\u0434\u0440"] }), _jsxs("button", { disabled: !frame || !hasFrameChanges || saveFrame.isPending, onClick: () => saveFrame.mutate(), children: [saveFrame.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u0430\u0434\u0440"] }), _jsxs("button", { disabled: !frame || generate.isPending, onClick: () => generate.mutate("draft"), children: [generate.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Play, { size: 16 }), " Draft"] }), _jsxs("button", { disabled: !frame || generate.isPending || blockingWarnings.length > 0, onClick: () => generate.mutate("production"), children: [_jsx(Play, { size: 16 }), " Production"] }), _jsxs("button", { disabled: !frame || exportForChatGPT.isPending || blockingWarnings.length > 0, onClick: () => exportForChatGPT.mutate(), children: [exportForChatGPT.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Download, { size: 16 }), " Export for ChatGPT"] }), _jsx("input", { ref: importInput, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => { const file = event.target.files?.[0]; if (file)
                            importChatGPT.mutate(file); event.target.value = ""; } }), _jsxs("button", { disabled: !frame || !selectedExportId || importChatGPT.isPending, onClick: () => importInput.current?.click(), children: [importChatGPT.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Upload, { size: 16 }), " Import ChatGPT Result"] })] }), exportForChatGPT.error ? _jsx("p", { className: "warning", children: exportForChatGPT.error.message }) : null, importChatGPT.error ? _jsx("p", { className: "warning", children: importChatGPT.error.message }) : null, frame && chatGPTExports.data?.length ? _jsxs("label", { children: ["ChatGPT export", _jsx("select", { value: selectedExportId, onChange: (event) => setSelectedExportId(event.target.value), children: chatGPTExports.data.map((item) => _jsxs("option", { value: item.exportId, children: [new Date(item.createdAt).toLocaleString(), " \u00B7 ", item.strategy, item.baseFrameCode ? ` · base ${item.baseFrameCode}` : ""] }, item.exportId)) })] }) : null, importChatGPT.data ? _jsxs("div", { className: "versionBlock", children: [_jsx("strong", { children: "Imported ChatGPT result" }), _jsxs("span", { children: [frame?.frameCode, " \u00B7 ", importChatGPT.data.status] }), _jsx("small", { children: "Source: ChatGPT manual import" }), _jsxs("small", { children: ["Strategy: ", frame?.generationStrategy] }), _jsxs("small", { children: ["Export: ", selectedExportId] }), importChatGPT.data.outputFilePath ? _jsx("img", { className: "reviewImage", src: projectFileUrl(project, importChatGPT.data.outputFilePath) }) : null] }) : null, _jsxs("div", { className: "editorGrid", children: [_jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u0421\u0446\u0435\u043D\u0430", _jsx("select", { value: scene?.id ?? "", onChange: (event) => selectScene(event.target.value), children: project.scenes.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041A\u0430\u0434\u0440", _jsxs("select", { value: frame?.id ?? "", onChange: (event) => selectFrame(event.target.value), children: [_jsx("option", { value: "", disabled: true, children: scene?.frames.length ? "Выберите кадр" : "Кадров пока нет" }), scene?.frames.map((item) => _jsx("option", { value: item.id, children: item.frameCode }, item.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438", _jsxs("select", { disabled: !frame, value: frame ? frameDraft.generationStrategy : "NEW_COMPOSITION", onChange: (event) => setFrameDraft({ ...frameDraft, generationStrategy: event.target.value }), children: [_jsx("option", { value: "NEW_COMPOSITION", children: "\u041D\u043E\u0432\u0430\u044F \u043A\u043E\u043C\u043F\u043E\u0437\u0438\u0446\u0438\u044F" }), _jsx("option", { value: "CONTINUE_PREVIOUS_FRAME", children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u0430\u0434\u0440" })] }), _jsx("small", { children: frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Использовать предыдущий закреплённый кадр как визуальную основу и применить контролируемое изменение." : "Создать новую композицию по каноническим референсам." })] }), frame && frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? _jsx(ContinuityEditContractEditor, { contract: frameDraft.continuityEditContract, detected: preview.data?.detectedContinuityChanges ?? [], onChange: (continuityEditContract) => setFrameDraft({ ...frameDraft, continuityEditContract }) }) : null, _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.description : "", onChange: (event) => setFrameDraft({ ...frameDraft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435", _jsx("textarea", { value: frame ? frameDraft.action : action, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, action: event.target.value }) : setAction(event.target.value) })] }), _jsxs("label", { children: ["\u041A\u0430\u043C\u0435\u0440\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.camera : "", onChange: (event) => setFrameDraft({ ...frameDraft, camera: event.target.value }) })] }), _jsxs("label", { children: ["\u041A\u043E\u043C\u043F\u043E\u0437\u0438\u0446\u0438\u044F", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.composition : "", onChange: (event) => setFrameDraft({ ...frameDraft, composition: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.lighting : "", onChange: (event) => setFrameDraft({ ...frameDraft, lighting: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435 / \u043F\u043E\u0437\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.expressionNotes : "", onChange: (event) => setFrameDraft({ ...frameDraft, expressionNotes: event.target.value }) })] }), _jsxs("label", { children: ["Continuity notes", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.continuityNotes : "", onChange: (event) => setFrameDraft({ ...frameDraft, continuityNotes: event.target.value }) })] }), _jsxs("div", { className: "versionBlock", children: [_jsx("div", { className: "toolbar", children: _jsx("h3", { children: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u043A\u0430\u0434\u0440\u0430" }) }), _jsxs("div", { className: "fieldStack", children: [_jsx("label", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), project.characters.map((character) => (_jsxs("div", { className: "versionBlock", children: [_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: frameDraft.characterIds.includes(character.id), onChange: (event) => {
                                                                    setFrameDraft((current) => ({
                                                                        ...current,
                                                                        characterIds: event.target.checked ? [...current.characterIds, character.id] : current.characterIds.filter((id) => id !== character.id),
                                                                        additionalCharacterReferenceIds: event.target.checked ? current.additionalCharacterReferenceIds : { ...current.additionalCharacterReferenceIds, [character.id]: [] }
                                                                    }));
                                                                } }), character.name] }), frameDraft.characterIds.includes(character.id) ? (_jsxs("div", { className: "fieldStack", children: [_jsx("small", { children: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430" }), character.references.filter((reference) => reference.status === "LOCKED" && reference.type !== "MASTER").map((reference) => {
                                                                const selected = frameDraft.additionalCharacterReferenceIds[character.id] ?? [];
                                                                return (_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: selected.includes(reference.id), onChange: (event) => setFrameDraft((current) => ({
                                                                                ...current,
                                                                                additionalCharacterReferenceIds: {
                                                                                    ...current.additionalCharacterReferenceIds,
                                                                                    [character.id]: event.target.checked
                                                                                        ? [...(current.additionalCharacterReferenceIds[character.id] ?? []), reference.id]
                                                                                        : (current.additionalCharacterReferenceIds[character.id] ?? []).filter((id) => id !== reference.id)
                                                                                }
                                                                            })) }), reference.type ?? "OTHER", " \u00B7 ", reference.code] }, reference.id));
                                                            }), !character.references.some((reference) => reference.status === "LOCKED" && reference.type !== "MASTER") ? _jsx("small", { children: "\u041D\u0435\u0442 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 LOCKED \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u043E\u0432." }) : null] })) : null] }, character.id))), _jsxs("label", { children: ["\u041B\u043E\u043A\u0430\u0446\u0438\u044F", _jsxs("select", { value: frameDraft.locationId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, locationId: event.target.value || null }), children: [_jsxs("option", { value: "", children: ["\u0418\u0437 \u0441\u0446\u0435\u043D\u044B", scene?.locationId ? `: ${project.locations.find((item) => item.id === scene.locationId)?.name ?? ""}` : ""] }), project.locations.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0420\u0430\u043A\u0443\u0440\u0441", _jsxs("select", { value: frameDraft.locationAngleId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, locationAngleId: event.target.value || null }), children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u0430\u043A\u0443\u0440\u0441\u0430" }), selectedLocation?.angles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0438\u043B\u044C", _jsxs("select", { value: frameDraft.styleProfileId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, styleProfileId: event.target.value || null }), children: [_jsxs("option", { value: "", children: ["\u0418\u0437 \u0441\u0446\u0435\u043D\u044B", scene?.styleProfileId ? `: ${project.styleProfiles.find((item) => item.id === scene.styleProfileId)?.name ?? ""}` : ""] }), project.styleProfiles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] })] })] }), _jsxs("div", { className: "switchGrid", children: [_jsxs("label", { children: ["\u0428\u0438\u0440\u0438\u043D\u0430 panel", _jsx("input", { value: frame ? frameDraft.targetWidth : targetWidth, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, targetWidth: event.target.value }) : setTargetWidth(event.target.value) })] }), _jsxs("label", { children: ["\u0412\u044B\u0441\u043E\u0442\u0430 panel", _jsx("input", { value: frame ? frameDraft.targetHeight : targetHeight, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, targetHeight: event.target.value }) : setTargetHeight(event.target.value) })] })] })] }), _jsxs("div", { className: "referenceList", children: [_jsx("h3", { children: preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? "Опорное изображение и референсы" : "Подобранные референсы" }), preview.data ? _jsx(FrameContextSummary, { preview: preview.data }) : null, preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "BASE IMAGE" }), _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: preview.data.context.previousLockedFrame?.frameCode ?? "Не найден" }), _jsx("small", { children: preview.data.context.previousLockedFrame?.generationId ?? "Недоступная база" })] })] }) : null, preview.data?.warnings.map((warning) => _jsx("p", { className: warning.severity === "blocking" ? "warning blocking" : "warning", children: warning.message }, `${warning.code}-${warning.entityId}`)), preview.data?.references.map((reference) => _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: reference.label ?? reference.code }), _jsx("small", { children: reference.role ?? referenceKindLabel(reference.kind) })] }, reference.id)), preview.data?.deltaInstructions ? _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "DELTA INSTRUCTIONS" }), _jsx("pre", { children: preview.data.deltaInstructions })] }) : null, _jsx(GeometryPreview, { frame: frame, preview: preview.data, fallbackAspectRatio: project.defaultAspectRatio })] }), _jsxs("div", { className: "promptPreview", children: [_jsx("h3", { children: "Production prompt" }), _jsx("pre", { children: preview.data?.prompt ?? "Создайте или выберите кадр, чтобы увидеть prompt." })] })] })] }));
}
function ContinuityEditContractEditor({ contract, detected, onChange }) {
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "Continuity Edit Contract" }), _jsx("label", { children: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" }), detected.length ? detected.map((change) => _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: change.label }), _jsxs("small", { children: [change.previousValue, " \u2192 ", change.currentValue] })] }, `${change.entityId}-${change.category}`)) : _jsx("small", { children: "\u0414\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u044B\u0439 structured Story State diff \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442." }), _jsx("label", { children: "\u0420\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439" }), _jsx("div", { className: "fieldStack", children: continuityCategories.map((category) => {
                    const automaticallyAllowed = detected.some((change) => change.category === category);
                    const explicitlyAllowed = contract.allowedChanges.includes(category);
                    return _jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: automaticallyAllowed || explicitlyAllowed, disabled: automaticallyAllowed, onChange: (event) => onChange({ ...contract, allowedChanges: event.target.checked ? [...contract.allowedChanges, category] : contract.allowedChanges.filter((item) => item !== category) }) }), category, automaticallyAllowed ? " (обнаружено автоматически)" : ""] }, category);
                }) }), _jsx(MultilineListEditor, { label: "\u042F\u0432\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F", values: contract.changes, onChange: (changes) => onChange({ ...contract, changes }), placeholder: "\u041E\u0434\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" }), _jsx(MultilineListEditor, { label: "\u0417\u0430\u043F\u0440\u0435\u0449\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F", values: contract.forbidden, onChange: (forbidden) => onChange({ ...contract, forbidden }), placeholder: "\u041E\u0434\u043D\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" })] }));
}
function MultilineListEditor({ label, values, placeholder, onChange }) {
    const serializedValues = values.join("\n");
    const [text, setText] = React.useState(serializedValues);
    React.useEffect(() => {
        if (splitLines(text).join("\n") !== serializedValues)
            setText(serializedValues);
    }, [serializedValues, text]);
    return (_jsxs("label", { children: [label, _jsx("textarea", { value: text, onChange: (event) => {
                    setText(event.target.value);
                    onChange(splitLines(event.target.value));
                }, placeholder: placeholder })] }));
}
function StoryStateEditor({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
    const initial = scene?.storyState?.document ?? emptyState(scene?.id ?? "");
    const [state, setState] = React.useState(initial);
    React.useEffect(() => setState(initial), [scene?.id]);
    const save = useMutation({
        mutationFn: () => api.put(`/api/story-state/${scene?.id}`, { document: state }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    if (!scene)
        return _jsx("section", { className: "sideSection", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0441\u0446\u0435\u043D\u0443, \u0447\u0442\u043E\u0431\u044B \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B." });
    return (_jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B" }), _jsx("button", { onClick: () => save.mutate(), children: _jsx(Save, { size: 16 }) })] }), _jsxs("label", { children: ["\u0412\u0440\u0435\u043C\u044F", _jsx("input", { value: state.time.description, onChange: (event) => setState({ ...state, time: { description: event.target.value } }) })] }), _jsx(EnvironmentStateEditor, { state: state, onChange: setState }), project.characters.map((character) => (_jsx(CharacterStateFields, { character: character, state: state, onChange: setState }, character.id))), _jsx(StoryFactsEditor, { state: state, onChange: setState }), _jsxs("details", { children: [_jsx("summary", { children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C raw JSON" }), _jsx("pre", { children: JSON.stringify(state, null, 2) })] })] }));
}
function CharacterStateFields({ character, state, onChange }) {
    const current = state.characters[character.id] ?? { present: false };
    const update = (patch) => {
        onChange({
            ...state,
            characters: {
                ...state.characters,
                [character.id]: { ...current, ...patch }
            }
        });
    };
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: Boolean(current.present), onChange: (event) => update({ present: event.target.checked, outfitId: current.outfitId ?? character.outfits[0]?.id }) }), character.name] }), current.present ? (_jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041E\u0431\u0440\u0430\u0437", _jsxs("select", { value: current.outfitId ?? "", onChange: (event) => update({ outfitId: event.target.value || undefined }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), character.outfits.map((outfit) => _jsx("option", { value: outfit.id, children: outfit.name }, outfit.id))] })] }), _jsxs("label", { children: ["\u042D\u043C\u043E\u0446\u0438\u044F", _jsx("input", { value: current.emotion ?? "", onChange: (event) => update({ emotion: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u043B\u043E\u0441\u044B", _jsx("input", { value: current.hairState ?? "", onChange: (event) => update({ hairState: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u043E\u0437\u0430", _jsx("input", { value: current.pose ?? "", onChange: (event) => update({ pose: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435", _jsx("input", { value: current.locationPosition ?? "", onChange: (event) => update({ locationPosition: event.target.value }) })] }), _jsxs("label", { children: ["\u0412 \u0440\u0443\u043A\u0430\u0445", _jsx("input", { value: (current.heldProps ?? []).join(", "), onChange: (event) => update({ heldProps: splitList(event.target.value) }) })] })] })) : null] }));
}
function EnvironmentStateEditor({ state, onChange }) {
    const entries = Object.entries(state.environment);
    const updateKey = (oldKey, nextKey) => {
        const nextEnvironment = { ...state.environment };
        const value = nextEnvironment[oldKey];
        delete nextEnvironment[oldKey];
        if (nextKey.trim())
            nextEnvironment[nextKey.trim()] = value ?? "";
        onChange({ ...state, environment: nextEnvironment });
    };
    const updateValue = (key, value) => onChange({ ...state, environment: { ...state.environment, [key]: value } });
    const remove = (key) => {
        const nextEnvironment = { ...state.environment };
        delete nextEnvironment[key];
        onChange({ ...state, environment: nextEnvironment });
    };
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u041E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u0435" }), _jsxs("button", { onClick: () => onChange({ ...state, environment: { ...state.environment, [`state_${entries.length + 1}`]: "" } }), children: [_jsx(ImagePlus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), entries.length ? entries.map(([key, value]) => (_jsxs("div", { className: "keyValueRow", children: [_jsx("input", { value: key, onChange: (event) => updateKey(key, event.target.value) }), _jsx("input", { value: String(value ?? ""), onChange: (event) => updateValue(key, event.target.value) }), _jsx("button", { onClick: () => remove(key), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 14 }) })] }, key))) : _jsx("p", { className: "muted", children: "\u041D\u0435\u0442 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043B\u043E\u0432\u0438\u0439 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F." })] }));
}
function StoryFactsEditor({ state, onChange }) {
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u0424\u0430\u043A\u0442\u044B \u0438\u0441\u0442\u043E\u0440\u0438\u0438" }), _jsxs("button", { onClick: () => onChange({ ...state, storyFacts: [...state.storyFacts, ""] }), children: [_jsx(ImagePlus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), state.storyFacts.map((fact, index) => (_jsxs("div", { className: "keyValueRow", children: [_jsx("input", { value: fact, onChange: (event) => onChange({ ...state, storyFacts: state.storyFacts.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }) }), _jsx("button", { onClick: () => onChange({ ...state, storyFacts: state.storyFacts.filter((_, itemIndex) => itemIndex !== index) }), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 14 }) })] }, index)))] }));
}
function FrameContextSummary({ preview }) {
    const presentCharacters = preview.context.characters.map((character) => {
        const state = preview.context.storyState.characters[character.id];
        return `${character.name}${state?.outfitId ? " / образ задан" : ""}`;
    });
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430" }), _jsxs("div", { className: "refRow", children: [_jsx(User, { size: 15 }), _jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), _jsx("small", { children: presentCharacters.join(", ") || "не выбраны" })] }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u044F" }), _jsx("small", { children: preview.context.location?.name ?? "не выбрана" })] }), _jsxs("div", { className: "refRow", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: "\u0420\u0430\u043A\u0443\u0440\u0441" }), _jsx("small", { children: preview.context.locationAngle?.name ?? "не выбран" })] }), _jsxs("div", { className: "refRow", children: [_jsx(Brush, { size: 15 }), _jsx("span", { children: "\u0421\u0442\u0438\u043B\u044C" }), _jsx("small", { children: preview.context.styleProfile?.name ?? "не выбран" })] })] }));
}
function GeometryPreview({ frame, preview, fallbackAspectRatio }) {
    const targetRatio = preview?.geometry.targetAspectRatio ?? frame?.targetAspectRatio ?? parseRatio(fallbackAspectRatio);
    const targetSize = frame?.targetWidth && frame.targetHeight ? `${frame.targetWidth} x ${frame.targetHeight}` : "из настроек проекта";
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "\u0413\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u043A\u0430\u0434\u0440\u0430" }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u0426\u0415\u041B\u0415\u0412\u0410\u042F PANEL" }), _jsxs("small", { children: [targetSize, " / ", targetRatio.toFixed(2), ":1"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: "\u0417\u0410\u041F\u0420\u041E\u0421 GEMINI" }), _jsxs("small", { children: [preview?.geometry.requestedAspectRatio ?? fallbackAspectRatio, " / ", preview?.geometry.requestedResolution ?? "авто", " / ", preview?.geometry.requestedImageSize ?? "1K"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Settings, { size: 15 }), _jsx("span", { children: "\u041F\u041E\u0421\u0422\u041E\u0411\u0420\u0410\u0411\u041E\u0422\u041A\u0410" }), _jsxs("small", { children: ["\u041A\u0440\u043E\u043F: ", preview?.geometry.requiresCrop ? "ДА" : "НЕТ", " / ", preview?.geometry.cropStrategy ?? "NONE"] })] }), preview?.geometry.requiresCrop ? _jsx("p", { className: "warning", children: "\u0426\u0435\u043B\u0435\u0432\u043E\u0439 panel ratio \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F \u043E\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 Gemini. Prompt \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 safe area instruction; crop/editor \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u044D\u0442\u0430\u043F\u043E\u043C." }) : null] }));
}
function ReviewPanel({ project }) {
    const queryClient = useQueryClient();
    const frameId = useUiStore((state) => state.selectedFrameId);
    const frame = project.scenes.flatMap((scene) => scene.frames).find((item) => item.id === frameId);
    const generation = frame?.generations.find((item) => item.id === frame.selectedGenerationId);
    const lock = useMutation({
        mutationFn: () => api.post(`/api/frames/${frame?.id}/lock`, {}),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h2", { children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" }), generation?.outputFilePath ? _jsx("img", { className: "reviewImage", src: projectFileUrl(project, generation.outputFilePath) }) : _jsx("div", { className: "imagePlaceholder", children: "\u041D\u0435\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" }), ["Лицо верное", "Волосы верные", "Одежда верная", "Архитектура верная", "Реквизит верный", "Свет верный", "Стиль совпадает"].map((item) => _jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox" }), " ", item] }, item)), _jsxs("button", { disabled: !generation || generation.status !== "SUCCESS", onClick: () => lock.mutate(), children: [_jsx(Check, { size: 16 }), " \u0423\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u0437\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0434\u0440"] })] }));
}
function GenerationsScreen({ project }) {
    const queryClient = useQueryClient();
    const frames = project.scenes.flatMap((scene) => scene.frames.map((frame) => ({ ...frame, sceneName: scene.name })));
    const selectGeneration = useMutation({
        mutationFn: ({ frameId, generationId }) => api.put(`/api/frames/${frameId}/selected-generation`, { generationId }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    return (_jsxs("section", { className: "referenceList", children: [_jsx("h2", { children: "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" }), frames.map((frame) => (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: frame.frameCode }), _jsx("span", { className: "muted", children: frame.sceneName })] }), frame.generations.length ? frame.generations.map((generation) => {
                        const selected = generation.id === frame.selectedGenerationId;
                        const locked = selected && frame.status === "LOCKED";
                        return _jsxs("label", { className: `versionRow generationCandidate${selected ? " generationCandidateSelected" : ""}`, children: [_jsx("input", { "aria-label": `Select generation ${generation.id}`, checked: selected, disabled: generation.status !== "SUCCESS" || selectGeneration.isPending, name: `selected-generation-${frame.id}`, onChange: () => selectGeneration.mutate({ frameId: frame.id, generationId: generation.id }), type: "radio" }), _jsxs("div", { children: [_jsx("strong", { children: generation.status }), selected ? _jsx("span", { className: "status status-selected", children: "SELECTED" }) : null, locked ? _jsx(StatusBadge, { status: "LOCKED" }) : null, _jsxs("small", { children: [generation.model, " / ", generation.provider] }), _jsxs("small", { children: [generation.generationType, " / ", generation.id.slice(0, 8), " / ", new Date(generation.createdAt).toLocaleString()] }), _jsxs("small", { children: [generation.targetWidth && generation.targetHeight ? `${generation.targetWidth} x ${generation.targetHeight}` : "без target geometry", " / crop ", generation.requiresCrop ? "да" : "нет"] })] }), _jsx("div", { className: "miniActions", children: generation.outputFilePath ? _jsx("img", { src: projectFileUrl(project, generation.outputFilePath) }) : null })] }, generation.id);
                    }) : _jsx("p", { className: "muted", children: "\u0414\u043B\u044F \u043A\u0430\u0434\u0440\u0430 \u0435\u0449\u0451 \u043D\u0435\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0439." })] }, frame.id)))] }));
}
function SettingsScreen({ project }) {
    const queryClient = useQueryClient();
    const health = useQuery({ queryKey: ["health"], queryFn: () => api.get("/api/health") });
    const [draft, setDraft] = React.useState({
        defaultAspectRatio: project.defaultAspectRatio,
        defaultResolution: project.defaultResolution,
        defaultDraftModel: project.defaultDraftModel,
        defaultProductionModel: project.defaultProductionModel
    });
    React.useEffect(() => {
        setDraft({
            defaultAspectRatio: project.defaultAspectRatio,
            defaultResolution: project.defaultResolution,
            defaultDraftModel: project.defaultDraftModel,
            defaultProductionModel: project.defaultProductionModel
        });
    }, [project.id, project.defaultAspectRatio, project.defaultResolution, project.defaultDraftModel, project.defaultProductionModel]);
    const save = useMutation({
        mutationFn: () => api.put(`/api/projects/${project.id}/settings`, { projectId: project.id, ...draft }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    return (_jsxs("section", { className: "fieldStack", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" }), _jsxs("button", { onClick: () => save.mutate(), children: [_jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Settings, { size: 15 }), _jsx("span", { children: "API" }), _jsx("small", { children: health.data?.ok ? `готов / ${health.data.provider}` : "проверка..." })] }), _jsxs("label", { children: ["Fallback aspect ratio", _jsx("input", { value: draft.defaultAspectRatio, onChange: (event) => setDraft({ ...draft, defaultAspectRatio: event.target.value }) })] }), _jsxs("label", { children: ["Fallback resolution", _jsx("input", { value: draft.defaultResolution, onChange: (event) => setDraft({ ...draft, defaultResolution: event.target.value }) })] }), _jsxs("label", { children: ["Draft-\u043C\u043E\u0434\u0435\u043B\u044C", _jsx("input", { value: draft.defaultDraftModel, onChange: (event) => setDraft({ ...draft, defaultDraftModel: event.target.value }) })] }), _jsxs("label", { children: ["Production-\u043C\u043E\u0434\u0435\u043B\u044C", _jsx("input", { value: draft.defaultProductionModel, onChange: (event) => setDraft({ ...draft, defaultProductionModel: event.target.value }) })] })] }));
}
function ReferenceSlots({ project, ownerType, ownerId, references, slots, onChanged }) {
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h3", { children: "\u0420\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B" }), slots.map((slot) => {
                const versions = references.filter((reference) => (reference.type ?? "REF") === slot).sort((left, right) => right.version - left.version);
                const locked = versions.filter((reference) => reference.status === "LOCKED");
                const canonical = locked[0];
                const history = versions.filter((reference) => ownerType === "style" ? reference.status !== "LOCKED" : reference.id !== canonical?.id);
                const styleAtLimit = ownerType === "style" && locked.length >= 6;
                return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("strong", { children: slot }), _jsx(ReferenceUpload, { ownerType: ownerType, ownerId: ownerId, type: slot, label: ownerType === "style" ? "+ Добавить референс" : "Загрузить", onDone: onChanged })] }), ownerType === "style" ? _jsxs("p", { className: "muted", children: ["\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 style refs: ", locked.length, "/6. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A visual style guidance, \u043D\u0435 \u043A\u0430\u043A \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0441\u0446\u0435\u043D\u044B."] }) : null, styleAtLimit ? _jsx("p", { className: "warning", children: "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043B\u0438\u043C\u0438\u0442 6 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 style references. \u0412\u044B\u0432\u0435\u0434\u0438\u0442\u0435 \u043E\u0434\u0438\u043D \u0438\u0437 \u043A\u0430\u043D\u043E\u043D\u0430 \u043F\u0435\u0440\u0435\u0434 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u0435\u043C \u043D\u043E\u0432\u043E\u0433\u043E." }) : null, ownerType === "style" && locked.length ? (_jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 style canon" }), locked.map((reference) => _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: reference, onChanged: onChanged }, reference.id))] })) : canonical ? (_jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0430\u043D\u043E\u043D" }), _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: canonical, onChanged: onChanged })] })) : _jsx("p", { className: "warning", children: "LOCKED-\u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0441\u043B\u043E\u0442\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D." }), history.length ? (_jsxs("details", { children: [_jsxs("summary", { children: ["\u0412\u0435\u0440\u0441\u0438\u0438 \u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B (", history.length, ")"] }), history.map((reference) => _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: reference, onChanged: onChanged }, reference.id))] })) : null, !versions.length ? _jsx("p", { className: "muted", children: "\u0412\u0435\u0440\u0441\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." }) : null] }, slot));
            })] }));
}
function ReferenceUpload({ ownerType, ownerId, type, label, onDone }) {
    const upload = useMutation({
        mutationFn: async (file) => api.post(referenceUploadPath(ownerType, ownerId), { type, fileName: file.name, dataUrl: await readFileAsDataUrl(file), description: "" }),
        onSuccess: onDone
    });
    return (_jsxs("label", { className: "uploadTile compactUpload", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: upload.isPending ? "Загрузка" : label }), _jsx("input", { type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => { const file = event.target.files?.[0]; if (file)
                    upload.mutate(file); } })] }));
}
function ReferenceVersion({ project, ownerType, reference, onChanged }) {
    const approve = useReferenceAction(ownerType, reference.id, "approve", onChanged);
    const reject = useReferenceAction(ownerType, reference.id, "reject", onChanged);
    const lock = useReferenceAction(ownerType, reference.id, "lock", onChanged);
    const deprecate = useReferenceAction(ownerType, reference.id, "deprecate", onChanged);
    return (_jsxs("div", { className: "versionRow", children: [_jsxs("div", { children: [_jsxs("strong", { children: ["V", reference.version] }), " ", _jsx(StatusBadge, { status: reference.status }), _jsx("small", { children: reference.code })] }), _jsxs("div", { className: "miniActions", children: [reference.filePath ? _jsx("img", { src: projectFileUrl(project, reference.filePath) }) : null, _jsxs("button", { disabled: reference.status !== "DRAFT", onClick: () => approve.mutate(), children: [_jsx(Check, { size: 14 }), " \u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C"] }), _jsxs("button", { disabled: reference.status === "LOCKED", onClick: () => lock.mutate(), children: [_jsx(Check, { size: 14 }), " \u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C"] }), _jsxs("button", { disabled: reference.status !== "LOCKED", onClick: () => deprecate.mutate(), children: [_jsx(X, { size: 14 }), " \u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u043A\u0430\u043D\u043E\u043D\u0430"] }), _jsxs("button", { disabled: reference.status === "LOCKED", onClick: () => reject.mutate(), children: [_jsx(X, { size: 14 }), " \u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"] })] })] }));
}
function useReferenceAction(ownerType, referenceId, action, onChanged) {
    return useMutation({
        mutationFn: () => api.post(`/api/references/${ownerType}/${referenceId}/${action}`, {}),
        onSuccess: onChanged
    });
}
function StatusBadge({ status }) {
    return _jsx("span", { className: `status status-${status.toLowerCase()}`, children: status });
}
const characterSlots = ["MASTER", "FRONT", "THREE_QUARTER_LEFT", "THREE_QUARTER_RIGHT", "PROFILE_LEFT", "PROFILE_RIGHT", "FULL_BODY_FRONT", "FULL_BODY_SIDE", "FULL_BODY_BACK", "EXPRESSION", "OTHER"];
const outfitSlots = ["MASTER", "FRONT", "SIDE", "BACK", "DETAIL"];
const locationSlots = ["MASTER", "FLOOR_PLAN", "DETAIL", "OTHER"];
function referenceUploadPath(ownerType, ownerId) {
    if (ownerType === "character")
        return `/api/characters/${ownerId}/references`;
    if (ownerType === "outfit")
        return `/api/outfits/${ownerId}/references`;
    if (ownerType === "location")
        return `/api/locations/${ownerId}/references`;
    if (ownerType === "locationAngle")
        return `/api/location-angles/${ownerId}/references`;
    return `/api/styles/${ownerId}/references`;
}
function projectFileUrl(project, relativePath) {
    const folder = project.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
    return `/project-files/${folder}/${relativePath}`;
}
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}
function environmentLabel(key) {
    const labels = {
        mainLight: "Основной свет",
        curtains: "Шторы",
        window: "Окно",
        door: "Дверь"
    };
    return labels[key] ?? key;
}
function referenceKindLabel(kind) {
    const labels = {
        character: "персонаж",
        outfit: "образ",
        location: "локация",
        "location-angle": "ракурс локации",
        style: "стиль",
        prop: "реквизит",
        "previous-frame": "предыдущий кадр"
    };
    return labels[kind] ?? kind;
}
function emptyState(sceneId) {
    return {
        sceneId,
        time: { description: "" },
        environment: {},
        characters: {},
        props: {},
        storyFacts: []
    };
}
function splitList(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function splitLines(value) {
    return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}
function toPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}
function parseRatio(value) {
    const [width, height] = value.split(":").map(Number);
    return width && height ? width / height : 16 / 9;
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
