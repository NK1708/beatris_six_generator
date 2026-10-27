import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Box, Brush, Check, Clapperboard, Download, Folder, ImagePlus, Loader2, Map, Play, Save, Settings, Trash2, Upload, User, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import { StatusBadge } from "../components/References.js";
import type { ReviewTarget } from "../reviewTarget.js";
import { canLockFrame, canSelectFrameGeneration, FrameLockReadinessNotice, frameLockReadinessQueryKey, useFrameLockReadiness } from "../components/FrameLockReadiness.js";
export function ReviewPanel({ project, target }: { project: Project; target: ReviewTarget | null }) {
  const queryClient = useQueryClient();
  const readiness = useFrameLockReadiness(target?.frame.id);
  const lock = useMutation({
    mutationFn: () => api.post(`/api/frames/${target?.frame.id}/lock`, {}),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", project.id] }); void readiness.refetch(); }
  });
  return (
    <section className="sideSection">
      <h2>Проверка результата</h2>
      {target ? <>
        <p className="muted">{target.frame.frameCode} · {target.generation.id.slice(0, 8)} · {target.generation.provider}</p>
        {target.generation.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, target.generation.outputFilePath)} alt={`Результат ${target.frame.frameCode}`} /> : <div className="imagePlaceholder">Нет изображения</div>}
        <p className="muted">{target.isSelected ? target.frame.status === "LOCKED" ? "Выбран и закреплён" : "Выбран для закрепления" : "Сначала выберите этот результат в списке кандидатов."}</p>
      </> : <div className="imagePlaceholder">Откройте результат для проверки.</div>}
      {target ? <FrameLockReadinessNotice readiness={readiness.data} loading={readiness.isPending} /> : null}
      <button disabled={!target || !canLockFrame(readiness.data, target.isSelected, target.generation.status, target.frame.status) || lock.isPending} onClick={() => lock.mutate()}><Check size={16} /> Утвердить и закрепить кадр</button>
      {lock.error ? <p className="warning">{lock.error.message}</p> : null}
    </section>
  );
}

export function GenerationsScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const openGeneration = useUiStore((state) => state.openGeneration);
  const reviewFrameId = useUiStore((state) => state.reviewFrameId);
  const reviewGenerationId = useUiStore((state) => state.reviewGenerationId);
  const repairRequest = useUiStore((state) => state.repairRequest);
  const clearRepairRequest = useUiStore((state) => state.clearRepairRequest);
  const frames = project.scenes.flatMap((scene) => scene.frames.map((frame) => ({ ...frame, sceneName: scene.name })));
  const [repairSource, setRepairSource] = React.useState<{ frameId: string; generationId: string } | null>(null);
  React.useEffect(() => {
    if (repairRequest) {
      setRepairSource(repairRequest);
      clearRepairRequest();
    }
  }, [repairRequest, clearRepairRequest]);
  const [repairChanges, setRepairChanges] = React.useState("");
  const [repairForbidden, setRepairForbidden] = React.useState("");
  const [repairExportId, setRepairExportId] = React.useState("");
  const repairInput = React.useRef<HTMLInputElement>(null);
  const repairFrame = frames.find((item) => item.id === repairSource?.frameId);
  const repairGeneration = repairFrame?.generations.find((item) => item.id === repairSource?.generationId);
  const repairExports = useQuery({
    queryKey: ["chatgpt-exports", repairSource?.frameId],
    queryFn: () => api.get<ChatGPTExportSummary[]>(`/api/frames/${repairSource?.frameId}/exports/chatgpt`),
    enabled: Boolean(repairSource)
  });
  const matchingRepairExports = repairExports.data?.filter((item) => item.operation === "REPAIR" && item.repairSourceGenerationId === repairSource?.generationId) ?? [];
  const exportRepair = useMutation({
    mutationFn: async () => {
      if (!repairSource) throw new Error("Выберите исходную генерацию.");
      const response = await fetch(`/api/frames/${repairSource.frameId}/export/chatgpt/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGenerationId: repairSource.generationId, changes: splitLines(repairChanges), forbidden: splitLines(repairForbidden) })
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "Не удалось экспортировать repair.");
      }
      const blob = await response.blob();
      const name = /filename="(?<name>[^"]+)"/u.exec(response.headers.get("Content-Disposition") ?? "")?.groups?.name ?? "Bearridge_REPAIR_CHATGPT.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return response.headers.get("X-Bearridge-Export-Id") ?? "";
    },
    onSuccess: (exportId) => {
      setRepairExportId(exportId);
      void queryClient.invalidateQueries({ queryKey: ["chatgpt-exports", repairSource?.frameId] });
    }
  });
  const importRepair = useMutation({
    mutationFn: async (file: File) => {
      if (!repairSource || !repairExportId) throw new Error("Выберите repair export.");
      return api.post<Generation>(`/api/frames/${repairSource.frameId}/import/chatgpt`, {
        exportId: repairExportId,
        fileName: file.name,
        dataUrl: await readFileAsDataUrl(file)
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  const selectGeneration = useMutation({
    mutationFn: ({ frameId, generationId }: { frameId: string; generationId: string }) =>
      api.put(`/api/frames/${frameId}/selected-generation`, { generationId }),
    onSuccess: (_result, variables) => {
      openGeneration(variables.frameId, variables.generationId);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(variables.frameId) });
    }
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
            const opened = reviewFrameId === frame.id && reviewGenerationId === generation.id;
            return <div className={`versionRow generationCandidate${selected ? " generationCandidateSelected" : ""}${opened ? " generationCandidateOpen" : ""}`} key={generation.id}>
              <input
                aria-label={`Select generation ${generation.id}`}
                checked={selected}
                disabled={!canSelectFrameGeneration(frame.status, generation.status) || selectGeneration.isPending}
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
                <button type="button" aria-pressed={opened} onClick={() => openGeneration(frame.id, generation.id)}>Открыть</button>
                {generation.status === "SUCCESS" ? <button type="button" onClick={() => {
                  openGeneration(frame.id, generation.id);
                  setRepairSource({ frameId: frame.id, generationId: generation.id });
                  setRepairChanges("");
                  setRepairForbidden("");
                  setRepairExportId("");
                }}>Repair Generation</button> : null}
              </div>
            </div>;
          }) : <p className="muted">Для кадра ещё нет генераций.</p>}
        </div>
      ))}
      {repairSource && repairGeneration ? <section className="versionBlock">
        <div className="toolbar"><h3>Repair Generation · {repairFrame?.frameCode} · {repairGeneration.id.slice(0, 8)}</h3><button type="button" onClick={() => setRepairSource(null)}>Закрыть</button></div>
        {repairGeneration.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, repairGeneration.outputFilePath)} alt="Исходная Generation" /> : null}
        <label>Change Only<textarea value={repairChanges} onChange={(event) => setRepairChanges(event.target.value)} placeholder="Одно исправление на строку" /></label>
        <label>Forbidden<textarea value={repairForbidden} onChange={(event) => setRepairForbidden(event.target.value)} placeholder="Одно ограничение на строку" /></label>
        <button type="button" disabled={!splitLines(repairChanges).length || exportRepair.isPending} onClick={() => exportRepair.mutate()}><Download size={16} /> Export Repair for ChatGPT</button>
        {exportRepair.error ? <p className="warning">{exportRepair.error.message}</p> : null}
        {matchingRepairExports.length ? <label>Repair export<select value={repairExportId} onChange={(event) => setRepairExportId(event.target.value)}><option value="">Выберите export</option>{matchingRepairExports.map((item) => <option key={item.exportId} value={item.exportId}>{new Date(item.createdAt).toLocaleString()} · {item.exportId.slice(0, 8)}</option>)}</select></label> : null}
        <input ref={repairInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) importRepair.mutate(file); event.target.value = ""; }} />
        <button type="button" disabled={!repairExportId || importRepair.isPending} onClick={() => repairInput.current?.click()}><Upload size={16} /> Import repaired image</button>
        {importRepair.error ? <p className="warning">{importRepair.error.message}</p> : null}
      </section> : null}
    </section>
  );
}
