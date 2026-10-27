import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import { ReferenceSlots, StatusBadge, characterSlots, outfitSlots, locationSlots } from "../components/References.js";
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

export function emptySceneDraft(project: Project): SceneDraft {
  return {
    name: "",
    description: "",
    locationId: project.locations[0]?.id ?? null,
    styleProfileId: project.styleProfiles[0]?.id ?? null,
    timeDescription: "",
    characterIds: []
  };
}

export function sceneToDraft(scene: Scene): SceneDraft {
  return {
    name: scene.name,
    description: scene.description,
    locationId: scene.locationId,
    styleProfileId: scene.styleProfileId,
    timeDescription: scene.timeDescription,
    characterIds: scene.characterIds
  };
}

export function emptyFrameDraft(): FrameDraft {
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
    characterCastMode: "EXPLICIT",
    additionalCharacterReferenceIds: {},
    locationId: null,
    locationAngleId: null,
    styleProfileId: null,
    targetWidth: "1200",
    targetHeight: "675"
  };
}

export function frameToDraft(frame: Frame): FrameDraft {
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
    characterCastMode: frame.characterCastSource === "EXPLICIT" ? "EXPLICIT" : !frame.characterCastSource || frame.characterCastSource === "LEGACY_UNKNOWN" ? "LEGACY" : "INHERIT",
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

export function DeleteProjectPanel({ project }: { project: Project }) {
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

export function CharactersScreen({ project }: { project: Project }) {
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

export function LocationsScreen({ project }: { project: Project }) {
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

export function StylesScreen({ project }: { project: Project }) {
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
