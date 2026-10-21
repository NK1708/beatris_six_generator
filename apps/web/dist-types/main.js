import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { BookOpen, Box, Brush, Check, Clapperboard, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, User } from "lucide-react";
import "./styles.css";
const queryClient = new QueryClient();
const useUiStore = create((set) => ({
    selectedProjectId: null,
    selectedSceneId: null,
    selectedFrameId: null,
    setProject: (id) => set({ selectedProjectId: id, selectedSceneId: null, selectedFrameId: null }),
    selectScene: (id) => set({ selectedSceneId: id }),
    selectFrame: (id) => set({ selectedFrameId: id })
}));
const api = {
    async get(url) {
        const response = await fetch(url);
        return parseResponse(response);
    },
    async post(url, body) {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return parseResponse(response);
    },
    async put(url, body) {
        const response = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return parseResponse(response);
    }
};
async function parseResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Request failed");
    }
    return data;
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(Workspace, {}) }));
}
function Workspace() {
    const { selectedProjectId, setProject } = useUiStore();
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
    return (_jsxs("div", { className: "appShell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand", children: [_jsx(Clapperboard, { size: 18 }), " Bearridge"] }), _jsx(ProjectCreator, {}), _jsx("nav", { children: projects.data?.map((item) => (_jsxs("button", { className: item.id === selectedProjectId ? "active navItem" : "navItem", onClick: () => setProject(item.id), children: [_jsx(Folder, { size: 16 }), " ", item.name] }, item.id))) }), _jsx("div", { className: "sections", children: [
                            ["Project", BookOpen],
                            ["Characters", User],
                            ["Locations", Map],
                            ["Props", Box],
                            ["Styles", Brush],
                            ["Scenes", Clapperboard],
                            ["Frames", ImagePlus],
                            ["Settings", Settings]
                        ].map(([label, Icon]) => (_jsxs("span", { children: [_jsx(Icon, { size: 15 }), " ", label] }, label))) })] }), project.data ? _jsx(ProductionSurface, { project: project.data }) : _jsx("main", { className: "empty", children: "Create or open a local VN project." })] }));
}
function ProjectCreator() {
    const queryClient = useQueryClient();
    const [name, setName] = React.useState("After Dark");
    const mutation = useMutation({
        mutationFn: () => api.post("/api/projects", { name, description: "Local AI visual novel production project." }),
        onSuccess: (project) => {
            useUiStore.getState().setProject(project.id);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
    return (_jsxs("form", { className: "compactForm", onSubmit: (event) => { event.preventDefault(); mutation.mutate(); }, children: [_jsx("input", { value: name, onChange: (event) => setName(event.target.value) }), _jsx("button", { type: "submit", title: "Create project", children: _jsx(Save, { size: 16 }) })] }));
}
function ProductionSurface({ project }) {
    const { selectedSceneId, selectedFrameId, selectScene, selectFrame } = useUiStore();
    const selectedScene = project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0];
    const selectedFrame = selectedScene?.frames.find((frame) => frame.id === selectedFrameId) ?? selectedScene?.frames[0];
    React.useEffect(() => {
        if (selectedScene && selectedScene.id !== selectedSceneId) {
            selectScene(selectedScene.id);
        }
        if (selectedFrame && selectedFrame.id !== selectedFrameId) {
            selectFrame(selectedFrame.id);
        }
    }, [selectedScene, selectedFrame, selectedSceneId, selectedFrameId, selectScene, selectFrame]);
    return (_jsxs(_Fragment, { children: [_jsxs("main", { className: "centerPane", children: [_jsx(ProjectSetup, { project: project }), _jsx(FrameEditor, { project: project, scene: selectedScene, frame: selectedFrame })] }), _jsxs("aside", { className: "rightPane", children: [_jsx(StoryStateEditor, { project: project, scene: selectedScene }), _jsx(ReviewPanel, { frame: selectedFrame })] })] }));
}
function ProjectSetup({ project }) {
    const queryClient = useQueryClient();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const firstCharacter = project.characters[0];
    const firstOutfit = firstCharacter?.outfits[0];
    const firstLocation = project.locations[0];
    const firstStyle = project.styleProfiles[0];
    const createCharacter = useMutation({ mutationFn: () => api.post("/api/characters", { projectId: project.id, name: "Anna", description: "Main heroine", hairDescription: "loose hair", immutableFeatures: "preserve face, age, proportions" }), onSuccess: refresh });
    const createOutfit = useMutation({ mutationFn: () => api.post(`/api/characters/${firstCharacter?.id}/outfits`, { name: "Home 03", description: "Soft home outfit for night bedroom scenes." }), onSuccess: refresh });
    const createLocation = useMutation({ mutationFn: () => api.post("/api/locations", { projectId: project.id, name: "Bedroom", architectureDescription: "cozy bedroom with bed, desk and bedside lamp", immutableFeatures: "bed position, window and main furniture stay fixed" }), onSuccess: refresh });
    const createStyle = useMutation({ mutationFn: () => api.post("/api/styles", { projectId: project.id, name: "INTERIOR_NIGHT", description: "VN cinematic illustration", lighting: "warm practical light and cool ambient window light", colorPalette: "amber, blue, graphite, skin tones", negativeRules: "do not become photorealistic" }), onSuccess: refresh });
    const createScene = useMutation({ mutationFn: () => api.post("/api/scenes", { projectId: project.id, sequence: project.scenes.length + 1, name: `Scene ${project.scenes.length + 1}`, locationId: project.locations[0]?.id, timeDescription: "02:17" }), onSuccess: refresh });
    return (_jsxs("section", { className: "setupWrap", children: [_jsxs("div", { className: "setupBand", children: [_jsxs("div", { children: [_jsx("h1", { children: project.name }), _jsx("p", { children: project.rootPath })] }), _jsxs("button", { onClick: () => createCharacter.mutate(), children: [_jsx(User, { size: 16 }), " Anna"] }), _jsxs("button", { disabled: !firstCharacter, onClick: () => createOutfit.mutate(), children: [_jsx(Box, { size: 16 }), " Outfit"] }), _jsxs("button", { onClick: () => createLocation.mutate(), children: [_jsx(Map, { size: 16 }), " Bedroom"] }), _jsxs("button", { onClick: () => createStyle.mutate(), children: [_jsx(Brush, { size: 16 }), " Style"] }), _jsxs("button", { onClick: () => createScene.mutate(), children: [_jsx(Clapperboard, { size: 16 }), " Scene"] })] }), _jsxs("div", { className: "assetStrip", children: [_jsx(AssetUpload, { disabled: !firstCharacter, label: "Anna master", path: firstCharacter ? `/api/characters/${firstCharacter.id}/references` : "", type: "MASTER", onDone: refresh }), _jsx(AssetUpload, { disabled: !firstOutfit, label: "Outfit master", path: firstOutfit ? `/api/outfits/${firstOutfit.id}/references` : "", type: "FRONT", onDone: refresh }), _jsx(AssetUpload, { disabled: !firstLocation, label: "Bedroom master", path: firstLocation ? `/api/locations/${firstLocation.id}/references` : "", type: "MASTER", onDone: refresh }), _jsx(AssetUpload, { disabled: !firstStyle, label: "Style ref", path: firstStyle ? `/api/styles/${firstStyle.id}/references` : "", type: "STYLE", onDone: refresh })] })] }));
}
function AssetUpload({ disabled, label, path, type, onDone }) {
    const upload = useMutation({
        mutationFn: async (file) => {
            const dataUrl = await readFileAsDataUrl(file);
            return api.post(path, { type, fileName: file.name, dataUrl, status: "LOCKED" });
        },
        onSuccess: onDone
    });
    return (_jsxs("label", { className: disabled ? "uploadTile disabled" : "uploadTile", children: [_jsx(ImagePlus, { size: 16 }), _jsx("span", { children: upload.isPending ? "Uploading" : label }), _jsx("input", { disabled: disabled, type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        upload.mutate(file);
                    }
                } })] }));
}
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}
function FrameEditor({ project, scene, frame }) {
    const queryClient = useQueryClient();
    const [action, setAction] = React.useState("Anna sits on the bed and reads a message on her phone");
    const preview = useQuery({
        queryKey: ["preview", frame?.id],
        queryFn: () => api.get(`/api/frames/${frame?.id}/preview`),
        enabled: Boolean(frame?.id)
    });
    const createFrame = useMutation({
        mutationFn: () => api.post("/api/frames", {
            sceneId: scene?.id,
            sequence: (scene?.frames.length ?? 0) + 1,
            type: "CG",
            action,
            camera: "medium close-up, 50mm equivalent",
            composition: "Anna sits on the edge of the bed, three-quarter angle, looking down at her phone.",
            lighting: "Warm bedside lamp from camera-right, dim cool ambient window light.",
            expressionNotes: "Anxious, subtle tension, not crying.",
            continuityNotes: "Direct continuation of local Story State.",
            previousFrameId: scene?.frames.at(-1)?.id
        }),
        onSuccess: (created) => {
            useUiStore.getState().selectFrame(created.id);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
        }
    });
    const generate = useMutation({
        mutationFn: () => api.post("/api/generations", { frameId: frame?.id, mode: "draft" }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
        }
    });
    return (_jsxs("section", { className: "frameEditor", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("h2", { children: [scene ? `SCENE ${scene.sequence.toString().padStart(3, "0")}` : "SCENE", " / ", frame?.frameCode ?? "FRAME"] }), _jsxs("button", { disabled: !scene, onClick: () => createFrame.mutate(), children: [_jsx(ImagePlus, { size: 16 }), " Frame"] }), _jsxs("button", { disabled: !frame || generate.isPending, onClick: () => generate.mutate(), children: [generate.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Play, { size: 16 }), " Generate"] })] }), _jsxs("div", { className: "editorGrid", children: [_jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["TYPE", _jsx("input", { readOnly: true, value: frame?.type ?? "CG" })] }), _jsxs("label", { children: ["ACTION", _jsx("textarea", { value: frame?.action ?? action, onChange: (event) => setAction(event.target.value) })] }), _jsxs("label", { children: ["CAMERA", _jsx("textarea", { readOnly: true, value: frame?.camera ?? "medium close-up" })] }), _jsxs("label", { children: ["EXPRESSION", _jsx("textarea", { readOnly: true, value: frame?.expressionNotes ?? "Anxious" })] })] }), _jsxs("div", { className: "referenceList", children: [_jsx("h3", { children: "References" }), preview.data?.warnings.map((warning) => _jsx("p", { className: "warning", children: warning }, warning)), preview.data?.references.map((reference) => (_jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), " ", _jsx("span", { children: reference.code }), _jsx("small", { children: reference.kind })] }, reference.id)))] }), _jsxs("div", { className: "promptPreview", children: [_jsx("h3", { children: "Auto Prompt" }), _jsx("pre", { children: preview.data?.prompt ?? "Create a frame to preview the generated production prompt." })] })] })] }));
}
function StoryStateEditor({ project, scene }) {
    const queryClient = useQueryClient();
    const initial = scene?.storyState?.document ?? emptyState(scene?.id ?? "");
    const [state, setState] = React.useState(initial);
    React.useEffect(() => setState(initial), [scene?.id]);
    const save = useMutation({
        mutationFn: () => api.put(`/api/story-state/${scene?.id}`, { document: state }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    if (!scene) {
        return _jsx("section", { className: "sideSection", children: "Create a scene to edit Story State." });
    }
    const firstCharacter = project.characters[0];
    const firstOutfit = firstCharacter?.outfits[0];
    return (_jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "Story State" }), _jsx("button", { onClick: () => save.mutate(), children: _jsx(Save, { size: 16 }) })] }), _jsxs("label", { children: ["Time", _jsx("input", { value: state.time.description, onChange: (event) => setState({ ...state, time: { description: event.target.value } }) })] }), _jsx("div", { className: "switchGrid", children: ["mainLight", "curtains", "window", "door"].map((key) => (_jsxs("label", { children: [key, _jsxs("select", { value: state.environment[key], onChange: (event) => setState({ ...state, environment: { ...state.environment, [key]: event.target.value } }), children: [_jsx("option", { value: key === "mainLight" ? "on" : "open", children: key === "mainLight" ? "on" : "open" }), _jsx("option", { value: key === "mainLight" ? "off" : "closed", children: key === "mainLight" ? "off" : "closed" })] })] }, key))) }), firstCharacter ? (_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: Boolean(state.characters[firstCharacter.id]?.present), onChange: (event) => setState({
                            ...state,
                            characters: {
                                ...state.characters,
                                [firstCharacter.id]: {
                                    present: event.target.checked,
                                    outfitId: firstOutfit?.id,
                                    emotion: "anxious",
                                    hairState: "loose",
                                    locationPosition: "bed",
                                    heldProps: ["phone"]
                                }
                            }
                        }) }), firstCharacter.name, " present"] })) : null, _jsxs("details", { children: [_jsx("summary", { children: "View raw JSON" }), _jsx("pre", { children: JSON.stringify(state, null, 2) })] })] }));
}
function ReviewPanel({ frame }) {
    const queryClient = useQueryClient();
    const generation = frame?.generations.find((item) => item.id === frame.selectedGenerationId) ?? frame?.generations.at(-1);
    const lock = useMutation({
        mutationFn: () => api.post(`/api/frames/${frame?.id}/lock`, { generationId: generation?.id }),
        onSuccess: () => queryClient.invalidateQueries()
    });
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h2", { children: "Review" }), generation?.outputFilePath ? _jsx("img", { className: "reviewImage", src: `/project-files/${generation.outputFilePath}` }) : _jsx("div", { className: "imagePlaceholder", children: "No generation" }), ["Face correct", "Hair correct", "Clothing correct", "Architecture correct", "Props correct", "Lighting correct", "Style matches"].map((item) => (_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox" }), " ", item] }, item))), _jsxs("button", { disabled: !generation || generation.status !== "SUCCESS", onClick: () => lock.mutate(), children: [_jsx(Check, { size: 16 }), " Approve & Lock"] })] }));
}
function emptyState(sceneId) {
    return {
        sceneId,
        time: { description: "" },
        environment: { mainLight: "off", curtains: "closed", window: "closed", door: "closed" },
        characters: {},
        props: {},
        storyFacts: []
    };
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
