import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import { DeleteProjectPanel } from "./AssetLibrary.js";
import { ApiGenerationTools } from "./ApiGenerationTools.js";
export function AdvancedToolsScreen({ project }: { project: Project }) {
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
        <h2>Developer Tools</h2>
        <button disabled={!benchmarkReady || seedBenchmark.isPending} onClick={() => seedBenchmark.mutate()}>{seedBenchmark.isPending ? <Loader2 className="spin" size={16} /> : <Clapperboard size={16} />} Подготовить benchmark</button>
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
      <ApiGenerationTools project={project} />
    </section>
  );
}

export function ProjectOverview({ project }: { project: Project }) {
  return <section className="projectOverview">
    <h2>Сводка проекта</h2>
    <div className="summaryGrid">
      <Metric label="Персонажи" value={project.characters.length} />
      <Metric label="Локации" value={project.locations.length} />
      <Metric label="Стили" value={project.styleProfiles.length} />
      <Metric label="Сцены" value={project.scenes.length} />
    </div>
    <p className="muted">Данные проекта хранятся в его папке.</p>
    <details className="projectDangerDisclosure">
      <summary>Удаление проекта</summary>
      <DeleteProjectPanel project={project} />
    </details>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}
