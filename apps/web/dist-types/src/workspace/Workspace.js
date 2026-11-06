import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Clapperboard, Folder, ImagePlus, LayoutGrid, Loader2, Map, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Shirt, ChevronRight, Save, Settings, Trash2, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { confirmFrameNavigation, readWorkspaceContext, useUiStore } from "../state.js";
import { AdvancedToolsScreen, ProjectOverview } from "../screens/ProjectScreen.js";
import { CharactersScreen, LocationsScreen, StylesScreen } from "../screens/AssetLibrary.js";
import { ScenesScreen } from "../screens/ScenesScreen.js";
import { FrameEditor, StoryStateEditor } from "../screens/FrameWorkspace.js";
import { GenerationsScreen, ReviewPanel } from "../screens/GenerationsScreen.js";
import { SettingsScreen } from "../screens/SettingsScreen.js";
import { StoryboardScreen } from "../screens/StoryboardScreen.js";
import { resolveReviewTarget } from "../reviewTarget.js";
import { activateSequentially } from "./projectActivation.js";
const UserGuide = React.lazy(() => import("../screens/UserGuide.js").then(module => ({ default: module.UserGuide })));
const ProjectBusyContext = React.createContext(false);
function closeMobileNavigation() {
    if (window.matchMedia("(max-width: 760px)").matches)
        useUiStore.setState({ navigationCollapsed: true });
}
function canLeaveForProject() {
    if (!confirmFrameNavigation(useUiStore.getState(), true))
        return false;
    useUiStore.getState().setFrameDraftDirty(false);
    useUiStore.getState().setSceneDraftDirty(false);
    return true;
}
export function Workspace() {
    const { selectedProjectId, setProject, section, setSection, navigationCollapsed, toggleNavigation, selectedSceneId, selectedFrameId, frameDraftDirty } = useUiStore();
    const [rightCollapsed, setRightCollapsed] = React.useState(false);
    const [guideOpen, setGuideOpen] = React.useState(false);
    const [activatedId, setActivatedId] = React.useState(null);
    const [lastContext] = React.useState(readWorkspaceContext);
    const [resuming, setResuming] = React.useState(null);
    const [contextNotice, setContextNotice] = React.useState("");
    React.useEffect(() => { closeMobileNavigation(); }, []);
    const projectMutations = useIsMutating({ mutationKey: ["studio-project"] });
    const activatingMutations = useIsMutating({ mutationKey: ["studio-project"], predicate: mutation => mutation.options.meta?.activatesProject === true });
    const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get("/api/projects") });
    const project = useQuery({
        queryKey: ["project", selectedProjectId],
        queryFn: async () => {
            const result = await activateSequentially(() => api.get(`/api/projects/${encodeURIComponent(selectedProjectId)}/full`));
            setActivatedId(result.id);
            return result;
        },
        enabled: Boolean(selectedProjectId), retry: false, refetchOnWindowFocus: false
    });
    const busy = project.isFetching || projectMutations > 0;
    React.useEffect(() => {
        if (!resuming || !project.data || project.isFetching || project.data.id !== resuming.projectId)
            return;
        useUiStore.getState().restoreContext(project.data, resuming);
        const scene = project.data.scenes.find(item => item.id === resuming.sceneId);
        if ((resuming.sceneId && !scene) || (resuming.frameId && !scene?.frames.some(item => item.id === resuming.frameId)))
            setContextNotice("Проект открыт. Сохранённая сцена или кадр больше недоступны — выберите актуальные.");
        setResuming(null);
    }, [resuming, project.data, project.isFetching]);
    const hasContext = Boolean(project.data && activatedId === selectedProjectId && !activatingMutations && !resuming);
    const hasRight = !guideOpen && hasContext && !["storyboard", "frames", "scenes"].includes(section);
    const scene = project.data?.scenes.find(item => item.id === selectedSceneId);
    const frame = scene?.frames.find(item => item.id === selectedFrameId);
    const sectionLabel = guideOpen ? "Руководство" : sectionItems.find(([id]) => id === section)?.[1] ?? "Проект";
    return _jsx(ProjectBusyContext.Provider, { value: busy, children: _jsxs("div", { className: `studioShell${navigationCollapsed ? " navigationCollapsed" : ""}${hasRight && !rightCollapsed ? " withContextPane" : ""}`, children: [_jsxs("header", { className: "studioHeader", children: [_jsxs("div", { className: "studioIdentity", children: [_jsx(Clapperboard, { size: 20 }), _jsxs("strong", { children: ["Bearridge ", _jsx("span", { children: "Studio" })] })] }), _jsxs("div", { className: "studioBreadcrumbs", "aria-label": "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442", children: [_jsx("span", { children: selectedProjectId ? project.data?.name ?? "Открытие проекта" : "Проект не открыт" }), _jsx(ChevronRight, { size: 14 }), _jsx("strong", { children: sectionLabel }), scene && ["frames", "storyboard", "scenes"].includes(section) ? _jsxs(_Fragment, { children: [_jsx(ChevronRight, { size: 14 }), _jsx("span", { children: scene.name })] }) : null, frame && section === "frames" ? _jsxs(_Fragment, { children: [_jsx(ChevronRight, { size: 14 }), _jsx("span", { children: frame.frameCode })] }) : null] }), section === "frames" && frameDraftDirty ? _jsx("span", { className: "status status-unsaved", children: "\u041A\u0430\u0434\u0440 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D" }) : null, hasRight ? _jsx("button", { className: "shellIconButton", type: "button", "aria-controls": "studio-context", "aria-expanded": !rightCollapsed, "aria-label": rightCollapsed ? "Развернуть правую панель" : "Свернуть правую панель", title: rightCollapsed ? "Развернуть правую панель" : "Свернуть правую панель", onClick: () => setRightCollapsed(value => !value), children: rightCollapsed ? _jsx(PanelRightOpen, { size: 18 }) : _jsx(PanelRightClose, { size: 18 }) }) : null] }), _jsxs("aside", { className: "studioNavigation", "aria-label": "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F Studio", children: [_jsxs("div", { className: "studioNavHeading", children: [_jsx("span", { children: "\u0420\u0410\u0411\u041E\u0427\u0415\u0415 \u041F\u0420\u041E\u0421\u0422\u0420\u0410\u041D\u0421\u0422\u0412\u041E" }), _jsx("button", { className: "shellIconButton", type: "button", "aria-controls": "studio-nav-content", "aria-expanded": !navigationCollapsed, "aria-label": navigationCollapsed ? "Развернуть навигацию" : "Свернуть навигацию", title: navigationCollapsed ? "Развернуть навигацию" : "Свернуть навигацию", onClick: toggleNavigation, children: navigationCollapsed ? _jsx(PanelLeftOpen, { size: 18 }) : _jsx(PanelLeftClose, { size: 18 }) })] }), _jsxs("nav", { id: "studio-nav-content", className: "studioSections", "aria-label": "\u0420\u0430\u0437\u0434\u0435\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430", children: [sectionItems.map(([id, label, Icon]) => _jsxs("button", { type: "button", title: label, "aria-label": label, "aria-current": !guideOpen && section === id ? "page" : undefined, disabled: !selectedProjectId || busy, className: !guideOpen && section === id ? "active navItem" : "navItem", onClick: () => { setSection(id); if (useUiStore.getState().section === id)
                                        setGuideOpen(false); closeMobileNavigation(); }, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: label })] }, id)), _jsxs("button", { type: "button", title: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E", "aria-label": "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E", "aria-current": guideOpen ? "page" : undefined, className: guideOpen ? "active navItem" : "navItem", onClick: () => { setGuideOpen(true); closeMobileNavigation(); }, children: [_jsx(BookOpen, { size: 18 }), _jsx("span", { children: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E" })] })] }), _jsxs("div", { className: "studioProjects", children: [_jsx("h2", { children: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B" }), _jsx(ProjectCreator, {}), _jsx(ProjectOpener, {}), projects.isError ? _jsxs("p", { className: "warning", role: "alert", children: ["\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442\u044B. ", _jsx("button", { onClick: () => void projects.refetch(), children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C" })] }) : null, _jsx("nav", { "aria-label": "\u0412\u044B\u0431\u043E\u0440 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", children: projects.data?.map(item => _jsx(ProjectNavItem, { item: item, active: item.id === selectedProjectId, onSelect: () => { setResuming(null); setContextNotice(""); setProject(item.id); closeMobileNavigation(); } }, item.id)) })] }), _jsxs("div", { className: "studioNavFooter", children: [_jsx("span", { children: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0443\u0434\u0438\u044F" }), _jsx("small", { children: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0434\u0438\u0441\u043A\u0435" })] })] }), hasContext && project.data ? _jsxs(_Fragment, { children: [contextNotice ? _jsxs("div", { className: "studioContextNotice", role: "status", children: [contextNotice, _jsx("button", { type: "button", "aria-label": "\u0421\u043A\u0440\u044B\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", onClick: () => setContextNotice(""), children: _jsx(X, { size: 14 }) })] }) : null, _jsx(ProductionSurface, { project: project.data, showContextPane: !rightCollapsed, hidden: guideOpen })] }) : _jsx("main", { className: "studioWelcome", hidden: guideOpen, style: guideOpen ? { display: "none" } : undefined, children: selectedProjectId ? _jsxs("div", { className: "studioWelcomeContent", children: [_jsx("span", { className: "studioEyebrow", children: "\u041F\u0420\u041E\u0415\u041A\u0422" }), _jsx("h1", { children: project.isError ? "Не удалось открыть проект" : "Открытие рабочего пространства" }), project.isError ? _jsxs(_Fragment, { children: [_jsx("p", { role: "alert", children: project.error.message }), _jsx("p", { className: "muted", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u043F\u0430\u043F\u043A\u0438 \u0438\u043B\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u0432 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u0438." }), _jsx("button", { disabled: busy, onClick: () => void project.refetch(), children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0435" }), _jsx("button", { className: "secondaryButton", onClick: () => { setResuming(null); useUiStore.getState().clearProject(); }, children: "\u041A \u0432\u044B\u0431\u043E\u0440\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" })] }) : _jsxs("p", { role: "status", children: [_jsx(Loader2, { className: "spin", size: 18 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445\u2026"] })] }) : _jsxs("div", { className: "studioWelcomeContent", children: [_jsx("span", { className: "studioEyebrow", children: "BEARRIDGE STUDIO" }), _jsxs("h1", { children: ["\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F", _jsx("br", {}), "\u0441 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430."] }), _jsx("p", { children: "\u0421\u043E\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439, \u0432\u044B\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0439\u0442\u0435 \u0441\u0446\u0435\u043D\u044B \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0439\u0442\u0435 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0443\u044E \u043D\u0435\u043F\u0440\u0435\u0440\u044B\u0432\u043D\u043E\u0441\u0442\u044C \u0432\u0430\u0448\u0435\u0439 \u043D\u043E\u0432\u0435\u043B\u043B\u044B." }), lastContext ? _jsxs("button", { disabled: busy, onClick: () => { setResuming(lastContext); setProject(lastContext.projectId); }, children: [" ", _jsx(Folder, { size: 17 }), " \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442"] }) : null, _jsxs("div", { className: "studioWelcomeSteps", children: [_jsxs("div", { children: [_jsx(User, { size: 19 }), _jsx("strong", { children: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u043C\u0438\u0440" }), _jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438, \u043E\u0431\u0440\u0430\u0437\u044B \u0438 \u043A\u0430\u043D\u043E\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B." })] }), _jsxs("div", { children: [_jsx(Clapperboard, { size: 19 }), _jsx("strong", { children: "\u041F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0446\u0435\u043D\u0443" }), _jsx("span", { children: "\u0421\u043E\u0441\u0442\u0430\u0432, \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0438 \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430." })] }), _jsxs("div", { children: [_jsx(ImagePlus, { size: 19 }), _jsx("strong", { children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u044E" }), _jsx("span", { children: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B, \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0435 \u043A\u0430\u0434\u0440\u044B." })] })] }), _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0433\u043E \u043F\u0430\u043F\u043A\u0443 \u0432 \u043B\u0435\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438." }), navigationCollapsed ? _jsx("button", { className: "secondaryButton", onClick: toggleNavigation, children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442\u044B" }) : null] }) }), guideOpen ? _jsx(React.Suspense, { fallback: _jsx("main", { className: "centerPane", role: "status", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u0430\u2026" }), children: _jsx(UserGuide, { onBack: () => setGuideOpen(false) }) }) : null] }) });
}
function ProjectNavItem({ item, active, onSelect }) {
    const queryClient = useQueryClient();
    const clearProject = useUiStore((state) => state.clearProject);
    const selectedProjectId = useUiStore((state) => state.selectedProjectId);
    const mutation = useMutation({
        mutationKey: ["studio-project"],
        mutationFn: () => activateSequentially(() => api.delete(`/api/projects/${item.id}`, { projectId: item.id, deleteFiles: false })),
        onSuccess: () => {
            if (useUiStore.getState().selectedProjectId === item.id)
                clearProject();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.removeQueries({ queryKey: ["project", item.id] });
        }
    });
    const busy = React.useContext(ProjectBusyContext);
    const removeFromList = (event) => {
        event.stopPropagation();
        if (!busy && window.confirm(`Удалить "${item.name}" из списка приложения? Файлы проекта останутся на диске.`) && (selectedProjectId !== item.id || canLeaveForProject())) {
            mutation.mutate();
        }
    };
    return (_jsxs("div", { className: active ? "active projectNavRow" : "projectNavRow", children: [_jsxs("button", { className: "navItem projectNavOpen", disabled: busy, title: item.name, onClick: onSelect, children: [_jsx(Folder, { size: 16 }), " ", item.name] }), _jsx("button", { className: "projectNavDelete", disabled: busy || mutation.isPending, onClick: removeFromList, "aria-label": `Удалить ${item.name} из списка`, title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430", children: _jsx(Trash2, { size: 14 }) })] }));
}
const sectionItems = [
    ["project", "Проект", BookOpen],
    ["scenes", "Сцены", Clapperboard],
    ["characters", "Персонажи", User],
    ["outfits", "Образы", Shirt],
    ["locations", "Локации", Map],
    ["styles", "Стили", Brush],
    ["storyboard", "Раскадровка", LayoutGrid],
    ["frames", "Кадры", ImagePlus],
    ["generations", "История генераций", Box],
    ["settings", "Настройки", Settings],
    ["advanced", "Дополнительно", Wrench]
];
function ProjectCreator() {
    const busy = React.useContext(ProjectBusyContext);
    const queryClient = useQueryClient();
    const [name, setName] = React.useState("Новый проект");
    const mutation = useMutation({
        mutationKey: ["studio-project"],
        meta: { activatesProject: true },
        mutationFn: () => activateSequentially(() => api.post("/api/projects", { name, description: "Локальный production-проект визуальной новеллы." })),
        onSuccess: (project) => {
            useUiStore.getState().setProject(project.id);
            closeMobileNavigation();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
    return (_jsxs("form", { className: "compactForm", onSubmit: (event) => { event.preventDefault(); if (!busy && name.trim() && canLeaveForProject())
            mutation.mutate(); }, children: [_jsx("input", { "aria-label": "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043D\u043E\u0432\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430", disabled: busy, value: name, onChange: (event) => setName(event.target.value) }), _jsx("button", { type: "submit", disabled: busy || !name.trim(), "aria-label": "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", children: _jsx(Save, { size: 16 }) }), mutation.error ? _jsx("p", { className: "warning", role: "alert", children: mutation.error.message }) : null] }));
}
function ProjectOpener() {
    const busy = React.useContext(ProjectBusyContext);
    const queryClient = useQueryClient();
    const [projectPath, setProjectPath] = React.useState("");
    const mutation = useMutation({
        mutationKey: ["studio-project"],
        meta: { activatesProject: true },
        mutationFn: () => activateSequentially(() => api.post("/api/projects/open", { projectPath })),
        onSuccess: (project) => {
            useUiStore.getState().setProject(project.id);
            closeMobileNavigation();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
    return (_jsxs("form", { className: "compactForm", onSubmit: (event) => { event.preventDefault(); if (!busy && projectPath.trim() && canLeaveForProject())
            mutation.mutate(); }, children: [_jsx("input", { "aria-label": "\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", disabled: busy, placeholder: "\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", value: projectPath, onChange: (event) => setProjectPath(event.target.value) }), _jsx("button", { type: "submit", disabled: busy || !projectPath.trim(), "aria-label": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442", children: _jsx(Folder, { size: 16 }) }), mutation.error ? _jsx("p", { className: "warning", role: "alert", children: mutation.error.message }) : null] }));
}
export function ProductionSurface({ project, section: sectionOverride, showContextPane = true, hidden = false }) {
    const selectedSection = useUiStore((state) => state.section);
    const section = sectionOverride ?? selectedSection;
    return (_jsxs(_Fragment, { children: [_jsxs("main", { hidden: hidden, style: hidden ? { display: "none" } : undefined, className: section === "frames" ? "centerPane storyboardMain frameWorkspaceMain" : section === "storyboard" ? "centerPane storyboardMain" : section === "scenes" ? "centerPane sceneCatalogMain" : "centerPane", children: [section !== "storyboard" && section !== "frames" && section !== "scenes" ? _jsx(ProjectHeader, { project: project }) : null, section === "project" ? _jsx(ProjectOverview, { project: project }) : null, section === "characters" || section === "outfits" ? _jsx(CharactersScreen, { project: project, outfitsOnly: section === "outfits" }) : null, section === "locations" ? _jsx(LocationsScreen, { project: project }) : null, section === "styles" ? _jsx(StylesScreen, { project: project }) : null, section === "scenes" ? _jsx(ScenesScreen, { project: project }) : null, section === "storyboard" ? _jsx(StoryboardScreen, { project: project }) : null, section === "frames" ? _jsx(FrameEditor, { project: project }) : null, section === "generations" ? _jsx(GenerationsScreen, { project: project }) : null, section === "settings" ? _jsx(SettingsScreen, { project: project }) : null, section === "advanced" ? _jsx(AdvancedToolsScreen, { project: project }) : null] }), showContextPane && section !== "storyboard" && section !== "frames" && section !== "scenes" ? _jsx("aside", { hidden: hidden, style: hidden ? { display: "none" } : undefined, className: "rightPane", id: "studio-context", "aria-label": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0440\u0430\u0437\u0434\u0435\u043B\u0430", children: _jsx(ContextPane, { project: project, section: section }) }) : null] }));
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
