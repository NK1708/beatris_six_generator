import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Clapperboard, Folder, ImagePlus, LayoutGrid, Map, Menu, Save, Settings, Trash2, User, Wrench } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import { AdvancedToolsScreen, ProjectOverview } from "../screens/ProjectScreen.js";
import { CharactersScreen, LocationsScreen, StylesScreen } from "../screens/AssetLibrary.js";
import { ScenesScreen } from "../screens/ScenesScreen.js";
import { FrameEditor, StoryStateEditor } from "../screens/FrameWorkspace.js";
import { GenerationsScreen, ReviewPanel } from "../screens/GenerationsScreen.js";
import { SettingsScreen } from "../screens/SettingsScreen.js";
import { StoryboardScreen } from "../screens/StoryboardScreen.js";
import { resolveReviewTarget } from "../reviewTarget.js";
export function Workspace() {
    const { selectedProjectId, setProject, section, setSection } = useUiStore();
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
    const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get("/api/projects") });
    const project = useQuery({
        queryKey: ["project", selectedProjectId],
        queryFn: () => api.get(`/api/projects/${selectedProjectId}/full`),
        enabled: Boolean(selectedProjectId)
    });
    return (_jsxs("div", { className: "appShell", children: [_jsxs("aside", { className: mobileMenuOpen ? "sidebar mobileOpen" : "sidebar", children: [_jsxs("div", { className: "sidebarTop", children: [_jsxs("div", { className: "brand", children: [_jsx(Clapperboard, { size: 18 }), " Bearridge"] }), _jsx("button", { className: "mobileMenuButton", type: "button", "aria-expanded": mobileMenuOpen, "aria-label": mobileMenuOpen ? "Свернуть меню" : "Открыть меню", title: mobileMenuOpen ? "Свернуть меню" : "Открыть меню", onClick: () => setMobileMenuOpen((open) => !open), children: _jsx(Menu, { size: 18 }) })] }), _jsxs("div", { className: "sidebarContent", children: [_jsx(ProjectCreator, {}), _jsx(ProjectOpener, {}), _jsx("nav", { children: projects.data?.map((item) => _jsx(ProjectNavItem, { item: item, active: item.id === selectedProjectId, onSelect: () => { setProject(item.id); setMobileMenuOpen(false); } }, item.id)) }), _jsx("div", { className: "sections", children: sectionItems.map(([id, label, Icon]) => (_jsxs("button", { className: section === id ? "active navItem" : "navItem", onClick: () => { setSection(id); setMobileMenuOpen(false); }, children: [_jsx(Icon, { size: 15 }), " ", label] }, id))) })] })] }), project.data ? _jsx(ProductionSurface, { project: project.data }) : _jsx("main", { className: "empty", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430." })] }));
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
    ["storyboard", "Раскадровка", LayoutGrid],
    ["frames", "Кадры", ImagePlus],
    ["generations", "Генерации", Box],
    ["settings", "Настройки", Settings],
    ["advanced", "Дополнительно", Wrench]
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
export function ProductionSurface({ project, section: sectionOverride }) {
    const selectedSection = useUiStore((state) => state.section);
    const section = sectionOverride ?? selectedSection;
    return (_jsxs(_Fragment, { children: [_jsxs("main", { className: section === "frames" ? "centerPane storyboardMain frameWorkspaceMain" : section === "storyboard" ? "centerPane storyboardMain" : section === "scenes" ? "centerPane sceneCatalogMain" : "centerPane", children: [section !== "storyboard" && section !== "frames" && section !== "scenes" ? _jsx(ProjectHeader, { project: project }) : null, section === "project" ? _jsx(ProjectOverview, { project: project }) : null, section === "characters" ? _jsx(CharactersScreen, { project: project }) : null, section === "locations" ? _jsx(LocationsScreen, { project: project }) : null, section === "styles" ? _jsx(StylesScreen, { project: project }) : null, section === "scenes" ? _jsx(ScenesScreen, { project: project }) : null, section === "storyboard" ? _jsx(StoryboardScreen, { project: project }) : null, section === "frames" ? _jsx(FrameEditor, { project: project }) : null, section === "generations" ? _jsx(GenerationsScreen, { project: project }) : null, section === "settings" ? _jsx(SettingsScreen, { project: project }) : null, section === "advanced" ? _jsx(AdvancedToolsScreen, { project: project }) : null] }), section !== "storyboard" && section !== "frames" && section !== "scenes" ? _jsx("aside", { className: "rightPane", children: _jsx(ContextPane, { project: project, section: section }) }) : null] }));
}
export function ContextPane({ project, section: sectionOverride }) {
    const selectedSection = useUiStore((state) => state.section);
    const selectedFrameId = useUiStore((state) => state.selectedFrameId);
    const reviewFrameId = useUiStore((state) => state.reviewFrameId);
    const reviewGenerationId = useUiStore((state) => state.reviewGenerationId);
    const section = sectionOverride ?? selectedSection;
    const target = resolveReviewTarget(project, section, selectedFrameId, reviewFrameId, reviewGenerationId);
    if (section === "scenes") {
        return _jsx(StoryStateEditor, { project: project });
    }
    if (section === "generations") {
        return _jsx(ReviewPanel, { project: project, target: target });
    }
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h2", { children: "Production checklist" }), _jsxs("div", { className: "refRow", children: [_jsx(User, { size: 15 }), _jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), _jsxs("small", { children: [project.characters.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Box, { size: 15 }), _jsx("span", { children: "\u041E\u0431\u0440\u0430\u0437\u044B" }), _jsxs("small", { children: [project.characters.flatMap((item) => item.outfits).filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438" }), _jsxs("small", { children: [project.locations.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Brush, { size: 15 }), _jsx("span", { children: "\u0421\u0442\u0438\u043B\u0438" }), _jsxs("small", { children: [project.styleProfiles.filter((item) => item.status === "LOCKED").length, " LOCKED"] })] })] }));
}
function ProjectHeader({ project }) {
    return (_jsx("section", { className: "setupWrap", children: _jsx("div", { className: "setupBand", children: _jsxs("div", { children: [_jsx("h1", { children: project.name }), _jsx("p", { children: project.rootPath })] }) }) }));
}
