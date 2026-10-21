import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import type { StoryStateDocument } from "@bearridge/shared";
import "./styles.css";

const queryClient = new QueryClient();

type AssetStatus = "DRAFT" | "APPROVED" | "LOCKED" | "DEPRECATED" | "REJECTED";
type FrameStatus = "DRAFT" | "GENERATING" | "REVIEW" | "LOCKED" | "REJECTED";
type Section = "project" | "characters" | "locations" | "styles" | "scenes" | "frames" | "generations" | "settings";
type OwnerType = "character" | "outfit" | "location" | "locationAngle" | "style";

interface RegistryProject {
  id: string;
  name: string;
  projectPath: string;
  lastOpenedAt: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  defaultAspectRatio: string;
  defaultResolution: string;
  defaultDraftModel: string;
  defaultProductionModel: string;
  characters: Character[];
  locations: Location[];
  styleProfiles: StyleProfile[];
  scenes: Scene[];
}

interface Character {
  id: string;
  name: string;
  slug: string;
  description: string;
  age: string;
  height: string;
  bodyDescription: string;
  faceDescription: string;
  hairDescription: string;
  distinctiveFeatures: string;
  immutableFeatures: string;
  status: AssetStatus;
  references: Reference[];
  outfits: Outfit[];
}

type CharacterDraft = Pick<Character, "name" | "description" | "age" | "height" | "bodyDescription" | "faceDescription" | "hairDescription" | "distinctiveFeatures" | "immutableFeatures">;

interface Outfit {
  id: string;
  name: string;
  slug: string;
  description: string;
  immutableFeatures: string;
  status: AssetStatus;
  references: Reference[];
}

type OutfitDraft = Pick<Outfit, "name" | "description" | "immutableFeatures">;
type LocationAngleDraft = { name: string; cameraDescription: string };

interface Location {
  id: string;
  name: string;
  slug: string;
  description: string;
  architectureDescription: string;
  immutableFeatures: string;
  status: AssetStatus;
  references: Reference[];
  angles: LocationAngle[];
}

interface LocationAngle {
  id: string;
  slug: string;
  name: string;
  description: string;
  cameraPositionDescription: string;
  status: AssetStatus;
  references: Reference[];
}

interface StyleProfile {
  id: string;
  name: string;
  slug: string;
  description: string;
  linework: string;
  anatomy: string;
  faces: string;
  shading: string;
  backgroundDetail: string;
  cameraLanguage: string;
  lighting: string;
  colorPalette: string;
  negativeRules: string;
  status: AssetStatus;
  references: Reference[];
}

type StyleDraft = Pick<StyleProfile, "name" | "description" | "lighting" | "colorPalette" | "linework" | "anatomy" | "faces" | "shading" | "backgroundDetail" | "cameraLanguage" | "negativeRules">;

interface Scene {
  id: string;
  sequence: number;
  name: string;
  description: string;
  locationId: string | null;
  styleProfileId: string | null;
  characterIds: string[];
  timeDescription: string;
  storyState?: { document: StoryStateDocument } | null;
  frames: Frame[];
}

type SceneDraft = Pick<Scene, "name" | "description" | "locationId" | "styleProfileId" | "timeDescription" | "characterIds">;

interface Frame {
  id: string;
  sceneId: string;
  sequence: number;
  frameCode: string;
  type: "STANDARD" | "CG";
  status: FrameStatus;
  generationStrategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME";
  continuityEditContract: ContinuityEditContract;
  description: string;
  action: string;
  camera: string;
  composition: string;
  lighting: string;
  expressionNotes: string;
  continuityNotes: string;
  previousFrameId: string | null;
  selectedGenerationId: string | null;
  characterIds: string[];
  additionalCharacterReferenceIds: Record<string, string[]>;
  locationId: string | null;
  locationAngleId: string | null;
  styleProfileId: string | null;
  targetWidth: number | null;
  targetHeight: number | null;
  targetAspectRatio: number | null;
  generations: Generation[];
}

type ContinuityCategory = "character.position" | "character.pose" | "character.expression" | "character.outfit" | "character.props" | "camera" | "composition" | "lighting" | "environment" | "architecture" | "furniture";
type ContinuityEditContract = { changes: string[]; forbidden: string[]; allowedChanges: ContinuityCategory[] };
const continuityCategories: ContinuityCategory[] = ["character.position", "character.pose", "character.expression", "character.outfit", "character.props", "camera", "composition", "lighting", "environment", "architecture", "furniture"];

type FrameDraft = Pick<Frame, "description" | "action" | "camera" | "composition" | "lighting" | "expressionNotes" | "continuityNotes" | "generationStrategy" | "continuityEditContract" | "characterIds" | "additionalCharacterReferenceIds" | "locationId" | "locationAngleId" | "styleProfileId"> & {
  targetWidth: string;
  targetHeight: string;
};

interface Generation {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "REJECTED";
  generationType: "INITIAL" | "RETRY" | "EDIT" | "REPAIR";
  provider: string;
  model: string;
  outputFilePath: string;
  createdAt: string;
  targetWidth?: number | null;
  targetHeight?: number | null;
  targetAspectRatio?: number | null;
  requiresCrop?: boolean;
  cropStrategy?: string;
  references?: Array<{ id: string; code: string; referenceId: string }>;
}

interface ChatGPTExportSummary {
  exportId: string;
  createdAt: string;
  strategy: Frame["generationStrategy"];
  frameCode: string;
  baseFrameCode: string | null;
}

interface Reference {
  id: string;
  code: string;
  type?: string;
  filePath: string;
  description: string;
  status: AssetStatus;
  isCanonical: boolean;
  version: number;
}

interface PreviewResponse {
  strategy: Frame["generationStrategy"];
  baseReference?: { id: string; code: string; filePath: string; label?: string };
  deltaInstructions?: string;
  detectedContinuityChanges: Array<{ category: ContinuityCategory; entityId: string; label: string; previousValue: string; currentValue: string }>;
  allowedContinuityChanges: ContinuityCategory[];
  references: Array<{ id: string; code: string; filePath: string; kind: string; priority: number; label?: string; role?: string }>;
  warnings: Array<{ code: string; entityId: string; message: string; severity?: "blocking" | "warning" }>;
  prompt: string;
  context: {
    frame: Frame;
    characters: Character[];
    location: Location | null;
    locationAngle: LocationAngle | null;
    styleProfile: StyleProfile | null;
    storyState: StoryStateDocument;
    previousLockedFrame?: { id: string; frameCode: string; generationId: string; outputFilePath: string };
  };
  geometry: {
    requestedAspectRatio: string;
    requestedResolution: string;
    requestedImageSize: "512" | "1K" | "2K" | "4K";
    targetAspectRatio: number;
    requiresCrop: boolean;
    cropStrategy: "NONE" | "CENTER" | "MANUAL";
    aspectRatioDifference: number;
  };
}

interface UiState {
  selectedProjectId: string | null;
  section: Section;
  selectedCharacterId: string | null;
  selectedLocationId: string | null;
  selectedStyleId: string | null;
  selectedSceneId: string | null;
  selectedFrameId: string | null;
  setProject(id: string): void;
  setSection(section: Section): void;
  selectCharacter(id: string): void;
  selectLocation(id: string): void;
  selectStyle(id: string): void;
  selectScene(id: string): void;
  selectFrame(id: string): void;
  clearProject(): void;
}

const useUiStore = create<UiState>((set) => ({
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
  async get<T>(url: string): Promise<T> {
    return parseResponse<T>(await fetch(url));
  },
  async post<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  },
  async put<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  },
  async delete<T>(url: string, body: unknown): Promise<T> {
    return parseResponse<T>(await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }));
  }
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Запрос не выполнен";
    throw new Error(message);
  }
  return data as T;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Workspace />
    </QueryClientProvider>
  );
}

function Workspace() {
  const { selectedProjectId, setProject, section, setSection } = useUiStore();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<RegistryProject[]>("/api/projects") });
  const project = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => api.get<Project>(`/api/projects/${selectedProjectId}/full`),
    enabled: Boolean(selectedProjectId)
  });

  React.useEffect(() => {
    if (!selectedProjectId && projects.data?.[0]) {
      setProject(projects.data[0].id);
    }
  }, [projects.data, selectedProjectId, setProject]);

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand"><Clapperboard size={18} /> Bearridge</div>
        <ProjectCreator />
        <ProjectOpener />
        <nav>
          {projects.data?.map((item) => <ProjectNavItem key={item.id} item={item} active={item.id === selectedProjectId} onSelect={() => setProject(item.id)} />)}
        </nav>
        <div className="sections">
          {sectionItems.map(([id, label, Icon]) => (
            <button className={section === id ? "active navItem" : "navItem"} key={id} onClick={() => setSection(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
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
  ["frames", "Кадры", ImagePlus],
  ["generations", "Генерации", Box],
  ["settings", "Настройки", Settings]
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

function ProductionSurface({ project }: { project: Project }) {
  const { section } = useUiStore();
  return (
    <>
      <main className="centerPane">
        <ProjectHeader project={project} />
        {section === "project" ? <ProjectOverview project={project} /> : null}
        {section === "characters" ? <CharactersScreen project={project} /> : null}
        {section === "locations" ? <LocationsScreen project={project} /> : null}
        {section === "styles" ? <StylesScreen project={project} /> : null}
        {section === "scenes" ? <ScenesScreen project={project} /> : null}
        {section === "frames" ? <FrameEditor project={project} /> : null}
        {section === "generations" ? <GenerationsScreen project={project} /> : null}
        {section === "settings" ? <SettingsScreen project={project} /> : null}
      </main>
      <aside className="rightPane">
        <ContextPane project={project} />
      </aside>
    </>
  );
}

function ContextPane({ project }: { project: Project }) {
  const section = useUiStore((state) => state.section);
  if (section === "frames") {
    return (
      <>
        <StoryStateEditor project={project} />
        <ReviewPanel project={project} />
      </>
    );
  }
  if (section === "scenes") {
    return <StoryStateEditor project={project} />;
  }
  if (section === "generations") {
    return <ReviewPanel project={project} />;
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

function ProjectOverview({ project }: { project: Project }) {
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
    mutationFn: () => api.post<{ sceneId: string; createdCount: number; totalFrames: number }>(`/api/projects/${project.id}/benchmark/seed`, {
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

  return (
    <section className="frameEditor">
      <div className="toolbar">
        <h2>Сводка проекта</h2>
        <button disabled={!benchmarkReady || seedBenchmark.isPending} onClick={() => seedBenchmark.mutate()}>{seedBenchmark.isPending ? <Loader2 className="spin" size={16} /> : <Clapperboard size={16} />} Подготовить benchmark</button>
      </div>
      <div className="summaryGrid">
        <Metric label="Персонажи" value={project.characters.length} />
        <Metric label="Локации" value={project.locations.length} />
        <Metric label="Стили" value={project.styleProfiles.length} />
        <Metric label="Сцены" value={project.scenes.length} />
      </div>
      <div className="versionBlock">
        <h3>Benchmark 20 кадров</h3>
        <div className="switchGrid">
          <label>Персонаж<select value={characterId} onChange={(event) => setCharacterId(event.target.value)}>{project.characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Образ<select value={outfitId} onChange={(event) => setOutfitId(event.target.value)}>{character?.outfits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Локация<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{project.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Ракурс<select value={locationAngleId} onChange={(event) => setLocationAngleId(event.target.value)}><option value="">Без отдельного ракурса</option>{location?.angles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Стиль<select value={styleProfileId} onChange={(event) => setStyleProfileId(event.target.value)}>{project.styleProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        {!benchmarkReady ? <p className="warning">Для benchmark нужны персонаж, образ, локация и стиль.</p> : null}
      </div>
      {seedBenchmark.data ? <p className="muted">Benchmark-сцена готова: {seedBenchmark.data.totalFrames} кадров, новых создано {seedBenchmark.data.createdCount}.</p> : null}
      <p className="muted">Проект self-contained: production database находится в `project.sqlite` внутри этой папки.</p>
      <DeleteProjectPanel project={project} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function emptyCharacterDraft(): CharacterDraft {
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

function characterToDraft(character: Character): CharacterDraft {
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

function OutfitEditor({ project, outfit, onChanged }: { project: Project; outfit: Outfit; onChanged(): void }) {
  const [draft, setDraft] = React.useState<OutfitDraft>(outfitToDraft(outfit));
  React.useEffect(() => setDraft(outfitToDraft(outfit)), [outfit.id, outfit.name, outfit.description, outfit.immutableFeatures]);
  const updateOutfit = useMutation({
    mutationFn: () => api.put<Outfit>(`/api/outfits/${outfit.id}`, draft),
    onSuccess: onChanged
  });
  const changed = JSON.stringify(draft) !== JSON.stringify(outfitToDraft(outfit));
  return (
    <div className="versionBlock">
      <div className="toolbar">
        <h3>{outfit.name}</h3>
        <button disabled={!changed || !draft.name.trim() || updateOutfit.isPending} onClick={() => updateOutfit.mutate()}>{updateOutfit.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить образ</button>
      </div>
      <div className="detailsGrid">
        <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Описание одежды<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Неизменяемые элементы<textarea value={draft.immutableFeatures} onChange={(event) => setDraft({ ...draft, immutableFeatures: event.target.value })} /></label>
      </div>
      {updateOutfit.error ? <p className="warning">{updateOutfit.error.message}</p> : null}
      <ReferenceSlots project={project} ownerType="outfit" ownerId={outfit.id} references={outfit.references} slots={outfitSlots} onChanged={onChanged} />
    </div>
  );
}

function outfitToDraft(outfit: Outfit): OutfitDraft {
  return {
    name: outfit.name,
    description: outfit.description,
    immutableFeatures: outfit.immutableFeatures
  };
}

function emptyStyleDraft(): StyleDraft {
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

function styleToDraft(style: StyleProfile): StyleDraft {
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

function emptySceneDraft(project: Project): SceneDraft {
  return {
    name: "",
    description: "",
    locationId: project.locations[0]?.id ?? null,
    styleProfileId: project.styleProfiles[0]?.id ?? null,
    timeDescription: "",
    characterIds: []
  };
}

function sceneToDraft(scene: Scene): SceneDraft {
  return {
    name: scene.name,
    description: scene.description,
    locationId: scene.locationId,
    styleProfileId: scene.styleProfileId,
    timeDescription: scene.timeDescription,
    characterIds: scene.characterIds
  };
}

function emptyFrameDraft(): FrameDraft {
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

function frameToDraft(frame: Frame): FrameDraft {
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

function LocationAngleEditor({ project, angle, onChanged }: { project: Project; angle: LocationAngle; onChanged(): void }) {
  const [draft, setDraft] = React.useState<LocationAngleDraft>(locationAngleToDraft(angle));
  React.useEffect(() => setDraft(locationAngleToDraft(angle)), [angle.id, angle.name, angle.cameraPositionDescription]);
  const updateAngle = useMutation({
    mutationFn: () => api.put<LocationAngle>(`/api/location-angles/${angle.id}`, draft),
    onSuccess: onChanged
  });
  const changed = JSON.stringify(draft) !== JSON.stringify(locationAngleToDraft(angle));
  return (
    <div className="versionBlock">
      <div className="toolbar">
        <h3>{angle.name}</h3>
        <button disabled={!changed || !draft.name.trim() || updateAngle.isPending} onClick={() => updateAngle.mutate()}>{updateAngle.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить</button>
      </div>
      <div className="detailsGrid">
        <label>Название ракурса<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Описание камеры<textarea value={draft.cameraDescription} onChange={(event) => setDraft({ ...draft, cameraDescription: event.target.value })} /></label>
      </div>
      {updateAngle.error ? <p className="warning">{updateAngle.error.message}</p> : null}
      <ReferenceSlots project={project} ownerType="locationAngle" ownerId={angle.id} references={angle.references} slots={["VIEW"]} onChanged={onChanged} />
    </div>
  );
}

function locationAngleToDraft(angle: LocationAngle): LocationAngleDraft {
  return {
    name: angle.name,
    cameraDescription: angle.cameraPositionDescription
  };
}

function DeleteProjectPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const clearProject = useUiStore((state) => state.clearProject);
  const [deleteFiles, setDeleteFiles] = React.useState(false);
  const [confirmationName, setConfirmationName] = React.useState("");
  const mutation = useMutation({
    mutationFn: () => api.delete<{ id: string; projectPath: string; deletedFiles: boolean }>(`/api/projects/${project.id}`, {
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
  return (
    <div className="dangerZone">
      <div>
        <h3>Удаление проекта</h3>
        <p className="muted">Без галки проект удаляется только из списка. Папку можно будет снова открыть по пути.</p>
      </div>
      <label className="checkline"><input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.target.checked)} /> Также удалить папку проекта</label>
      {deleteFiles ? <label>Введите название проекта<input value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} placeholder={project.name} /></label> : null}
      {mutation.error ? <p className="warning">{mutation.error.message}</p> : null}
      <button className="dangerButton" disabled={!canDelete || mutation.isPending} onClick={submit}>{mutation.isPending ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />} Удалить проект</button>
    </div>
  );
}

function CharactersScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedId = useUiStore((state) => state.selectedCharacterId);
  const selectCharacter = useUiStore((state) => state.selectCharacter);
  const selected = project.characters.find((character) => character.id === selectedId) ?? project.characters[0];
  const [draft, setDraft] = React.useState<CharacterDraft>(emptyCharacterDraft());
  const [edit, setEdit] = React.useState<CharacterDraft>(emptyCharacterDraft());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  const createCharacter = useMutation({
    mutationFn: () => api.post<Character>("/api/characters", { projectId: project.id, ...draft }),
    onSuccess: (character) => {
      selectCharacter(character.id);
      setDraft(emptyCharacterDraft());
      void refresh();
    }
  });
  const updateCharacter = useMutation({
    mutationFn: () => api.put<Character>(`/api/characters/${selected?.id}`, edit),
    onSuccess: () => refresh()
  });
  const createOutfit = useMutation({
    mutationFn: (name: string) => api.post<Outfit>(`/api/characters/${selected?.id}/outfits`, { name, description: "", immutableFeatures: "" }),
    onSuccess: refresh
  });
  React.useEffect(() => {
    if (selected) setEdit(characterToDraft(selected));
  }, [selected?.id]);
  const hasCharacterChanges = selected ? JSON.stringify(edit) !== JSON.stringify(characterToDraft(selected)) : false;

  return (
    <section className="entityLayout">
      <div className="entityList">
        <h2>Персонажи</h2>
        {project.characters.map((character) => (
          <button className={character.id === selected?.id ? "active listButton" : "listButton"} key={character.id} onClick={() => selectCharacter(character.id)}>
            <User size={15} /> {character.name}
          </button>
        ))}
        <div className="fieldStack">
          <label>Имя<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Возраст<input value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} /></label>
          <label>Рост<input value={draft.height} onChange={(event) => setDraft({ ...draft, height: event.target.value })} /></label>
          <button disabled={!draft.name.trim()} onClick={() => createCharacter.mutate()}><User size={16} /> Новый персонаж</button>
        </div>
      </div>
      <div className="entityDetail">
        {selected ? (
          <>
            <div className="toolbar">
              <h2>{selected.name}</h2>
              <button disabled={!hasCharacterChanges || !edit.name.trim() || updateCharacter.isPending} onClick={() => updateCharacter.mutate()}>{updateCharacter.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить</button>
            </div>
            <div className="detailsGrid">
              <label>Имя<input value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
              <label>Возраст<input value={edit.age} onChange={(event) => setEdit({ ...edit, age: event.target.value })} /></label>
              <label>Рост<input value={edit.height} onChange={(event) => setEdit({ ...edit, height: event.target.value })} /></label>
              <label>Описание<textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></label>
              <label>Тело<textarea value={edit.bodyDescription} onChange={(event) => setEdit({ ...edit, bodyDescription: event.target.value })} /></label>
              <label>Лицо<textarea value={edit.faceDescription} onChange={(event) => setEdit({ ...edit, faceDescription: event.target.value })} /></label>
              <label>Волосы<textarea value={edit.hairDescription} onChange={(event) => setEdit({ ...edit, hairDescription: event.target.value })} /></label>
              <label>Отличительные признаки<textarea value={edit.distinctiveFeatures} onChange={(event) => setEdit({ ...edit, distinctiveFeatures: event.target.value })} /></label>
              <label>Неизменяемые признаки<textarea value={edit.immutableFeatures} onChange={(event) => setEdit({ ...edit, immutableFeatures: event.target.value })} /></label>
            </div>
            {updateCharacter.error ? <p className="warning">{updateCharacter.error.message}</p> : null}
            <ReferenceSlots project={project} ownerType="character" ownerId={selected.id} references={selected.references} slots={characterSlots} onChanged={refresh} />
            <section className="sideSection">
              <div className="toolbar"><h3>Образы</h3><button onClick={() => createOutfit.mutate(`Образ ${selected.outfits.length + 1}`)}><Box size={16} /> Новый образ</button></div>
              {selected.outfits.map((outfit) => (
                <OutfitEditor key={outfit.id} project={project} outfit={outfit} onChanged={refresh} />
              ))}
            </section>
          </>
        ) : <p className="muted">Создайте первого персонажа.</p>}
      </div>
    </section>
  );
}

function LocationsScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedId = useUiStore((state) => state.selectedLocationId);
  const selectLocation = useUiStore((state) => state.selectLocation);
  const selected = project.locations.find((location) => location.id === selectedId) ?? project.locations[0];
  const [draft, setDraft] = React.useState({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  const createLocation = useMutation({
    mutationFn: () => api.post<Location>("/api/locations", { projectId: project.id, ...draft }),
    onSuccess: (location) => {
      selectLocation(location.id);
      setDraft({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
      void refresh();
    }
  });
  const createAngle = useMutation({
    mutationFn: (name: string) => api.post<LocationAngle>(`/api/locations/${selected?.id}/angles`, { name, description: "", cameraPositionDescription: "" }),
    onSuccess: refresh
  });

  return (
    <section className="entityLayout">
      <div className="entityList">
        <h2>Локации</h2>
        {project.locations.map((location) => (
          <button className={location.id === selected?.id ? "active listButton" : "listButton"} key={location.id} onClick={() => selectLocation(location.id)}>
            <Map size={15} /> {location.name}
          </button>
        ))}
        <div className="fieldStack">
          <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Архитектура<textarea value={draft.architectureDescription} onChange={(event) => setDraft({ ...draft, architectureDescription: event.target.value })} /></label>
          <button disabled={!draft.name.trim()} onClick={() => createLocation.mutate()}><Map size={16} /> Новая локация</button>
        </div>
      </div>
      <div className="entityDetail">
        {selected ? (
          <>
            <h2>{selected.name}</h2>
            <p className="muted">{selected.architectureDescription || selected.description}</p>
            <ReferenceSlots project={project} ownerType="location" ownerId={selected.id} references={selected.references} slots={locationSlots} onChanged={refresh} />
            <section className="sideSection">
              <div className="toolbar"><h3>Ракурсы</h3><button onClick={() => createAngle.mutate(`Ракурс ${selected.angles.length + 1}`)}><ImagePlus size={16} /> Новый ракурс</button></div>
              {selected.angles.map((angle) => (
                <LocationAngleEditor key={angle.id} project={project} angle={angle} onChanged={refresh} />
              ))}
            </section>
          </>
        ) : <p className="muted">Создайте первую локацию.</p>}
      </div>
    </section>
  );
}

function StylesScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedId = useUiStore((state) => state.selectedStyleId);
  const selectStyle = useUiStore((state) => state.selectStyle);
  const selected = project.styleProfiles.find((style) => style.id === selectedId) ?? project.styleProfiles[0];
  const [draft, setDraft] = React.useState<StyleDraft>(emptyStyleDraft());
  const [edit, setEdit] = React.useState<StyleDraft>(emptyStyleDraft());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  const createStyle = useMutation({
    mutationFn: () => api.post<StyleProfile>("/api/styles", { projectId: project.id, ...draft }),
    onSuccess: (style) => {
      selectStyle(style.id);
      setDraft(emptyStyleDraft());
      void refresh();
    }
  });
  const updateStyle = useMutation({
    mutationFn: () => api.put<StyleProfile>(`/api/styles/${selected?.id}`, edit),
    onSuccess: () => refresh()
  });
  React.useEffect(() => {
    if (selected) setEdit(styleToDraft(selected));
  }, [selected?.id]);
  const hasStyleChanges = selected ? JSON.stringify(edit) !== JSON.stringify(styleToDraft(selected)) : false;

  return (
    <section className="entityLayout">
      <div className="entityList">
        <h2>Стили</h2>
        {project.styleProfiles.map((style) => (
          <button className={style.id === selected?.id ? "active listButton" : "listButton"} key={style.id} onClick={() => selectStyle(style.id)}>
            <Brush size={15} /> {style.name}
          </button>
        ))}
        <div className="fieldStack">
          <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Свет<textarea value={draft.lighting} onChange={(event) => setDraft({ ...draft, lighting: event.target.value })} /></label>
          <button disabled={!draft.name.trim()} onClick={() => createStyle.mutate()}><Brush size={16} /> Новый стиль</button>
        </div>
      </div>
      <div className="entityDetail">
        {selected ? (
          <>
            <div className="toolbar">
              <h2>{selected.name}</h2>
              <button disabled={!hasStyleChanges || !edit.name.trim() || updateStyle.isPending} onClick={() => updateStyle.mutate()}>{updateStyle.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить</button>
            </div>
            <div className="detailsGrid">
              <label>Название<input value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
              <label>Описание<textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></label>
              <label>Свет<textarea value={edit.lighting} onChange={(event) => setEdit({ ...edit, lighting: event.target.value })} /></label>
              <label>Палитра<textarea value={edit.colorPalette} onChange={(event) => setEdit({ ...edit, colorPalette: event.target.value })} /></label>
              <label>Линия<textarea value={edit.linework} onChange={(event) => setEdit({ ...edit, linework: event.target.value })} /></label>
              <label>Анатомия<textarea value={edit.anatomy} onChange={(event) => setEdit({ ...edit, anatomy: event.target.value })} /></label>
              <label>Лица<textarea value={edit.faces} onChange={(event) => setEdit({ ...edit, faces: event.target.value })} /></label>
              <label>Шейдинг<textarea value={edit.shading} onChange={(event) => setEdit({ ...edit, shading: event.target.value })} /></label>
              <label>Фоны<textarea value={edit.backgroundDetail} onChange={(event) => setEdit({ ...edit, backgroundDetail: event.target.value })} /></label>
              <label>Камера<textarea value={edit.cameraLanguage} onChange={(event) => setEdit({ ...edit, cameraLanguage: event.target.value })} /></label>
              <label>Негативные правила<textarea value={edit.negativeRules} onChange={(event) => setEdit({ ...edit, negativeRules: event.target.value })} /></label>
            </div>
            {updateStyle.error ? <p className="warning">{updateStyle.error.message}</p> : null}
            <ReferenceSlots project={project} ownerType="style" ownerId={selected.id} references={selected.references} slots={["REF"]} onChanged={refresh} />
          </>
        ) : <p className="muted">Создайте первый стиль.</p>}
      </div>
    </section>
  );
}

function ScenesScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectScene = useUiStore((state) => state.selectScene);
  const selected = project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0];
  const [draft, setDraft] = React.useState<SceneDraft>(emptySceneDraft(project));
  const [edit, setEdit] = React.useState<SceneDraft>(emptySceneDraft(project));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  const createScene = useMutation({
    mutationFn: () => api.post<Scene>("/api/scenes", { projectId: project.id, sequence: project.scenes.length + 1, ...draft }),
    onSuccess: (scene) => {
      selectScene(scene.id);
      setDraft(emptySceneDraft(project));
      void refresh();
    }
  });
  const updateScene = useMutation({
    mutationFn: () => api.put<Scene>(`/api/scenes/${selected?.id}`, edit),
    onSuccess: () => refresh()
  });
  React.useEffect(() => {
    if (selected) setEdit(sceneToDraft(selected));
  }, [selected?.id]);
  const hasSceneChanges = selected ? JSON.stringify(edit) !== JSON.stringify(sceneToDraft(selected)) : false;

  return (
    <section className="entityLayout">
      <div className="entityList">
        <h2>Сцены</h2>
        {project.scenes.map((scene) => (
          <button className={scene.id === selected?.id ? "active listButton" : "listButton"} key={scene.id} onClick={() => selectScene(scene.id)}>
            <Clapperboard size={15} /> S{scene.sequence.toString().padStart(3, "0")} / {scene.name}
          </button>
        ))}
        <div className="fieldStack">
          <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <button disabled={!draft.name.trim()} onClick={() => createScene.mutate()}><Clapperboard size={16} /> Новая сцена</button>
        </div>
      </div>
      <div className="entityDetail">
        {selected ? (
          <>
            <div className="toolbar">
              <h2>S{selected.sequence.toString().padStart(3, "0")} / {selected.name}</h2>
              <button disabled={!hasSceneChanges || !edit.name.trim() || updateScene.isPending} onClick={() => updateScene.mutate()}>{updateScene.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить</button>
            </div>
            <div className="detailsGrid">
              <label>Название<input value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
              <label>Время<input value={edit.timeDescription} onChange={(event) => setEdit({ ...edit, timeDescription: event.target.value })} /></label>
              <label>Локация<select value={edit.locationId ?? ""} onChange={(event) => setEdit({ ...edit, locationId: event.target.value || null })}><option value="">Не выбрана</option>{project.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label>Стиль<select value={edit.styleProfileId ?? ""} onChange={(event) => setEdit({ ...edit, styleProfileId: event.target.value || null })}><option value="">Первый LOCKED стиль</option>{project.styleProfiles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
              <label>Описание сцены<textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></label>
            </div>
            <div className="versionBlock">
              <h3>Персонажи сцены</h3>
              {project.characters.map((character) => (
                <label className="checkline" key={character.id}>
                  <input type="checkbox" checked={edit.characterIds.includes(character.id)} onChange={(event) => setEdit({ ...edit, characterIds: event.target.checked ? [...edit.characterIds, character.id] : edit.characterIds.filter((id) => id !== character.id) })} />
                  {character.name}
                </label>
              ))}
              <p className="muted">Outfit не привязан к сцене: текущий образ персонажа задаётся в Story State.</p>
            </div>
            {updateScene.error ? <p className="warning">{updateScene.error.message}</p> : null}
            <section className="referenceList">
              <h3>Кадры сцены</h3>
              {selected.frames.map((frame) => <div className="refRow" key={frame.id}><ImagePlus size={15} /><span>{frame.frameCode}</span><small>{frame.status}</small></div>)}
            </section>
          </>
        ) : <p className="muted">Создайте первую сцену.</p>}
      </div>
    </section>
  );
}

function FrameEditor({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectedFrameId = useUiStore((state) => state.selectedFrameId);
  const selectScene = useUiStore((state) => state.selectScene);
  const selectFrame = useUiStore((state) => state.selectFrame);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const frame = scene?.frames.find((item) => item.id === selectedFrameId) ?? scene?.frames[0];
  const [action, setAction] = React.useState("");
  const [frameDraft, setFrameDraft] = React.useState<FrameDraft>(emptyFrameDraft());
  const [targetWidth, setTargetWidth] = React.useState("1200");
  const [targetHeight, setTargetHeight] = React.useState("675");
  const inheritedLocationId = frameDraft.locationId || scene?.locationId || "";
  const selectedLocation = project.locations.find((location) => location.id === inheritedLocationId) ?? project.locations[0];
  const [selectedExportId, setSelectedExportId] = React.useState("");
  const importInput = React.useRef<HTMLInputElement>(null);
  const preview = useQuery({
    queryKey: ["preview", frame?.id],
    queryFn: () => api.get<PreviewResponse>(`/api/frames/${frame?.id}/preview`),
    enabled: Boolean(frame?.id)
  });
  const blockingWarnings = preview.data?.warnings.filter((warning) => warning.severity === "blocking") ?? [];
  const chatGPTExports = useQuery({
    queryKey: ["chatgpt-exports", frame?.id],
    queryFn: () => api.get<ChatGPTExportSummary[]>(`/api/frames/${frame?.id}/exports/chatgpt`),
    enabled: Boolean(frame?.id)
  });
  const newFrameAction = action.trim();
  const hasFrameChanges = frame ? JSON.stringify(frameDraft) !== JSON.stringify(frameToDraft(frame)) : false;
  const createFrame = useMutation({
    mutationFn: () => api.post<Frame>("/api/frames", {
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
    mutationFn: () => api.put<Frame>(`/api/frames/${frame?.id}`, {
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
    mutationFn: (mode: "draft" | "production") => api.post<Generation>("/api/generations", { frameId: frame?.id, mode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  const exportForChatGPT = useMutation({
    mutationFn: async () => {
      if (!frame) throw new Error("Выберите кадр для экспорта.");
      const response = await fetch(`/api/frames/${frame.id}/export/chatgpt`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
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
      if (exportId) setSelectedExportId(exportId);
      void queryClient.invalidateQueries({ queryKey: ["chatgpt-exports", frame?.id] });
    }
  });
  const importChatGPT = useMutation({
    mutationFn: async (file: File) => {
      if (!frame || !selectedExportId) throw new Error("Выберите ChatGPT export для привязки результата.");
      return api.post<Generation>(`/api/frames/${frame.id}/import/chatgpt`, {
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
    if (scene) selectScene(scene.id);
    if (frame) selectFrame(frame.id);
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

  return (
    <section className="frameEditor">
      <div className="toolbar">
        <h2>{scene ? `СЦЕНА ${scene.sequence.toString().padStart(3, "0")}` : "СЦЕНА"} / {frame?.frameCode ?? "КАДР"}</h2>
        <button disabled={!scene || createFrame.isPending} onClick={() => createFrame.mutate()}>{createFrame.isPending ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />} Новый кадр</button>
        <button disabled={!frame || !hasFrameChanges || saveFrame.isPending} onClick={() => saveFrame.mutate()}>{saveFrame.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить кадр</button>
        <button disabled={!frame || generate.isPending} onClick={() => generate.mutate("draft")}>{generate.isPending ? <Loader2 className="spin" size={16} /> : <Play size={16} />} Draft</button>
        <button disabled={!frame || generate.isPending || blockingWarnings.length > 0} onClick={() => generate.mutate("production")}><Play size={16} /> Production</button>
        <button disabled={!frame || exportForChatGPT.isPending || blockingWarnings.length > 0} onClick={() => exportForChatGPT.mutate()}>{exportForChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Export for ChatGPT</button>
        <input ref={importInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) importChatGPT.mutate(file); event.target.value = ""; }} />
        <button disabled={!frame || !selectedExportId || importChatGPT.isPending} onClick={() => importInput.current?.click()}>{importChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Import ChatGPT Result</button>
      </div>
      {exportForChatGPT.error ? <p className="warning">{exportForChatGPT.error.message}</p> : null}
      {importChatGPT.error ? <p className="warning">{importChatGPT.error.message}</p> : null}
      {frame && chatGPTExports.data?.length ? <label>ChatGPT export<select value={selectedExportId} onChange={(event) => setSelectedExportId(event.target.value)}>{chatGPTExports.data.map((item) => <option key={item.exportId} value={item.exportId}>{new Date(item.createdAt).toLocaleString()} · {item.strategy}{item.baseFrameCode ? ` · base ${item.baseFrameCode}` : ""}</option>)}</select></label> : null}
      {importChatGPT.data ? <div className="versionBlock"><strong>Imported ChatGPT result</strong><span>{frame?.frameCode} · {importChatGPT.data.status}</span><small>Source: ChatGPT manual import</small><small>Strategy: {frame?.generationStrategy}</small><small>Export: {selectedExportId}</small>{importChatGPT.data.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, importChatGPT.data.outputFilePath)} /> : null}</div> : null}
      <div className="editorGrid">
        <div className="fieldStack">
          <label>Сцена<select value={scene?.id ?? ""} onChange={(event) => selectScene(event.target.value)}>{project.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Кадр<select value={frame?.id ?? ""} onChange={(event) => selectFrame(event.target.value)}><option value="" disabled>{scene?.frames.length ? "Выберите кадр" : "Кадров пока нет"}</option>{scene?.frames.map((item) => <option key={item.id} value={item.id}>{item.frameCode}</option>)}</select></label>
          <label>Стратегия генерации<select disabled={!frame} value={frame ? frameDraft.generationStrategy : "NEW_COMPOSITION"} onChange={(event) => setFrameDraft({ ...frameDraft, generationStrategy: event.target.value as Frame["generationStrategy"] })}><option value="NEW_COMPOSITION">Новая композиция</option><option value="CONTINUE_PREVIOUS_FRAME">Продолжить предыдущий кадр</option></select><small>{frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Использовать предыдущий закреплённый кадр как визуальную основу и применить контролируемое изменение." : "Создать новую композицию по каноническим референсам."}</small></label>
          {frame && frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? <ContinuityEditContractEditor contract={frameDraft.continuityEditContract} detected={preview.data?.detectedContinuityChanges ?? []} onChange={(continuityEditContract) => setFrameDraft({ ...frameDraft, continuityEditContract })} /> : null}
          <label>Описание кадра<textarea disabled={!frame} value={frame ? frameDraft.description : ""} onChange={(event) => setFrameDraft({ ...frameDraft, description: event.target.value })} /></label>
          <label>Действие<textarea value={frame ? frameDraft.action : action} onChange={(event) => frame ? setFrameDraft({ ...frameDraft, action: event.target.value }) : setAction(event.target.value)} /></label>
          <label>Камера<textarea disabled={!frame} value={frame ? frameDraft.camera : ""} onChange={(event) => setFrameDraft({ ...frameDraft, camera: event.target.value })} /></label>
          <label>Композиция<textarea disabled={!frame} value={frame ? frameDraft.composition : ""} onChange={(event) => setFrameDraft({ ...frameDraft, composition: event.target.value })} /></label>
          <label>Свет<textarea disabled={!frame} value={frame ? frameDraft.lighting : ""} onChange={(event) => setFrameDraft({ ...frameDraft, lighting: event.target.value })} /></label>
          <label>Выражение / поза<textarea disabled={!frame} value={frame ? frameDraft.expressionNotes : ""} onChange={(event) => setFrameDraft({ ...frameDraft, expressionNotes: event.target.value })} /></label>
          <label>Continuity notes<textarea disabled={!frame} value={frame ? frameDraft.continuityNotes : ""} onChange={(event) => setFrameDraft({ ...frameDraft, continuityNotes: event.target.value })} /></label>
          <div className="versionBlock">
            <div className="toolbar"><h3>Контекст кадра</h3></div>
            <div className="fieldStack">
              <label>Персонажи</label>
              {project.characters.map((character) => (
                <div className="versionBlock" key={character.id}>
                  <label className="checkline">
                    <input type="checkbox" checked={frameDraft.characterIds.includes(character.id)} onChange={(event) => {
                      setFrameDraft((current) => ({
                        ...current,
                        characterIds: event.target.checked ? [...current.characterIds, character.id] : current.characterIds.filter((id) => id !== character.id),
                        additionalCharacterReferenceIds: event.target.checked ? current.additionalCharacterReferenceIds : { ...current.additionalCharacterReferenceIds, [character.id]: [] }
                      }));
                    }} />
                    {character.name}
                  </label>
                  {frameDraft.characterIds.includes(character.id) ? (
                    <div className="fieldStack">
                      <small>Дополнительные референсы персонажа</small>
                      {character.references.filter((reference) => reference.status === "LOCKED" && reference.type !== "MASTER").map((reference) => {
                        const selected = frameDraft.additionalCharacterReferenceIds[character.id] ?? [];
                        return (
                          <label className="checkline" key={reference.id}>
                            <input type="checkbox" checked={selected.includes(reference.id)} onChange={(event) => setFrameDraft((current) => ({
                              ...current,
                              additionalCharacterReferenceIds: {
                                ...current.additionalCharacterReferenceIds,
                                [character.id]: event.target.checked
                                  ? [...(current.additionalCharacterReferenceIds[character.id] ?? []), reference.id]
                                  : (current.additionalCharacterReferenceIds[character.id] ?? []).filter((id) => id !== reference.id)
                              }
                            }))} />
                            {reference.type ?? "OTHER"} · {reference.code}
                          </label>
                        );
                      })}
                      {!character.references.some((reference) => reference.status === "LOCKED" && reference.type !== "MASTER") ? <small>Нет дополнительных LOCKED референсов.</small> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              <label>Локация<select value={frameDraft.locationId ?? ""} onChange={(event) => setFrameDraft({ ...frameDraft, locationId: event.target.value || null })}><option value="">Из сцены{scene?.locationId ? `: ${project.locations.find((item) => item.id === scene.locationId)?.name ?? ""}` : ""}</option>{project.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Ракурс<select value={frameDraft.locationAngleId ?? ""} onChange={(event) => setFrameDraft({ ...frameDraft, locationAngleId: event.target.value || null })}><option value="">Без отдельного ракурса</option>{selectedLocation?.angles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Стиль<select value={frameDraft.styleProfileId ?? ""} onChange={(event) => setFrameDraft({ ...frameDraft, styleProfileId: event.target.value || null })}><option value="">Из сцены{scene?.styleProfileId ? `: ${project.styleProfiles.find((item) => item.id === scene.styleProfileId)?.name ?? ""}` : ""}</option>{project.styleProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
          </div>
          <div className="switchGrid">
          <label>Ширина panel<input value={frame ? frameDraft.targetWidth : targetWidth} onChange={(event) => frame ? setFrameDraft({ ...frameDraft, targetWidth: event.target.value }) : setTargetWidth(event.target.value)} /></label>
          <label>Высота panel<input value={frame ? frameDraft.targetHeight : targetHeight} onChange={(event) => frame ? setFrameDraft({ ...frameDraft, targetHeight: event.target.value }) : setTargetHeight(event.target.value)} /></label>
          </div>
        </div>
        <div className="referenceList">
          <h3>{preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? "Опорное изображение и референсы" : "Подобранные референсы"}</h3>
          {preview.data ? <FrameContextSummary preview={preview.data} /> : null}
          {preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? <div className="versionBlock"><h3>BASE IMAGE</h3><div className="refRow"><Check size={15} /><span>{preview.data.context.previousLockedFrame?.frameCode ?? "Не найден"}</span><small>{preview.data.context.previousLockedFrame?.generationId ?? "Недоступная база"}</small></div></div> : null}
          {preview.data?.warnings.map((warning) => <p className={warning.severity === "blocking" ? "warning blocking" : "warning"} key={`${warning.code}-${warning.entityId}`}>{warning.message}</p>)}
          {preview.data?.references.map((reference) => <div className="refRow" key={reference.id}><Check size={15} /><span>{reference.label ?? reference.code}</span><small>{reference.role ?? referenceKindLabel(reference.kind)}</small></div>)}
          {preview.data?.deltaInstructions ? <div className="versionBlock"><h3>DELTA INSTRUCTIONS</h3><pre>{preview.data.deltaInstructions}</pre></div> : null}
          <GeometryPreview frame={frame} preview={preview.data} fallbackAspectRatio={project.defaultAspectRatio} />
        </div>
        <div className="promptPreview">
          <h3>Production prompt</h3>
          <pre>{preview.data?.prompt ?? "Создайте или выберите кадр, чтобы увидеть prompt."}</pre>
        </div>
      </div>
    </section>
  );
}

function ContinuityEditContractEditor({ contract, detected, onChange }: {
  contract: ContinuityEditContract;
  detected: PreviewResponse["detectedContinuityChanges"];
  onChange(next: ContinuityEditContract): void;
}) {
  return (
    <div className="versionBlock">
      <h3>Continuity Edit Contract</h3>
      <label>Обнаруженные структурированные изменения</label>
      {detected.length ? detected.map((change) => <div className="refRow" key={`${change.entityId}-${change.category}`}><Check size={15} /><span>{change.label}</span><small>{change.previousValue} → {change.currentValue}</small></div>) : <small>Достоверный structured Story State diff недоступен или изменений нет.</small>}
      <label>Разрешённые категории изменений</label>
      <div className="fieldStack">
        {continuityCategories.map((category) => {
          const automaticallyAllowed = detected.some((change) => change.category === category);
          const explicitlyAllowed = contract.allowedChanges.includes(category);
          return <label className="checkline" key={category}><input type="checkbox" checked={automaticallyAllowed || explicitlyAllowed} disabled={automaticallyAllowed} onChange={(event) => onChange({ ...contract, allowedChanges: event.target.checked ? [...contract.allowedChanges, category] : contract.allowedChanges.filter((item) => item !== category) })} />{category}{automaticallyAllowed ? " (обнаружено автоматически)" : ""}</label>;
        })}
      </div>
      <MultilineListEditor label="Явные изменения" values={contract.changes} onChange={(changes) => onChange({ ...contract, changes })} placeholder="Одно изменение на строку" />
      <MultilineListEditor label="Запрещённые изменения" values={contract.forbidden} onChange={(forbidden) => onChange({ ...contract, forbidden })} placeholder="Одно ограничение на строку" />
    </div>
  );
}

function MultilineListEditor({ label, values, placeholder, onChange }: {
  label: string;
  values: string[];
  placeholder: string;
  onChange(values: string[]): void;
}) {
  const serializedValues = values.join("\n");
  const [text, setText] = React.useState(serializedValues);

  React.useEffect(() => {
    if (splitLines(text).join("\n") !== serializedValues) setText(serializedValues);
  }, [serializedValues, text]);

  return (
    <label>{label}<textarea value={text} onChange={(event) => {
      setText(event.target.value);
      onChange(splitLines(event.target.value));
    }} placeholder={placeholder} /></label>
  );
}

function StoryStateEditor({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const initial = scene?.storyState?.document ?? emptyState(scene?.id ?? "");
  const [state, setState] = React.useState<StoryStateDocument>(initial);
  React.useEffect(() => setState(initial), [scene?.id]);
  const save = useMutation({
    mutationFn: () => api.put(`/api/story-state/${scene?.id}`, { document: state }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  if (!scene) return <section className="sideSection">Создайте сцену, чтобы редактировать состояние сцены.</section>;

  return (
    <section className="sideSection">
      <div className="toolbar"><h2>Состояние сцены</h2><button onClick={() => save.mutate()}><Save size={16} /></button></div>
      <label>Время<input value={state.time.description} onChange={(event) => setState({ ...state, time: { description: event.target.value } })} /></label>
      <EnvironmentStateEditor state={state} onChange={setState} />
      {project.characters.map((character) => (
        <CharacterStateFields key={character.id} character={character} state={state} onChange={setState} />
      ))}
      <StoryFactsEditor state={state} onChange={setState} />
      <details><summary>Показать raw JSON</summary><pre>{JSON.stringify(state, null, 2)}</pre></details>
    </section>
  );
}

function CharacterStateFields({ character, state, onChange }: { character: Character; state: StoryStateDocument; onChange(next: StoryStateDocument): void }) {
  const current = state.characters[character.id] ?? { present: false };
  const update = (patch: Partial<typeof current>) => {
    onChange({
      ...state,
      characters: {
        ...state.characters,
        [character.id]: { ...current, ...patch }
      }
    });
  };
  return (
    <div className="versionBlock">
      <label className="checkline">
        <input type="checkbox" checked={Boolean(current.present)} onChange={(event) => update({ present: event.target.checked, outfitId: current.outfitId ?? character.outfits[0]?.id })} />
        {character.name}
      </label>
      {current.present ? (
        <div className="fieldStack">
          <label>Образ<select value={current.outfitId ?? ""} onChange={(event) => update({ outfitId: event.target.value || undefined })}><option value="">Не задан</option>{character.outfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}</select></label>
          <label>Эмоция<input value={current.emotion ?? ""} onChange={(event) => update({ emotion: event.target.value })} /></label>
          <label>Волосы<input value={current.hairState ?? ""} onChange={(event) => update({ hairState: event.target.value })} /></label>
          <label>Поза<input value={current.pose ?? ""} onChange={(event) => update({ pose: event.target.value })} /></label>
          <label>Положение<input value={current.locationPosition ?? ""} onChange={(event) => update({ locationPosition: event.target.value })} /></label>
          <label>В руках<input value={(current.heldProps ?? []).join(", ")} onChange={(event) => update({ heldProps: splitList(event.target.value) })} /></label>
        </div>
      ) : null}
    </div>
  );
}

function EnvironmentStateEditor({ state, onChange }: { state: StoryStateDocument; onChange(next: StoryStateDocument): void }) {
  const entries = Object.entries(state.environment);
  const updateKey = (oldKey: string, nextKey: string) => {
    const nextEnvironment = { ...state.environment };
    const value = nextEnvironment[oldKey];
    delete nextEnvironment[oldKey];
    if (nextKey.trim()) nextEnvironment[nextKey.trim()] = value ?? "";
    onChange({ ...state, environment: nextEnvironment });
  };
  const updateValue = (key: string, value: string) => onChange({ ...state, environment: { ...state.environment, [key]: value } });
  const remove = (key: string) => {
    const nextEnvironment = { ...state.environment };
    delete nextEnvironment[key];
    onChange({ ...state, environment: nextEnvironment });
  };
  return (
    <div className="versionBlock">
      <div className="toolbar"><h3>Окружение</h3><button onClick={() => onChange({ ...state, environment: { ...state.environment, [`state_${entries.length + 1}`]: "" } })}><ImagePlus size={16} /> Добавить</button></div>
      {entries.length ? entries.map(([key, value]) => (
        <div className="keyValueRow" key={key}>
          <input value={key} onChange={(event) => updateKey(key, event.target.value)} />
          <input value={String(value ?? "")} onChange={(event) => updateValue(key, event.target.value)} />
          <button onClick={() => remove(key)} title="Удалить"><X size={14} /></button>
        </div>
      )) : <p className="muted">Нет зафиксированных условий окружения.</p>}
    </div>
  );
}

function StoryFactsEditor({ state, onChange }: { state: StoryStateDocument; onChange(next: StoryStateDocument): void }) {
  return (
    <div className="versionBlock">
      <div className="toolbar"><h3>Факты истории</h3><button onClick={() => onChange({ ...state, storyFacts: [...state.storyFacts, ""] })}><ImagePlus size={16} /> Добавить</button></div>
      {state.storyFacts.map((fact, index) => (
        <div className="keyValueRow" key={index}>
          <input value={fact} onChange={(event) => onChange({ ...state, storyFacts: state.storyFacts.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
          <button onClick={() => onChange({ ...state, storyFacts: state.storyFacts.filter((_, itemIndex) => itemIndex !== index) })} title="Удалить"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function FrameContextSummary({ preview }: { preview: PreviewResponse }) {
  const presentCharacters = preview.context.characters.map((character) => {
    const state = preview.context.storyState.characters[character.id];
    return `${character.name}${state?.outfitId ? " / образ задан" : ""}`;
  });
  return (
    <div className="versionBlock">
      <h3>Контекст запроса</h3>
      <div className="refRow"><User size={15} /><span>Персонажи</span><small>{presentCharacters.join(", ") || "не выбраны"}</small></div>
      <div className="refRow"><Map size={15} /><span>Локация</span><small>{preview.context.location?.name ?? "не выбрана"}</small></div>
      <div className="refRow"><ImagePlus size={15} /><span>Ракурс</span><small>{preview.context.locationAngle?.name ?? "не выбран"}</small></div>
      <div className="refRow"><Brush size={15} /><span>Стиль</span><small>{preview.context.styleProfile?.name ?? "не выбран"}</small></div>
    </div>
  );
}

function GeometryPreview({ frame, preview, fallbackAspectRatio }: { frame: Frame | undefined; preview: PreviewResponse | undefined; fallbackAspectRatio: string }) {
  const targetRatio = preview?.geometry.targetAspectRatio ?? frame?.targetAspectRatio ?? parseRatio(fallbackAspectRatio);
  const targetSize = frame?.targetWidth && frame.targetHeight ? `${frame.targetWidth} x ${frame.targetHeight}` : "из настроек проекта";
  return (
    <div className="versionBlock">
      <h3>Геометрия кадра</h3>
      <div className="refRow"><Map size={15} /><span>ЦЕЛЕВАЯ PANEL</span><small>{targetSize} / {targetRatio.toFixed(2)}:1</small></div>
      <div className="refRow"><ImagePlus size={15} /><span>ЗАПРОС GEMINI</span><small>{preview?.geometry.requestedAspectRatio ?? fallbackAspectRatio} / {preview?.geometry.requestedResolution ?? "авто"} / {preview?.geometry.requestedImageSize ?? "1K"}</small></div>
      <div className="refRow"><Settings size={15} /><span>ПОСТОБРАБОТКА</span><small>Кроп: {preview?.geometry.requiresCrop ? "ДА" : "НЕТ"} / {preview?.geometry.cropStrategy ?? "NONE"}</small></div>
      {preview?.geometry.requiresCrop ? <p className="warning">Целевой panel ratio отличается от запроса Gemini. Prompt содержит safe area instruction; crop/editor будет отдельным этапом.</p> : null}
    </div>
  );
}

function ReviewPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const frameId = useUiStore((state) => state.selectedFrameId);
  const frame = project.scenes.flatMap((scene) => scene.frames).find((item) => item.id === frameId);
  const generation = frame?.generations.find((item) => item.id === frame.selectedGenerationId);
  const lock = useMutation({
    mutationFn: () => api.post(`/api/frames/${frame?.id}/lock`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  return (
    <section className="sideSection">
      <h2>Проверка</h2>
      {generation?.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, generation.outputFilePath)} /> : <div className="imagePlaceholder">Нет генерации</div>}
      {["Лицо верное", "Волосы верные", "Одежда верная", "Архитектура верная", "Реквизит верный", "Свет верный", "Стиль совпадает"].map((item) => <label className="checkline" key={item}><input type="checkbox" /> {item}</label>)}
      <button disabled={!generation || generation.status !== "SUCCESS"} onClick={() => lock.mutate()}><Check size={16} /> Утвердить и закрепить кадр</button>
    </section>
  );
}

function GenerationsScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const frames = project.scenes.flatMap((scene) => scene.frames.map((frame) => ({ ...frame, sceneName: scene.name })));
  const selectGeneration = useMutation({
    mutationFn: ({ frameId, generationId }: { frameId: string; generationId: string }) =>
      api.put(`/api/frames/${frameId}/selected-generation`, { generationId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  return (
    <section className="referenceList">
      <h2>Генерации</h2>
      {frames.map((frame) => (
        <div className="versionBlock" key={frame.id}>
          <div className="toolbar"><h3>{frame.frameCode}</h3><span className="muted">{frame.sceneName}</span></div>
          {frame.generations.length ? frame.generations.map((generation) => {
            const selected = generation.id === frame.selectedGenerationId;
            const locked = selected && frame.status === "LOCKED";
            return <label className={`versionRow generationCandidate${selected ? " generationCandidateSelected" : ""}`} key={generation.id}>
              <input
                aria-label={`Select generation ${generation.id}`}
                checked={selected}
                disabled={generation.status !== "SUCCESS" || selectGeneration.isPending}
                name={`selected-generation-${frame.id}`}
                onChange={() => selectGeneration.mutate({ frameId: frame.id, generationId: generation.id })}
                type="radio"
              />
              <div>
                <strong>{generation.status}</strong>
                {selected ? <span className="status status-selected">SELECTED</span> : null}
                {locked ? <StatusBadge status="LOCKED" /> : null}
                <small>{generation.model} / {generation.provider}</small>
                <small>{generation.generationType} / {generation.id.slice(0, 8)} / {new Date(generation.createdAt).toLocaleString()}</small>
                <small>{generation.targetWidth && generation.targetHeight ? `${generation.targetWidth} x ${generation.targetHeight}` : "без target geometry"} / crop {generation.requiresCrop ? "да" : "нет"}</small>
              </div>
              <div className="miniActions">
                {generation.outputFilePath ? <img src={projectFileUrl(project, generation.outputFilePath)} /> : null}
              </div>
            </label>;
          }) : <p className="muted">Для кадра ещё нет генераций.</p>}
        </div>
      ))}
    </section>
  );
}

function SettingsScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<{ ok: boolean; provider: string }>("/api/health") });
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
  return (
    <section className="fieldStack">
      <div className="toolbar"><h2>Настройки</h2><button onClick={() => save.mutate()}><Save size={16} /> Сохранить</button></div>
      <div className="refRow"><Settings size={15} /><span>API</span><small>{health.data?.ok ? `готов / ${health.data.provider}` : "проверка..."}</small></div>
      <label>Fallback aspect ratio<input value={draft.defaultAspectRatio} onChange={(event) => setDraft({ ...draft, defaultAspectRatio: event.target.value })} /></label>
      <label>Fallback resolution<input value={draft.defaultResolution} onChange={(event) => setDraft({ ...draft, defaultResolution: event.target.value })} /></label>
      <label>Draft-модель<input value={draft.defaultDraftModel} onChange={(event) => setDraft({ ...draft, defaultDraftModel: event.target.value })} /></label>
      <label>Production-модель<input value={draft.defaultProductionModel} onChange={(event) => setDraft({ ...draft, defaultProductionModel: event.target.value })} /></label>
    </section>
  );
}

function ReferenceSlots({ project, ownerType, ownerId, references, slots, onChanged }: { project: Project; ownerType: OwnerType; ownerId: string; references: Reference[]; slots: string[]; onChanged(): void }) {
  return (
    <section className="sideSection">
      <h3>Референсы</h3>
      {slots.map((slot) => {
        const versions = references.filter((reference) => (reference.type ?? "REF") === slot).sort((left, right) => right.version - left.version);
        const locked = versions.filter((reference) => reference.status === "LOCKED");
        const canonical = locked[0];
        const history = versions.filter((reference) => ownerType === "style" ? reference.status !== "LOCKED" : reference.id !== canonical?.id);
        const styleAtLimit = ownerType === "style" && locked.length >= 6;
        return (
          <div className="versionBlock" key={slot}>
            <div className="toolbar"><strong>{slot}</strong><ReferenceUpload ownerType={ownerType} ownerId={ownerId} type={slot} label={ownerType === "style" ? "+ Добавить референс" : "Загрузить"} onDone={onChanged} /></div>
            {ownerType === "style" ? <p className="muted">Активных style refs: {locked.length}/6. Используются только как visual style guidance, не как содержимое сцены.</p> : null}
            {styleAtLimit ? <p className="warning">Достигнут лимит 6 активных style references. Выведите один из канона перед закреплением нового.</p> : null}
            {ownerType === "style" && locked.length ? (
              <div>
                <p className="muted">Активный style canon</p>
                {locked.map((reference) => <ReferenceVersion key={reference.id} project={project} ownerType={ownerType} reference={reference} onChanged={onChanged} />)}
              </div>
            ) : canonical ? (
              <div>
                <p className="muted">Текущий канон</p>
                <ReferenceVersion project={project} ownerType={ownerType} reference={canonical} onChanged={onChanged} />
              </div>
            ) : <p className="warning">LOCKED-референс для этого слота не выбран.</p>}
            {history.length ? (
              <details>
                <summary>Версии и кандидаты ({history.length})</summary>
                {history.map((reference) => <ReferenceVersion key={reference.id} project={project} ownerType={ownerType} reference={reference} onChanged={onChanged} />)}
              </details>
            ) : null}
            {!versions.length ? <p className="muted">Версий пока нет.</p> : null}
          </div>
        );
      })}
    </section>
  );
}

function ReferenceUpload({ ownerType, ownerId, type, label, onDone }: { ownerType: OwnerType; ownerId: string; type: string; label: string; onDone(): void }) {
  const upload = useMutation({
    mutationFn: async (file: File) => api.post(referenceUploadPath(ownerType, ownerId), { type, fileName: file.name, dataUrl: await readFileAsDataUrl(file), description: "" }),
    onSuccess: onDone
  });
  return (
    <label className="uploadTile compactUpload">
      <ImagePlus size={15} /><span>{upload.isPending ? "Загрузка" : label}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); }} />
    </label>
  );
}

function ReferenceVersion({ project, ownerType, reference, onChanged }: { project: Project; ownerType: OwnerType; reference: Reference; onChanged(): void }) {
  const approve = useReferenceAction(ownerType, reference.id, "approve", onChanged);
  const reject = useReferenceAction(ownerType, reference.id, "reject", onChanged);
  const lock = useReferenceAction(ownerType, reference.id, "lock", onChanged);
  const deprecate = useReferenceAction(ownerType, reference.id, "deprecate", onChanged);
  return (
    <div className="versionRow">
      <div>
        <strong>V{reference.version}</strong> <StatusBadge status={reference.status} />
        <small>{reference.code}</small>
      </div>
      <div className="miniActions">
        {reference.filePath ? <img src={projectFileUrl(project, reference.filePath)} /> : null}
        <button disabled={reference.status !== "DRAFT"} onClick={() => approve.mutate()}><Check size={14} /> Одобрить</button>
        <button disabled={reference.status === "LOCKED"} onClick={() => lock.mutate()}><Check size={14} /> Закрепить</button>
        <button disabled={reference.status !== "LOCKED"} onClick={() => deprecate.mutate()}><X size={14} /> Убрать из канона</button>
        <button disabled={reference.status === "LOCKED"} onClick={() => reject.mutate()}><X size={14} /> Отклонить</button>
      </div>
    </div>
  );
}

function useReferenceAction(ownerType: OwnerType, referenceId: string, action: "approve" | "reject" | "lock" | "deprecate", onChanged: () => void) {
  return useMutation({
    mutationFn: () => api.post(`/api/references/${ownerType}/${referenceId}/${action}`, {}),
    onSuccess: onChanged
  });
}

function StatusBadge({ status }: { status: AssetStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status}</span>;
}

const characterSlots = ["MASTER", "FRONT", "THREE_QUARTER_LEFT", "THREE_QUARTER_RIGHT", "PROFILE_LEFT", "PROFILE_RIGHT", "FULL_BODY_FRONT", "FULL_BODY_SIDE", "FULL_BODY_BACK", "EXPRESSION", "OTHER"];
const outfitSlots = ["MASTER", "FRONT", "SIDE", "BACK", "DETAIL"];
const locationSlots = ["MASTER", "FLOOR_PLAN", "DETAIL", "OTHER"];

function referenceUploadPath(ownerType: OwnerType, ownerId: string): string {
  if (ownerType === "character") return `/api/characters/${ownerId}/references`;
  if (ownerType === "outfit") return `/api/outfits/${ownerId}/references`;
  if (ownerType === "location") return `/api/locations/${ownerId}/references`;
  if (ownerType === "locationAngle") return `/api/location-angles/${ownerId}/references`;
  return `/api/styles/${ownerId}/references`;
}

function projectFileUrl(project: Project, relativePath: string): string {
  const folder = project.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return `/project-files/${folder}/${relativePath}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function environmentLabel(key: string): string {
  const labels: Record<string, string> = {
    mainLight: "Основной свет",
    curtains: "Шторы",
    window: "Окно",
    door: "Дверь"
  };
  return labels[key] ?? key;
}

function referenceKindLabel(kind: string): string {
  const labels: Record<string, string> = {
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

function emptyState(sceneId: string): StoryStateDocument {
  return {
    sceneId,
    time: { description: "" },
    environment: {},
    characters: {},
    props: {},
    storyFacts: []
  };
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

function toPositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function parseRatio(value: string): number {
  const [width, height] = value.split(":").map(Number);
  return width && height ? width / height : 16 / 9;
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
