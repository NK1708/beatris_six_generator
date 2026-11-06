import React from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Clapperboard, Folder, ImagePlus, LayoutGrid, Loader2, Map, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Shirt, ChevronRight, Save, Settings, Trash2, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { confirmFrameNavigation, readWorkspaceContext, type SavedWorkspaceContext, useUiStore } from "../state.js";
import type { Project, RegistryProject, Section } from "../model.js";
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
  if (window.matchMedia("(max-width: 760px)").matches) useUiStore.setState({ navigationCollapsed: true });
}
function canLeaveForProject() {
  if (!confirmFrameNavigation(useUiStore.getState(), true)) return false;
  useUiStore.getState().setFrameDraftDirty(false);
  useUiStore.getState().setSceneDraftDirty(false);
  return true;
}
export function Workspace() {
  const { selectedProjectId, setProject, section, setSection, navigationCollapsed, toggleNavigation, selectedSceneId, selectedFrameId, frameDraftDirty } = useUiStore();
  const [rightCollapsed, setRightCollapsed] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [activatedId, setActivatedId] = React.useState<string | null>(null);
  const [lastContext] = React.useState(readWorkspaceContext);
  const [resuming, setResuming] = React.useState<SavedWorkspaceContext | null>(null);
  const [contextNotice, setContextNotice] = React.useState("");
  React.useEffect(() => { closeMobileNavigation(); }, []);
  const projectMutations = useIsMutating({ mutationKey: ["studio-project"] });
  const activatingMutations = useIsMutating({ mutationKey: ["studio-project"], predicate: mutation => mutation.options.meta?.activatesProject === true });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<RegistryProject[]>("/api/projects") });
  const project = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: async () => {
      const result = await activateSequentially(() => api.get<Project>(`/api/projects/${encodeURIComponent(selectedProjectId!)}/full`));
      setActivatedId(result.id);
      return result;
    },
    enabled: Boolean(selectedProjectId), retry: false, refetchOnWindowFocus: false
  });
  const busy = project.isFetching || projectMutations > 0;
  React.useEffect(() => {
    if (!resuming || !project.data || project.isFetching || project.data.id !== resuming.projectId) return;
    useUiStore.getState().restoreContext(project.data, resuming);
    const scene = project.data.scenes.find(item => item.id === resuming.sceneId);
    if ((resuming.sceneId && !scene) || (resuming.frameId && !scene?.frames.some(item => item.id === resuming.frameId))) setContextNotice("Проект открыт. Сохранённая сцена или кадр больше недоступны — выберите актуальные.");
    setResuming(null);
  }, [resuming, project.data, project.isFetching]);
  const hasContext = Boolean(project.data && activatedId === selectedProjectId && !activatingMutations && !resuming);
  const hasRight = !guideOpen && hasContext && !["storyboard", "frames", "scenes"].includes(section);
  const scene = project.data?.scenes.find(item => item.id === selectedSceneId);
  const frame = scene?.frames.find(item => item.id === selectedFrameId);
  const sectionLabel = guideOpen ? "Руководство" : sectionItems.find(([id]) => id === section)?.[1] ?? "Проект";
  return <ProjectBusyContext.Provider value={busy}>
    <div className={`studioShell${navigationCollapsed ? " navigationCollapsed" : ""}${hasRight && !rightCollapsed ? " withContextPane" : ""}`}>
      <header className="studioHeader">
        <div className="studioIdentity"><Clapperboard size={20} /><strong>Bearridge <span>Studio</span></strong></div>
        <div className="studioBreadcrumbs" aria-label="Текущий контекст">
          <span>{selectedProjectId ? project.data?.name ?? "Открытие проекта" : "Проект не открыт"}</span>
          <ChevronRight size={14} /><strong>{sectionLabel}</strong>
          {scene && ["frames", "storyboard", "scenes"].includes(section) ? <><ChevronRight size={14} /><span>{scene.name}</span></> : null}
          {frame && section === "frames" ? <><ChevronRight size={14} /><span>{frame.frameCode}</span></> : null}
        </div>
        {section === "frames" && frameDraftDirty ? <span className="status status-unsaved">Кадр не сохранён</span> : null}
        {hasRight ? <button className="shellIconButton" type="button" aria-controls="studio-context" aria-expanded={!rightCollapsed} aria-label={rightCollapsed ? "Развернуть правую панель" : "Свернуть правую панель"} title={rightCollapsed ? "Развернуть правую панель" : "Свернуть правую панель"} onClick={() => setRightCollapsed(value => !value)}>{rightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button> : null}
      </header>
      <aside className="studioNavigation" aria-label="Навигация Studio">
        <div className="studioNavHeading"><span>РАБОЧЕЕ ПРОСТРАНСТВО</span><button className="shellIconButton" type="button" aria-controls="studio-nav-content" aria-expanded={!navigationCollapsed} aria-label={navigationCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"} title={navigationCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"} onClick={toggleNavigation}>{navigationCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
        <nav id="studio-nav-content" className="studioSections" aria-label="Разделы проекта">
          {sectionItems.map(([id, label, Icon]) => <button type="button" title={label} aria-label={label} aria-current={!guideOpen && section === id ? "page" : undefined} disabled={!selectedProjectId || busy} className={!guideOpen && section === id ? "active navItem" : "navItem"} key={id} onClick={() => { setSection(id); if (useUiStore.getState().section === id) setGuideOpen(false); closeMobileNavigation(); }}><Icon size={18} /><span>{label}</span></button>)}
          <button type="button" title="Руководство" aria-label="Руководство" aria-current={guideOpen ? "page" : undefined} className={guideOpen ? "active navItem" : "navItem"} onClick={() => { setGuideOpen(true); closeMobileNavigation(); }}><BookOpen size={18} /><span>Руководство</span></button>
        </nav>
        <div className="studioProjects">
          <h2>Проекты</h2><ProjectCreator /><ProjectOpener />
          {projects.isError ? <p className="warning" role="alert">Не удалось загрузить проекты. <button onClick={() => void projects.refetch()}>Повторить</button></p> : null}
          <nav aria-label="Выбор проекта">{projects.data?.map(item => <ProjectNavItem key={item.id} item={item} active={item.id === selectedProjectId} onSelect={() => { setResuming(null); setContextNotice(""); setProject(item.id); closeMobileNavigation(); }} />)}</nav>
        </div>
        <div className="studioNavFooter"><span>Локальная студия</span><small>Проекты и изображения на вашем диске</small></div>
      </aside>
      {hasContext && project.data ? <>
        {contextNotice ? <div className="studioContextNotice" role="status">{contextNotice}<button type="button" aria-label="Скрыть уведомление" onClick={() => setContextNotice("")}><X size={14} /></button></div> : null}
        <ProductionSurface project={project.data} showContextPane={!rightCollapsed} hidden={guideOpen} />
      </> : <main className="studioWelcome" hidden={guideOpen} style={guideOpen ? { display: "none" } : undefined}>
        {selectedProjectId ? <div className="studioWelcomeContent"><span className="studioEyebrow">ПРОЕКТ</span><h1>{project.isError ? "Не удалось открыть проект" : "Открытие рабочего пространства"}</h1>{project.isError ? <><p role="alert">{project.error.message}</p><p className="muted">Проверьте доступность папки или выберите другой проект в навигации.</p><button disabled={busy} onClick={() => void project.refetch()}>Повторить открытие</button><button className="secondaryButton" onClick={() => { setResuming(null); useUiStore.getState().clearProject(); }}>К выбору проекта</button></> : <p role="status"><Loader2 className="spin" size={18} /> Загрузка локальных данных…</p>}</div> : <div className="studioWelcomeContent"><span className="studioEyebrow">BEARRIDGE STUDIO</span><h1>История начинается<br />с первого кадра.</h1><p>Создавайте персонажей, выстраивайте сцены и сохраняйте визуальную непрерывность вашей новеллы.</p>{lastContext ? <button disabled={busy} onClick={() => { setResuming(lastContext); setProject(lastContext.projectId); }}> <Folder size={17} /> Продолжить последний проект</button> : null}<div className="studioWelcomeSteps"><div><User size={19} /><strong>Подготовьте мир</strong><span>Персонажи, образы и канонические референсы.</span></div><div><Clapperboard size={19} /><strong>Поставьте сцену</strong><span>Состав, состояние истории и намерение кадра.</span></div><div><ImagePlus size={19} /><strong>Продолжите историю</strong><span>Результаты, проверка и закреплённые кадры.</span></div></div><p className="muted">Создайте проект или откройте его папку в левой панели.</p>{navigationCollapsed ? <button className="secondaryButton" onClick={toggleNavigation}>Показать проекты</button> : null}</div>}
      </main>}
      {guideOpen ? <React.Suspense fallback={<main className="centerPane" role="status">Загрузка руководства…</main>}><UserGuide onBack={() => setGuideOpen(false)} /></React.Suspense> : null}
    </div>
  </ProjectBusyContext.Provider>;
}

function ProjectNavItem({ item, active, onSelect }: { item: RegistryProject; active: boolean; onSelect(): void }) {
  const queryClient = useQueryClient();
  const clearProject = useUiStore((state) => state.clearProject);
  const selectedProjectId = useUiStore((state) => state.selectedProjectId);
  const mutation = useMutation({
    mutationKey: ["studio-project"],
    mutationFn: () => activateSequentially(() => api.delete(`/api/projects/${item.id}`, { projectId: item.id, deleteFiles: false })),
    onSuccess: () => {
      if (useUiStore.getState().selectedProjectId === item.id) clearProject();
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.removeQueries({ queryKey: ["project", item.id] });
    }
  });
  const busy = React.useContext(ProjectBusyContext);
  const removeFromList = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!busy && window.confirm(`Удалить "${item.name}" из списка приложения? Файлы проекта останутся на диске.`) && (selectedProjectId !== item.id || canLeaveForProject())) {
      mutation.mutate();
    }
  };
  return (
    <div className={active ? "active projectNavRow" : "projectNavRow"}>
      <button className="navItem projectNavOpen" disabled={busy} title={item.name} onClick={onSelect}><Folder size={16} /> {item.name}</button>
      <button className="projectNavDelete" disabled={busy || mutation.isPending} onClick={removeFromList} aria-label={`Удалить ${item.name} из списка`} title="Удалить из списка"><Trash2 size={14} /></button>
    </div>
  );
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
] as const;

function ProjectCreator() {
  const busy = React.useContext(ProjectBusyContext);
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("Новый проект");
  const mutation = useMutation({
    mutationKey: ["studio-project"],
    meta: { activatesProject: true },
    mutationFn: () => activateSequentially(() => api.post<Project>("/api/projects", { name, description: "Локальный production-проект визуальной новеллы." })),
    onSuccess: (project) => {
      useUiStore.getState().setProject(project.id);
      closeMobileNavigation();
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
  return (
    <form className="compactForm" onSubmit={(event) => { event.preventDefault(); if (!busy && name.trim() && canLeaveForProject()) mutation.mutate(); }}>
      <input aria-label="Название нового проекта" disabled={busy} value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" disabled={busy || !name.trim()} aria-label="Создать проект" title="Создать проект"><Save size={16} /></button>
      {mutation.error ? <p className="warning" role="alert">{mutation.error.message}</p> : null}
    </form>
  );
}

function ProjectOpener() {
  const busy = React.useContext(ProjectBusyContext);
  const queryClient = useQueryClient();
  const [projectPath, setProjectPath] = React.useState("");
  const mutation = useMutation({
    mutationKey: ["studio-project"],
    meta: { activatesProject: true },
    mutationFn: () => activateSequentially(() => api.post<Project>("/api/projects/open", { projectPath })),
    onSuccess: (project) => {
      useUiStore.getState().setProject(project.id);
      closeMobileNavigation();
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
  return (
    <form className="compactForm" onSubmit={(event) => { event.preventDefault(); if (!busy && projectPath.trim() && canLeaveForProject()) mutation.mutate(); }}>
      <input aria-label="Путь к папке проекта" disabled={busy} placeholder="Путь к папке проекта" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
      <button type="submit" disabled={busy || !projectPath.trim()} aria-label="Открыть проект" title="Открыть проект"><Folder size={16} /></button>
      {mutation.error ? <p className="warning" role="alert">{mutation.error.message}</p> : null}
    </form>
  );
}

export function ProductionSurface({ project, section: sectionOverride, showContextPane = true, hidden = false }: { project: Project; section?: Section; showContextPane?: boolean; hidden?: boolean }) {
  const selectedSection = useUiStore((state) => state.section);
  const section = sectionOverride ?? selectedSection;
  return (
    <>
      <main hidden={hidden} style={hidden ? { display: "none" } : undefined} className={section === "frames" ? "centerPane storyboardMain frameWorkspaceMain" : section === "storyboard" ? "centerPane storyboardMain" : section === "scenes" ? "centerPane sceneCatalogMain" : "centerPane"}>
        {section !== "storyboard" && section !== "frames" && section !== "scenes" ? <ProjectHeader project={project} /> : null}
        {section === "project" ? <ProjectOverview project={project} /> : null}
        {section === "characters" || section === "outfits" ? <CharactersScreen project={project} outfitsOnly={section === "outfits"} /> : null}
        {section === "locations" ? <LocationsScreen project={project} /> : null}
        {section === "styles" ? <StylesScreen project={project} /> : null}
        {section === "scenes" ? <ScenesScreen project={project} /> : null}
        {section === "storyboard" ? <StoryboardScreen project={project} /> : null}
        {section === "frames" ? <FrameEditor project={project} /> : null}
        {section === "generations" ? <GenerationsScreen project={project} /> : null}
        {section === "settings" ? <SettingsScreen project={project} /> : null}
        {section === "advanced" ? <AdvancedToolsScreen project={project} /> : null}
      </main>
      {showContextPane && section !== "storyboard" && section !== "frames" && section !== "scenes" ? <aside hidden={hidden} style={hidden ? { display: "none" } : undefined} className="rightPane" id="studio-context" aria-label="Контекст раздела">
        <ContextPane project={project} section={section} />
      </aside> : null}
    </>
  );
}

export function ContextPane({ project, section: sectionOverride }: { project: Project; section?: Section }) {
  const selectedSection = useUiStore((state) => state.section);
  const selectedFrameId = useUiStore((state) => state.selectedFrameId);
  const reviewFrameId = useUiStore((state) => state.reviewFrameId);
  const reviewGenerationId = useUiStore((state) => state.reviewGenerationId);
  const section = sectionOverride ?? selectedSection;
  const target = resolveReviewTarget(project, section, selectedFrameId, reviewFrameId, reviewGenerationId);
  if (section === "scenes") {
    return <StoryStateEditor project={project} />;
  }
  if (section === "generations") {
    return <ReviewPanel project={project} target={target} />;
  }
  return (
    <section className="sideSection">
      <h2>Production checklist</h2>
      <div className="refRow"><User size={15} /><span>Персонажи</span><small>{project.characters.filter((item) => item.status === "LOCKED").length} LOCKED</small></div>
      <div className="refRow"><Box size={15} /><span>Образы</span><small>{project.characters.flatMap((item) => item.outfits).filter((item) => item.status === "LOCKED").length} LOCKED</small></div>
      <div className="refRow"><Map size={15} /><span>Локации</span><small>{project.locations.filter((item) => item.status === "LOCKED").length} LOCKED</small></div>
      <div className="refRow"><Brush size={15} /><span>Стили</span><small>{project.styleProfiles.filter((item) => item.status === "LOCKED").length} LOCKED</small></div>
    </section>
  );
}

function ProjectHeader({ project }: { project: Project }) {
  return (
    <section className="setupWrap">
      <div className="setupBand">
        <div>
          <h1>{project.name}</h1>
          <p>{project.rootPath}</p>
        </div>
      </div>
    </section>
  );
}
