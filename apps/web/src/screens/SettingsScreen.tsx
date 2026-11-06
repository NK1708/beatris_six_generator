import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
export function SettingsScreen({ project }: { project: Project }) {
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
    <section className="fieldStack settingsForm" aria-label="Настройки проекта">
      <div className="toolbar"><h2>Настройки</h2><button onClick={() => save.mutate()}><Save size={16} /> Сохранить</button></div>
      <div className="refRow"><Settings size={15} /><span>API</span><small>{health.data?.ok ? `готов / ${health.data.provider}` : "проверка..."}</small></div>
      <label>Fallback aspect ratio<input value={draft.defaultAspectRatio} onChange={(event) => setDraft({ ...draft, defaultAspectRatio: event.target.value })} /></label>
      <label>Fallback resolution<input value={draft.defaultResolution} onChange={(event) => setDraft({ ...draft, defaultResolution: event.target.value })} /></label>
      <label>Draft-модель<input value={draft.defaultDraftModel} onChange={(event) => setDraft({ ...draft, defaultDraftModel: event.target.value })} /></label>
      <label>Production-модель<input value={draft.defaultProductionModel} onChange={(event) => setDraft({ ...draft, defaultProductionModel: event.target.value })} /></label>
    </section>
  );
}
