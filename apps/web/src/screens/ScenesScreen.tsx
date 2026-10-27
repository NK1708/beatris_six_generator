import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, LayoutGrid, Loader2, MapPin, Plus, Save } from "lucide-react";
import { api } from "../api.js";
import type { Project, Scene, SceneDraft } from "../model.js";
import { sceneCatalogStats, sceneIdentifier } from "../sceneCatalog.js";
import { useUiStore } from "../state.js";
import { emptySceneDraft, sceneToDraft } from "./AssetLibrary.js";
import { StoryStateEditor } from "./FrameWorkspace.js";

type SceneView = "catalog" | "editor";

export function ScenesScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectScene = useUiStore((state) => state.selectScene);
  const setSection = useUiStore((state) => state.setSection);
  const selected = project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0];
  const [view, setView] = React.useState<SceneView>("catalog");
  const [draft, setDraft] = React.useState<SceneDraft>(emptySceneDraft(project));
  const [edit, setEdit] = React.useState<SceneDraft>(emptySceneDraft(project));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });

  const createScene = useMutation({
    mutationFn: () => api.post<Scene>("/api/scenes", { projectId: project.id, sequence: project.scenes.length + 1, ...draft }),
    onSuccess: (scene) => {
      selectScene(scene.id);
      setDraft(emptySceneDraft(project));
      setView("editor");
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
  const openEditor = (scene: Scene) => {
    selectScene(scene.id);
    setView("editor");
  };
  const openStoryboard = (scene: Scene) => {
    selectScene(scene.id);
    setSection("storyboard");
  };

  if (view === "editor" && selected) {
    return (
      <SceneEditor
        project={project}
        scene={selected}
        edit={edit}
        hasChanges={hasSceneChanges}
        isSaving={updateScene.isPending}
        saveError={updateScene.error?.message}
        onBack={() => setView("catalog")}
        onChange={setEdit}
        onSave={() => updateScene.mutate()}
        onOpenStoryboard={() => openStoryboard(selected)}
        stats={sceneCatalogStats(selected)}
      />
    );
  }

  return (
    <section className="sceneCatalog">
      <header className="sceneCatalogHeader">
        <div>
          <span className="muted">{project.name}</span>
          <h2>Сцены</h2>
          <p className="muted">Каталог narrative-контекста проекта</p>
        </div>
        <details className="sceneCreatePanel">
          <summary><Plus size={15} /> Новая сцена</summary>
          <div className="sceneCreateFields">
            <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <button disabled={!draft.name.trim() || createScene.isPending} onClick={() => createScene.mutate()}>{createScene.isPending ? <Loader2 className="spin" size={16} /> : <Clapperboard size={16} />} Создать сцену</button>
            {createScene.error ? <p className="warning">{createScene.error.message}</p> : null}
          </div>
        </details>
      </header>

      {project.scenes.length ? <div className="sceneCatalogGrid">
        {project.scenes.map((scene) => <SceneCatalogCard key={scene.id} project={project} scene={scene} selected={scene.id === selected?.id} onEdit={() => openEditor(scene)} onStoryboard={() => openStoryboard(scene)} />)}
      </div> : <div className="storyboardEmpty">Создайте первую сцену, чтобы начать работу с историей.</div>}
    </section>
  );
}

function SceneCatalogCard({ project, scene, selected, onEdit, onStoryboard }: {
  project: Project;
  scene: Scene;
  selected: boolean;
  onEdit(): void;
  onStoryboard(): void;
}) {
  const stats = sceneCatalogStats(scene);
  const location = project.locations.find((item) => item.id === scene.locationId)?.name ?? "Локация не выбрана";
  return (
    <article className={selected ? "sceneCard sceneCardSelected" : "sceneCard"}>
      <div className="sceneCardHeading">
        <span className="sceneIdentifier">{sceneIdentifier(scene)}</span>
        <h3>{scene.name}</h3>
      </div>
      <div className="sceneCardContext">
        <span><MapPin size={14} /> {location}</span>
        <span>{scene.timeDescription.trim() || "Время не задано"}</span>
      </div>
      <div className="sceneMetrics" aria-label={`Статусы кадров ${sceneIdentifier(scene)}`}>
        <span><strong>{stats.total}</strong> кадров</span>
        <span><strong>{stats.locked}</strong> LOCKED</span>
        <span><strong>{stats.review}</strong> на проверке</span>
        <span><strong>{stats.other}</strong> остальных</span>
      </div>
      <div className="sceneProgressLabel"><span>Готовность</span><strong>{stats.readinessPercent}%</strong></div>
      <div className="sceneProgress" role="progressbar" aria-label={`Готовность ${sceneIdentifier(scene)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.readinessPercent}><span style={{ width: `${stats.readinessPercent}%` }} /></div>
      <div className="sceneCardActions">
        <button type="button" onClick={onEdit}><Clapperboard size={16} /> Редактор</button>
        <button type="button" onClick={onStoryboard}><LayoutGrid size={16} /> Раскадровка</button>
      </div>
    </article>
  );
}

function SceneEditor({ project, scene, edit, hasChanges, isSaving, saveError, stats, onBack, onChange, onSave, onOpenStoryboard }: {
  project: Project;
  scene: Scene;
  edit: SceneDraft;
  hasChanges: boolean;
  isSaving: boolean;
  saveError: string | undefined;
  stats: ReturnType<typeof sceneCatalogStats>;
  onBack(): void;
  onChange(next: SceneDraft): void;
  onSave(): void;
  onOpenStoryboard(): void;
}) {
  return (
    <section className="sceneEditor">
      <header className="sceneEditorHeader">
        <button type="button" onClick={onBack}><ArrowLeft size={16} /> Каталог сцен</button>
        <div className="sceneEditorHeading"><span className="sceneIdentifier">{sceneIdentifier(scene)}</span><h2>{scene.name}</h2></div>
        {hasChanges ? <span className="status status-unsaved">Не сохранено</span> : null}
        <button disabled={!hasChanges || !edit.name.trim() || isSaving} onClick={onSave}>{isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить</button>
      </header>

      <div className="sceneEditorFields">
        <label>Название<input value={edit.name} onChange={(event) => onChange({ ...edit, name: event.target.value })} /></label>
        <label>Время<input value={edit.timeDescription} onChange={(event) => onChange({ ...edit, timeDescription: event.target.value })} /></label>
        <label>Локация<select value={edit.locationId ?? ""} onChange={(event) => onChange({ ...edit, locationId: event.target.value || null })}><option value="">Не выбрана</option>{project.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label>Стиль<select value={edit.styleProfileId ?? ""} onChange={(event) => onChange({ ...edit, styleProfileId: event.target.value || null })}><option value="">Первый LOCKED стиль</option>{project.styleProfiles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        <label className="sceneDescriptionField">Описание сцены<textarea value={edit.description} onChange={(event) => onChange({ ...edit, description: event.target.value })} /></label>
      </div>

      <section className="sceneCharacters">
        <h3>Персонажи сцены</h3>
        <div className="sceneCharacterGrid">{project.characters.map((character) => (
          <label className="checkline" key={character.id}>
            <input type="checkbox" checked={edit.characterIds.includes(character.id)} onChange={(event) => onChange({ ...edit, characterIds: event.target.checked ? [...edit.characterIds, character.id] : edit.characterIds.filter((id) => id !== character.id) })} />
            {character.name}
          </label>
        ))}</div>
        <p className="muted">Outfit не привязан к сцене: текущий образ персонажа задаётся в Story State.</p>
      </section>

      {saveError ? <p className="warning">{saveError}</p> : null}

      <section className="sceneFramesSummary">
        <div><h3>Кадры сцены</h3><p className="muted">{stats.total} кадров · {stats.locked} LOCKED · {stats.review} на проверке · {stats.other} остальных</p></div>
        <button type="button" onClick={onOpenStoryboard}><LayoutGrid size={16} /> Открыть раскадровку</button>
      </section>

      <details className="sceneStoryState">
        <summary>Текущее состояние сцены</summary>
        <p className="muted">Авторитетное текущее состояние сцены, используемое её кадрами.</p>
        <StoryStateEditor project={project} />
      </details>
    </section>
  );
}
