import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, LayoutGrid, Loader2, Map, Menu, Play, Save, Settings, Trash2, Upload, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
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
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<RegistryProject[]>("/api/projects") });
  const project = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => api.get<Project>(`/api/projects/${selectedProjectId}/full`),
    enabled: Boolean(selectedProjectId)
  });

  return (
    <div className="appShell">
      <aside className={mobileMenuOpen ? "sidebar mobileOpen" : "sidebar"}>
        <div className="sidebarTop"><div className="brand"><Clapperboard size={18} /> Bearridge</div><button className="mobileMenuButton" type="button" aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? "Свернуть меню" : "Открыть меню"} title={mobileMenuOpen ? "Свернуть меню" : "Открыть меню"} onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={18} /></button></div>
        <div className="sidebarContent">
        <ProjectCreator />
        <ProjectOpener />
        <nav>
          {projects.data?.map((item) => <ProjectNavItem key={item.id} item={item} active={item.id === selectedProjectId} onSelect={() => { setProject(item.id); setMobileMenuOpen(false); }} />)}
        </nav>
        <div className="sections">
          {sectionItems.map(([id, label, Icon]) => (
            <button className={section === id ? "active navItem" : "navItem"} key={id} onClick={() => { setSection(id); setMobileMenuOpen(false); }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        </div>
      </aside>
      {project.data ? <ProductionSurface project={project.data} /> : <main className="empty">Создайте проект или откройте существующую папку проекта.</main>}
    </div>
  );
}

function ProjectNavItem({ item, active, onSelect }: { item: RegistryProject; active: boolean; onSelect(): void }) {
  const queryClient = useQueryClient();
  const clearProject = useUiStore((state) => state.clearProject);
  const selectedProjectId = useUiStore((state) => state.selectedProjectId);
  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/projects/${item.id}`, { projectId: item.id, deleteFiles: false }),
    onSuccess: () => {
      if (selectedProjectId === item.id) clearProject();
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.removeQueries({ queryKey: ["project", item.id] });
    }
  });
  const removeFromList = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (window.confirm(`Удалить "${item.name}" из списка приложения? Файлы проекта останутся на диске.`)) {
      mutation.mutate();
    }
  };
  return (
    <div className={active ? "active projectNavRow" : "projectNavRow"}>
      <button className="navItem projectNavOpen" onClick={onSelect}><Folder size={16} /> {item.name}</button>
      <button className="projectNavDelete" disabled={mutation.isPending} onClick={removeFromList} title="Удалить из списка"><Trash2 size={14} /></button>
    </div>
  );
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
] as const;

function ProjectCreator() {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("Новый проект");
  const mutation = useMutation({
    mutationFn: () => api.post<Project>("/api/projects", { name, description: "Локальный production-проект визуальной новеллы." }),
    onSuccess: (project) => {
      useUiStore.getState().setProject(project.id);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
  return (
    <form className="compactForm" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <input value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" title="Создать проект"><Save size={16} /></button>
    </form>
  );
}

function ProjectOpener() {
  const queryClient = useQueryClient();
  const [projectPath, setProjectPath] = React.useState("");
  const mutation = useMutation({
    mutationFn: () => api.post<Project>("/api/projects/open", { projectPath }),
    onSuccess: (project) => {
      useUiStore.getState().setProject(project.id);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
  return (
    <form className="compactForm" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <input placeholder="Путь к папке проекта" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
      <button type="submit" title="Открыть проект"><Folder size={16} /></button>
    </form>
  );
}

export function ProductionSurface({ project, section: sectionOverride }: { project: Project; section?: Section }) {
  const selectedSection = useUiStore((state) => state.section);
  const section = sectionOverride ?? selectedSection;
  return (
    <>
      <main className={section === "frames" ? "centerPane storyboardMain frameWorkspaceMain" : section === "storyboard" ? "centerPane storyboardMain" : section === "scenes" ? "centerPane sceneCatalogMain" : "centerPane"}>
        {section !== "storyboard" && section !== "frames" && section !== "scenes" ? <ProjectHeader project={project} /> : null}
        {section === "project" ? <ProjectOverview project={project} /> : null}
        {section === "characters" ? <CharactersScreen project={project} /> : null}
        {section === "locations" ? <LocationsScreen project={project} /> : null}
        {section === "styles" ? <StylesScreen project={project} /> : null}
        {section === "scenes" ? <ScenesScreen project={project} /> : null}
        {section === "storyboard" ? <StoryboardScreen project={project} /> : null}
        {section === "frames" ? <FrameEditor project={project} /> : null}
        {section === "generations" ? <GenerationsScreen project={project} /> : null}
        {section === "settings" ? <SettingsScreen project={project} /> : null}
        {section === "advanced" ? <AdvancedToolsScreen project={project} /> : null}
      </main>
      {section !== "storyboard" && section !== "frames" && section !== "scenes" ? <aside className="rightPane">
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
