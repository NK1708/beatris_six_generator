import { defaultInspectorCollapsed, frameStatusLabel, generationStatusLabel } from "../frameWorkspaceUi.js";
import { equalDrafts, reconcileFrameDraft } from "../draftReconciliation.js";
import { GenerationCompare } from "../components/GenerationCompare.js";
import { FrameReviewWorkspace, ReviewActionFeedback } from "../components/FrameReviewWorkspace.js";
import { LockConfirmationDialog } from "../components/LockConfirmationDialog.js";
import { useFrameReviewActions } from "../components/useFrameReviewActions.js";
import { GenerationWorkspace } from "../components/GenerationWorkspace.js";
import { generationRequest } from "../generationWorkspace.js";
import { resolveTargetComparisonSource } from "../targetStateComparison.js";
import React from "react";
import { StoryStateHolder } from "../components/StoryStateHolder.js";
import { FrameCanvas } from "../components/FrameCanvas.js";
import { FrameInspector, FrameInspectorPanel, type InspectorTab } from "../components/FrameInspector.js";
import { FrameFilmstrip } from "../components/FrameFilmstrip.js";
import { FrameStatusBar } from "../components/FrameStatusBar.js";
import { EnvironmentStateEditor, reportEnvironmentValidity } from "../components/EnvironmentStateEditor.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRightOpen, PanelRightClose, ArrowLeft, ArrowRight, Brush, Check, Download, ImagePlus, Loader2, Map, Save, Settings, Upload, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import type { StoryStateDocument } from "@bearridge/shared";
import { emptyFrameDraft, frameToDraft } from "./AssetLibrary.js";
import { createFrameForScene } from "../frameCreation.js";
import { frameWorkspaceCandidates, continuityContractSummary, initialFrameSections, openedFrameCandidate, selectedChatGPTReceipt, toggleFrameSection, type FrameSection } from "../frameWorkspaceUi.js";
import { FrameTargetStoryStatePanel, frameTargetStoryStateQueryKey } from "../components/FrameTargetStoryStatePanel.js";
import { FrameLockReadinessNotice, frameLockReadinessQueryKey, useFrameLockReadiness } from "../components/FrameLockReadiness.js";
export function FrameEditor({ project }: { project: Project }) {
  const selectedSceneId = useUiStore(state => state.selectedSceneId);
  const selectedFrameId = useUiStore(state => state.selectedFrameId);
  const [centralMode, setCentralMode] = React.useState<"image" | "state" | "generation" | "compare" | "review">("image");
  const [inspectorTab, setInspectorTab] = React.useState<InspectorTab>("staging");
  const inspectorCollapsed = useUiStore(state => state.frameInspectorPreferences[project.id]?.[centralMode] ?? defaultInspectorCollapsed[centralMode]);
  const setInspectorCollapsed: React.Dispatch<React.SetStateAction<boolean>> = next => { const current = useUiStore.getState().frameInspectorPreferences[project.id]?.[centralMode] ?? defaultInspectorCollapsed[centralMode]; useUiStore.getState().setFrameInspectorCollapsed(project.id, centralMode, typeof next === "function" ? next(current) : next); };
  const scene = project.scenes.find(item => item.id === selectedSceneId) ?? project.scenes[0];
  const frame = scene?.frames.find(item => item.id === selectedFrameId) ?? scene?.frames[0];
  return <FrameEditorSession key={project.id + ":" + (scene?.id ?? "none") + ":" + (frame?.id ?? "empty")} project={project} centralMode={centralMode} setCentralMode={setCentralMode} inspectorTab={inspectorTab} setInspectorTab={setInspectorTab} inspectorCollapsed={inspectorCollapsed} setInspectorCollapsed={setInspectorCollapsed} />;
}
function FrameEditorSession({ project, centralMode, setCentralMode, inspectorTab, setInspectorTab, inspectorCollapsed, setInspectorCollapsed }: { project: Project; centralMode: "image" | "state" | "generation" | "compare" | "review"; setCentralMode(mode: "image" | "state" | "generation" | "compare" | "review"): void; inspectorTab: InspectorTab; setInspectorTab(tab: InspectorTab): void; inspectorCollapsed: boolean; setInspectorCollapsed: React.Dispatch<React.SetStateAction<boolean>> }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectedFrameId = useUiStore((state) => state.selectedFrameId);
  const selectScene = useUiStore((state) => state.selectScene);
  const selectFrame = useUiStore((state) => state.selectFrame);
  const returnToStoryboard = useUiStore((state) => state.returnToStoryboard);
  const setFrameDraftDirty = useUiStore((state) => state.setFrameDraftDirty);
  const openRepair = useUiStore((state) => state.openRepair);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const sceneFrames = scene?.frames ?? [];
  const frame = sceneFrames.find((item) => item.id === selectedFrameId) ?? sceneFrames[0];
  const [action, setAction] = React.useState("");
  const [frameDraft, storeFrameDraft] = React.useState<FrameDraft>(() => frame ? frameToDraft(frame) : emptyFrameDraft());
  const draftRef = React.useRef(frameDraft);
  const sessionMounted = React.useRef(true);
  React.useEffect(() => { sessionMounted.current = true; return () => { sessionMounted.current = false; }; }, []);
  const [targetDirty, setTargetDirty] = React.useState(false);
  const [sceneDirty, setSceneDirty] = React.useState(false);
  const setFrameDraft: React.Dispatch<React.SetStateAction<FrameDraft>> = next => {
    const value = typeof next === "function" ? next(draftRef.current) : next;
    draftRef.current = value;
    setFrameDraftDirty(targetDirty || sceneDirty || Boolean(frame && JSON.stringify(value) !== JSON.stringify(frameToDraft(frame))));
    storeFrameDraft(value);
  };
  const [targetWidth, setTargetWidth] = React.useState("1200");
  const [targetHeight, setTargetHeight] = React.useState("675");
  const inheritedLocationId = frameDraft.locationId || scene?.locationId || "";
  const effectiveLocation = project.locations.find((location) => location.id === inheritedLocationId);
  const selectedLocation = project.locations.find((location) => location.id === inheritedLocationId) ?? project.locations[0];
  const [selectedExportId, setSelectedExportId] = React.useState("");
  const [lastImport, setLastImport] = React.useState<{ frameId: string; exportId: string; generation: Generation } | null>(null);
  const [openedCandidateId, setOpenedCandidateId] = React.useState<string | null>(null);
  const [imageView, setImageView] = React.useState<"result" | "base">("result");
  const [openSections, setOpenSections] = React.useState(() => initialFrameSections(frame?.generationStrategy ?? "NEW_COMPOSITION"));
  const toggleSection = (section: FrameSection) => setOpenSections((current) => toggleFrameSection(current, section));
  const importInput = React.useRef<HTMLInputElement>(null);
  const preview = useQuery({
    queryKey: ["preview", frame?.id],
    queryFn: () => generationRequest<PreviewResponse>(`/api/frames/${frame?.id}/preview`),
    retry: false,
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
  const frameIndex = sceneFrames.findIndex((item) => item.id === frame?.id);
  const candidates = frame ? frameWorkspaceCandidates(frame) : [];
  const openedCandidate = openedCandidateId ? frame?.generations.find(item => item.id === openedCandidateId) : openedFrameCandidate(candidates, null);
  const viewCandidates = openedCandidate && !candidates.some(item => item.id === openedCandidate.id) ? [...candidates, openedCandidate] : candidates;
  const previousFrame = scene?.frames.find((item) => item.id === frame?.previousFrameId);
  const previousImage = previousFrame?.status === "LOCKED" ? previousFrame.generations.find((item) => item.id === previousFrame.selectedGenerationId && item.status === "SUCCESS") : undefined;
  const base = frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? preview.data?.context.previousLockedFrame ?? (previousImage && previousFrame ? { id: previousFrame.id, frameCode: previousFrame.frameCode, generationId: previousImage.id, outputFilePath: previousImage.outputFilePath } : undefined) : undefined;
  const selectedExport = selectedChatGPTReceipt(chatGPTExports.data, selectedExportId);
  const showingBase = imageView === "base" && Boolean(base);
  const selectedCandidate = Boolean(openedCandidate && frame && openedCandidate.id === frame.selectedGenerationId);
  const continuitySummary = continuityContractSummary(frameDraft.continuityEditContract, preview.data?.detectedContinuityChanges ?? []);
  const reviewActions = useFrameReviewActions(project, frame, hasFrameChanges || targetDirty || sceneDirty);
  const lockReadiness = reviewActions.readiness;
  const savedTarget = useQuery({ queryKey: frameTargetStoryStateQueryKey(frame?.id ?? "none"), queryFn: () => api.getFrameTargetStoryState(frame!.id), enabled: Boolean(frame), retry: false });
  React.useEffect(() => { if (centralMode === "review" && frame) void reviewActions.readiness.refetch(); }, [centralMode, frame?.id, savedTarget.data?.status === "AVAILABLE" ? savedTarget.data.revision : null]);
  React.useEffect(() => {
    if (centralMode === "generation" && frame) void queryClient.invalidateQueries({ queryKey: ["preview", frame.id] });
  }, [centralMode, frame?.id, savedTarget.data?.status === "AVAILABLE" ? savedTarget.data.revision : null]);
  const createFrame = useMutation({
    mutationFn: () => {
      if (!scene) throw new Error("Выберите сцену для создания кадра.");
      return createFrameForScene(scene, {
        action: newFrameAction,
        locationId: frameDraft.locationId || undefined,
        locationAngleId: frameDraft.locationAngleId || undefined,
        styleProfileId: frameDraft.styleProfileId || undefined,
        targetWidth: toPositiveNumber(targetWidth),
        targetHeight: toPositiveNumber(targetHeight)
      });
    },
    onSuccess: async (created) => {
      // Load the appended Frame before selecting its ID; otherwise the old
      // project response can temporarily fall back to the first Frame.
      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      const current = useUiStore.getState();
      if (current.selectedProjectId === project.id && current.selectedSceneId === scene?.id && current.selectedFrameId === (frame?.id ?? null)) selectFrame(created.frame.id);
    }
  });
  const saveFrame = useMutation({
    mutationFn: async () => {
      if (!frame) throw new Error("Выберите кадр.");
      if (frame.status === "LOCKED") throw new Error("Закреплённый кадр нельзя редактировать.");
      const original = frameToDraft(frame);
      const submitted = draftRef.current;
      const castChanged = submitted.characterCastMode !== original.characterCastMode
        || JSON.stringify(submitted.characterIds) !== JSON.stringify(original.characterIds)
        || JSON.stringify(submitted.additionalCharacterReferenceIds) !== JSON.stringify(original.additionalCharacterReferenceIds);
      const { characterCastMode, characterIds, ...rest } = submitted;
      await api.put<Frame>(`/api/frames/${frame.id}`, {
        ...rest,
        ...(castChanged ? {
          characterCastMode: characterCastMode === "INHERIT" ? "INHERIT" : "EXPLICIT",
          ...(characterCastMode === "INHERIT" ? {} : { characterIds }),
          expectedCharacterCastRevision: frame.characterCastRevision ?? 0
        } : {}),
        targetWidth: toPositiveNumber(submitted.targetWidth),
        targetHeight: toPositiveNumber(submitted.targetHeight)
      });
      return submitted;
    },
    onSuccess: async (submitted) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] })
      ]);
      const current = useUiStore.getState();
      if (!sessionMounted.current || current.selectedProjectId !== project.id || current.selectedFrameId !== frame?.id) return;
      const refreshed = queryClient.getQueryState(["project", project.id]);
      if (refreshed?.status !== "success" || refreshed.isInvalidated) return;
      // PUT returns persistence rows; the existing full-project query supplies
      // the normalized UI Frame, including effective Cast and reference maps.
      const saved = queryClient.getQueryData<Project>(["project", project.id])?.scenes.flatMap(scene => scene.frames).find(item => item.id === frame?.id);
      if (saved) setFrameDraft(local => reconcileFrameDraft(submitted, local, frameToDraft(saved)));
    }
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
      if (!frame || !selectedExport) throw new Error("Выберите ChatGPT export для привязки результата.");
      const generation = await api.post<Generation>(`/api/frames/${frame.id}/import/chatgpt`, {
        exportId: selectedExport.exportId,
        fileName: file.name,
        dataUrl: await readFileAsDataUrl(file)
      });
      return { frameId: frame.id, exportId: selectedExport.exportId, generation };
    },
    onSuccess: (result) => {
      setLastImport(result);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
    }
  });

  React.useEffect(() => {
    if (scene) selectScene(scene.id);
    if (frame) selectFrame(frame.id);
  }, [scene?.id, frame?.id]);

  React.useEffect(() => {
    setOpenSections(initialFrameSections(frameDraft.generationStrategy));
  }, [frame?.id, frameDraft.generationStrategy]);

  React.useEffect(() => {
    setFrameDraftDirty(hasFrameChanges || targetDirty || sceneDirty);
  }, [hasFrameChanges, targetDirty, sceneDirty, setFrameDraftDirty]);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasFrameChanges && !targetDirty && !sceneDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasFrameChanges, targetDirty, sceneDirty]);

  React.useEffect(() => {
    setSelectedExportId(chatGPTExports.data?.[0]?.exportId ?? "");
  }, [frame?.id, chatGPTExports.data?.[0]?.exportId]);

  React.useEffect(() => {
    if (frameDraft.locationAngleId && selectedLocation && !selectedLocation.angles.some((angle) => angle.id === frameDraft.locationAngleId)) {
      setFrameDraft((current) => ({ ...current, locationAngleId: null }));
    }
  }, [selectedLocation?.id, frameDraft.locationAngleId]);

  const manualControls = <div className="generationManualControls">        <button disabled={!frame || hasFrameChanges || targetDirty || sceneDirty || !preview.data || preview.isFetching || preview.isError || exportForChatGPT.isPending || blockingWarnings.length > 0} onClick={() => exportForChatGPT.mutate()}>{exportForChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Экспорт для ChatGPT</button>
        <input ref={importInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) importChatGPT.mutate(file); event.target.value = ""; }} />
        <div className="frameImportAction"><button disabled={!frame || !selectedExport || importChatGPT.isPending} title={selectedExport ? `Receipt ${selectedExport.exportId}` : "Сначала выберите пакет экспорта"} onClick={() => importInput.current?.click()}>{importChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Импорт результата ChatGPT</button><small>{selectedExport ? `Receipt ${selectedExport.exportId.slice(0, 8)} · ${new Date(selectedExport.createdAt).toLocaleString()}` : "Пакет для импорта не выбран"}</small></div>{frame && chatGPTExports.data?.length ? <details className="exportHistory"><summary>История экспорта · {chatGPTExports.data.length}</summary><label>Пакет для импорта<select aria-label="ChatGPT export receipt" value={selectedExportId} onChange={(event) => setSelectedExportId(event.target.value)}>{chatGPTExports.data.map((item) => <option key={item.exportId} value={item.exportId}>{new Date(item.createdAt).toLocaleString()} · {item.strategy}{item.operation === "REPAIR" ? " · REPAIR" : ""}{item.baseFrameCode ? ` · base ${item.baseFrameCode}` : ""} · {item.exportId.slice(0, 8)}</option>)}</select></label></details> : null}
          {lastImport && frame && lastImport.frameId === frame.id ? <details className="importReceipt"><summary>Импортировано · {lastImport.generation.status}</summary><div className="fieldStack"><small>Source: ChatGPT manual import</small><small>Strategy: {frame.generationStrategy}</small><small>Export: {lastImport.exportId}</small>{lastImport.generation.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, lastImport.generation.outputFilePath)} alt="Импортированный результат" /> : null}</div></details> : null}</div>;
  return (
    <section className={"frameEditor frameStudio" + (inspectorCollapsed ? " inspectorCollapsed" : "")}>
      <div className="toolbar">

        <div className="frameHeading"><h2>{scene ? "Сцена " + scene.sequence + " · " + scene.name : "Сцена не выбрана"} · {frame ? `Кадр ${frameIndex + 1} из ${sceneFrames.length}` : "Кадров нет"}</h2>{frame ? <small>{frame.frameCode} · {frameStatusLabel(frame.status)} · {frame.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Продолжение" : "Новая композиция"}</small> : null}</div>
        {hasFrameChanges || targetDirty || sceneDirty ? <span className="status status-unsaved">Не сохранено</span> : null}
        <button type="button" title="Предыдущий кадр" aria-label="Предыдущий кадр" disabled={frameIndex <= 0} onClick={() => { const previous = sceneFrames[frameIndex - 1]; if (previous) selectFrame(previous.id); }}><ArrowLeft size={16} /></button>
        <button type="button" title="Следующий кадр" aria-label="Следующий кадр" disabled={!scene || frameIndex < 0 || frameIndex >= sceneFrames.length - 1} onClick={() => { const next = sceneFrames[frameIndex + 1]; if (next) selectFrame(next.id); }}><ArrowRight size={16} /></button>
        <button type="button" aria-controls="frame-inspector" aria-expanded={!inspectorCollapsed} onClick={() => setInspectorCollapsed(value => !value)} title={inspectorCollapsed ? "Развернуть инспектор" : "Свернуть инспектор"} aria-label={inspectorCollapsed ? "Развернуть Inspector" : "Свернуть Inspector"}>{inspectorCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />} Инспектор</button><button disabled={!frame || frame.status === "LOCKED" || !hasFrameChanges || saveFrame.isPending} onClick={() => saveFrame.mutate()}>{saveFrame.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить кадр</button>
        <details className="frameMoreActions"><summary>Дополнительно</summary><div className="frameMoreActionsBody">        <button type="button" onClick={returnToStoryboard}><ArrowLeft size={16} /> Раскадровка</button>          <label>Сцена<select value={scene?.id ?? ""} onChange={(event) => selectScene(event.target.value)}>{project.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Кадр<select value={frame?.id ?? ""} onChange={(event) => selectFrame(event.target.value)}><option value="" disabled>{sceneFrames.length ? "Выберите кадр" : "Кадров пока нет"}</option>{sceneFrames.map((item) => <option key={item.id} value={item.id}>{item.frameCode}</option>)}</select></label>
<button type="button" onClick={() => setCentralMode("generation")}>Генерация и ручной Export / Import</button></div></details>
      </div>
      <div className="frameWorkspaceNotices"><div className="frameCentralModes" role="tablist" aria-label="Режим рабочей области"><button type="button" role="tab" aria-selected={centralMode === "image"} aria-controls="frame-image-surface" onClick={() => setCentralMode("image")}>Изображение</button><button type="button" role="tab" aria-selected={centralMode === "state"} aria-controls="frame-state-surface" onClick={() => setCentralMode("state")}>Состояние кадра</button><button type="button" role="tab" aria-selected={centralMode === "generation"} aria-controls="frame-generation-surface" onClick={() => setCentralMode("generation")}>Генерация</button><button type="button" role="tab" aria-selected={centralMode === "compare"} aria-controls="frame-compare-surface" onClick={() => setCentralMode("compare")}>Сравнение</button><button type="button" role="tab" aria-selected={centralMode === "review"} aria-controls="frame-review-surface" onClick={() => setCentralMode("review")}>Проверка</button></div>{createFrame.error ? <p className="warning" role="alert">{createFrame.error.message}</p> : null}{saveFrame.error ? <p className="warning" role="alert">{saveFrame.error.message}</p> : null}
      {frame?.status === "LOCKED" ? <p className="muted" role="status">Кадр закреплён. Постановка и контекст доступны только для просмотра.</p> : null}
      {exportForChatGPT.error ? <p className="warning">{exportForChatGPT.error.message}</p> : null}
      {importChatGPT.error ? <p className="warning">{importChatGPT.error.message}</p> : null}
{preview.isError && centralMode !== "generation" && frame?.status !== "LOCKED" ? <p className="warning">Не удалось загрузить preview. <button type="button" onClick={() => void preview.refetch()}>Повторить</button></p> : null}{preview.data?.warnings.length ? <button type="button" className="frameWarningLink" onClick={() => { setCentralMode("generation"); }}>Предупреждения контекста: {preview.data.warnings.length}</button> : null}</div>      <div className="editorGrid">
        <section id="frame-image-surface" hidden={centralMode !== "image"} className="frameVisual" aria-label="Рабочая область изображения">
          {base ? <div className="frameViewSwitch" role="group" aria-label="Изображение"><button type="button" aria-pressed={imageView === "result"} onClick={() => setImageView("result")}>Результат</button><button type="button" aria-pressed={imageView === "base"} onClick={() => setImageView("base")}>BASE · {base.frameCode}</button></div> : null}
          <FrameCanvas onGenerate={() => setCentralMode("generation")} key={showingBase ? "base:" + base?.generationId : "result:" + (openedCandidate?.id ?? frame?.selectedGenerationId ?? "none") + ":" + openedCandidate?.outputFilePath} source={showingBase && base ? { id: base.generationId, url: projectFileUrl(project, base.outputFilePath), label: "BASE " + base.frameCode } : openedCandidate ? { id: openedCandidate.id, url: openedCandidate.outputFilePath ? projectFileUrl(project, openedCandidate.outputFilePath) : null, label: "Результат " + frame?.frameCode + " · " + openedCandidate.id } : frame?.selectedGenerationId ? { id: frame.selectedGenerationId, url: null, label: frame.selectedGenerationId } : null} targetWidth={frame?.targetWidth ?? null} targetHeight={frame?.targetHeight ?? null} targetRatio={frame?.targetWidth && frame.targetHeight ? frame.targetWidth / frame.targetHeight : frame?.targetAspectRatio ?? parseRatio(project.defaultAspectRatio)} />
          <FrameStatusBar>
            <div className="frameReviewStatus">
              <span className="reviewStatusItem">Кадр <strong>{frame ? frameStatusLabel(frame.status) : "нет"}</strong></span>
              <span className="reviewStatusItem">Просматривается <strong>{showingBase && base ? `BASE · ${base.frameCode}` : openedCandidate ? `${openedCandidate.id.slice(0, 8)} · ${generationStatusLabel(openedCandidate.status)}` : "нет результата"}</strong></span>
              {!showingBase && selectedCandidate ? <span className="status status-selected">Выбран</span> : null}
              {!showingBase && selectedCandidate && frame?.status === "LOCKED" ? <span className="status status-locked">Закреплён</span> : null}
            </div>
            {viewCandidates.length > 1 ? <label>Открыть кандидата<select aria-label="Открыть кандидата" value={openedCandidate?.id ?? ""} onChange={(event) => { setOpenedCandidateId(event.target.value); setImageView("result"); }}>{viewCandidates.map((candidate, index) => <option key={candidate.id} value={candidate.id}>{index + 1} · {candidate.id.slice(-6)} · {candidate.provider} · {candidate.id === frame?.selectedGenerationId ? "SELECTED" : "кандидат"}</option>)}</select></label> : null}
            {openedCandidate ? <div className="frameReviewActions"><button type="button" title={showingBase ? "Переключитесь на результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : selectedCandidate ? "Этот результат уже выбран" : "Выбрать открытый результат"} disabled={hasFrameChanges || targetDirty || sceneDirty || showingBase || openedCandidate.status !== "SUCCESS" || selectedCandidate || reviewActions.busy || frame?.status === "LOCKED" || frame?.status === "GENERATING"} onClick={() => reviewActions.select(openedCandidate.id)}><Check size={16} /> Выбрать</button><button type="button" title={showingBase ? "Переключитесь на результат" : !selectedCandidate ? "Сначала выберите открытый результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : "Закрепить выбранный результат"} disabled={showingBase || !selectedCandidate || !reviewActions.canLock} onClick={() => reviewActions.requestLock()}><Check size={16} /> Закрепить</button><button type="button" title={showingBase ? "Переключитесь на результат" : "Открыть Repair для этого результата"} disabled={showingBase || openedCandidate.status !== "SUCCESS"} onClick={() => { if (frame) openRepair(frame.id, openedCandidate.id); }}><Wrench size={16} /> Repair</button></div> : null}
            {selectedCandidate && !showingBase ? <details className="frameLockChecks"><summary>Проверки закрепления</summary><FrameLockReadinessNotice readiness={lockReadiness.data} loading={lockReadiness.isPending} /></details> : null}
            {openedCandidate && !showingBase && !selectedCandidate ? <small className="muted">Открыт для просмотра. Для закрепления сначала выберите его.</small> : null}
            {!openedCandidate && !showingBase ? <small className="muted">У этого кадра пока нет результатов генерации.</small> : null}

          </FrameStatusBar>
          <ReviewActionFeedback actions={reviewActions} />

        </section>
        <section id="frame-state-surface" hidden={centralMode !== "state"} className="frameTargetSurface" aria-label="Состояние кадра"><FrameTargetStoryStatePanel workspace source={resolveTargetComparisonSource(savedTarget.data, scene)} castIds={frame?.effectiveCharacterIds ?? frame?.characterIds ?? []} frameId={frame?.id ?? null} frameStatus={frame?.status ?? null} characters={project.characters} onDirtyChange={setTargetDirty} /></section>
        <section id="frame-generation-surface" hidden={centralMode !== "generation"} className="frameGenerationSurface"><GenerationWorkspace project={project} frame={frame} preview={preview.data} previewLoading={preview.isFetching} previewError={preview.error} dirty={hasFrameChanges || targetDirty || sceneDirty} refresh={() => void preview.refetch()} onView={generationId => { setOpenedCandidateId(generationId); setImageView("result"); setCentralMode("image"); }} onTarget={() => setCentralMode("state")} onCast={() => { setInspectorCollapsed(false); setInspectorTab("context"); }} manualControls={manualControls} reviewActions={reviewActions} onCompare={() => setCentralMode("compare")} onReview={() => setCentralMode("review")} /></section>
        <section id="frame-compare-surface" hidden={centralMode !== "compare"} className="frameCompareSurface"><GenerationCompare project={project} frame={frame} dirty={hasFrameChanges || targetDirty || sceneDirty} pending={reviewActions.busy} onSelect={reviewActions.select} onReview={() => setCentralMode("review")} onView={id => { setOpenedCandidateId(id); setImageView("result"); setCentralMode("image"); }} /><ReviewActionFeedback actions={reviewActions} /></section>
        <section id="frame-review-surface" hidden={centralMode !== "review"} className="frameReviewSurface"><FrameReviewWorkspace project={project} frame={frame} dirty={hasFrameChanges || targetDirty || sceneDirty} actions={reviewActions} onCompare={() => setCentralMode("compare")} onTarget={() => setCentralMode("state")} /></section>
        <FrameInspector tab={inspectorTab} onTab={setInspectorTab} collapsed={inspectorCollapsed} onClose={() => setInspectorCollapsed(true)}><div className="fieldStack">

          <fieldset disabled={frame?.status === "LOCKED"} aria-label="Постановка и контекст кадра" style={{ display: "contents", border: 0, padding: 0, margin: 0 }}>
          <FrameInspectorPanel id="staging" active={inspectorTab}><label>Стратегия генерации<select disabled={!frame} value={frame ? frameDraft.generationStrategy : "NEW_COMPOSITION"} onChange={(event) => setFrameDraft({ ...frameDraft, generationStrategy: event.target.value as Frame["generationStrategy"] })}><option value="NEW_COMPOSITION">Новая композиция</option><option value="CONTINUE_PREVIOUS_FRAME">Продолжить предыдущий кадр</option></select><small>{frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Использовать предыдущий закреплённый кадр как визуальную основу и применить контролируемое изменение." : "Создать новую композицию по каноническим референсам."}</small></label>
          <details className="frameFieldGroup" open={openSections.main}><summary onClick={(event) => { event.preventDefault(); toggleSection("main"); }}>Основное</summary><div className="frameSectionBody">
          <label>Описание кадра<textarea disabled={!frame} value={frame ? frameDraft.description : ""} onChange={(event) => setFrameDraft({ ...frameDraft, description: event.target.value })} /></label>
          <label>Действие<textarea value={frame ? frameDraft.action : action} onChange={(event) => frame ? setFrameDraft({ ...frameDraft, action: event.target.value }) : setAction(event.target.value)} /></label>
          </div></details>
          <details className="frameFieldGroup" open={openSections.camera}><summary onClick={(event) => { event.preventDefault(); toggleSection("camera"); }}>Камера и постановка</summary><div className="frameSectionBody">
          <label>Камера<textarea disabled={!frame} value={frame ? frameDraft.camera : ""} onChange={(event) => setFrameDraft({ ...frameDraft, camera: event.target.value })} /></label>
          <label>Композиция<textarea disabled={!frame} value={frame ? frameDraft.composition : ""} onChange={(event) => setFrameDraft({ ...frameDraft, composition: event.target.value })} /></label>
          <label>Свет<textarea disabled={!frame} value={frame ? frameDraft.lighting : ""} onChange={(event) => setFrameDraft({ ...frameDraft, lighting: event.target.value })} /></label>
          <label>Выражение / поза<textarea disabled={!frame} value={frame ? frameDraft.expressionNotes : ""} onChange={(event) => setFrameDraft({ ...frameDraft, expressionNotes: event.target.value })} /></label>
          </div></details>
          {frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" && frame ? <details className="frameFieldGroup continuityGroup" open={openSections.continuity}><summary onClick={(event) => { event.preventDefault(); toggleSection("continuity"); }}>Продолжение и изменения <small>{continuitySummary.detectedCount} обнаружено · {continuitySummary.allowedCategoryCount} категории · CHANGE ONLY {continuitySummary.hasExplicitChanges ? "задан" : "не задан"} · FORBIDDEN {continuitySummary.hasForbiddenChanges ? "задан" : "не задан"}</small></summary><div className="frameSectionBody"><label>Continuity notes<textarea value={frameDraft.continuityNotes} onChange={(event) => setFrameDraft({ ...frameDraft, continuityNotes: event.target.value })} /></label><ContinuityEditContractEditor contract={frameDraft.continuityEditContract} detected={preview.data?.detectedContinuityChanges ?? []} onChange={(continuityEditContract) => setFrameDraft({ ...frameDraft, continuityEditContract })} /></div></details> : null}
          </FrameInspectorPanel><FrameInspectorPanel id="context" active={inspectorTab}><details className="frameFieldGroup frameContextGroup" open><summary>Контекст и референсы <small>{frameDraft.characterIds.length} персонажа · {effectiveLocation?.name ?? "без локации"} · {effectiveLocation?.angles.find((angle) => angle.id === frameDraft.locationAngleId)?.name ?? "без ракурса"} · {project.styleProfiles.find((style) => style.id === (frameDraft.styleProfileId || scene?.styleProfileId))?.name ?? "без стиля"}</small></summary><div className="frameSectionBody">
          <div className="frameContextFields">
            <div className="fieldStack">
              <label>Персонажи</label>
              <div className="segmentedControl" role="radiogroup" aria-label="Режим состава персонажей">
                <label><input type="radio" name="character-cast-mode" checked={frameDraft.characterCastMode === "INHERIT"} disabled={!frame || frame.status === "GENERATING" || frame.status === "LOCKED"} onChange={() => setFrameDraft({ ...frameDraft, characterCastMode: "INHERIT" })} /> Наследовать состав</label>
                <label><input type="radio" name="character-cast-mode" checked={frameDraft.characterCastMode === "EXPLICIT"} disabled={!frame || frame.status === "GENERATING" || frame.status === "LOCKED"} onChange={() => frame && setFrameDraft({ ...frameDraft, characterCastMode: "EXPLICIT", characterIds: frame.effectiveCharacterIds ?? frame.characterIds })} /> Выбрать вручную</label>
              </div>
              <small>{frameDraft.characterCastMode === "LEGACY" ? "Источник состава неизвестен (legacy fallback)." : frameDraft.characterCastMode === "INHERIT" ? (frame?.characterCastSource === "INHERITED_PREVIOUS" ? "Снимок унаследован от предыдущего кадра." : "Снимок унаследован из состава сцены.") : "Состав выбран явно."}</small>
              {frameDraft.characterCastMode === "EXPLICIT" && frameDraft.characterIds.length === 0 ? <strong>В этом кадре нет персонажей</strong> : null}
              {project.characters.map((character) => (
                <div className="versionBlock" key={character.id}>
                  <label className="checkline">
                    <input type="checkbox" disabled={frameDraft.characterCastMode !== "EXPLICIT" || frame?.status === "GENERATING" || frame?.status === "LOCKED"} checked={frameDraft.characterIds.includes(character.id)} onChange={(event) => {
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
                            <input type="checkbox" disabled={frameDraft.characterCastMode !== "EXPLICIT" || frame?.status === "GENERATING" || frame?.status === "LOCKED"} checked={selected.includes(reference.id)} onChange={(event) => setFrameDraft((current) => ({
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
          </div></div></details>
          <div className="frameOutfitSummary"><h3>Образы из сохранённого Target</h3>{preview.data?.context.characters.map(character => { const outfitId = preview.data?.context.storyState.characters[character.id]?.outfitId; return <p key={character.id}>{character.name}: {character.outfits.find(item => item.id === outfitId)?.name ?? "Не задан"}</p>; })}<button type="button" onClick={() => setCentralMode("state")}>Открыть состояние и образы</button></div>
          </FrameInspectorPanel></fieldset><FrameInspectorPanel id="state" active={inspectorTab}><p className="muted">Состояние сцены и целевое состояние кадра — отдельные документы. Target показывает сохранённое состояние именно этого кадра.</p>
          <div className="frameStateSummary"><p>Scene State: {scene?.storyState?.document.time.description || "время не задано"}</p><p>Frame Target: {savedTarget.data?.status === "AVAILABLE" ? "сохранён · revision " + savedTarget.data.revision : savedTarget.data?.status ?? "загрузка"}</p><button type="button" onClick={() => setCentralMode("state")}>Открыть состояние кадра</button></div>
          <details className="currentStoryState"><summary>Текущее состояние сцены</summary><p className="muted">Может отличаться от состояния на момент выбранного кадра.</p><StoryStateEditor project={project} onDirtyChange={setSceneDirty} /></details>

        </FrameInspectorPanel></div><FrameInspectorPanel id="technical" active={inspectorTab}>            <details className="reviewDetails"><summary>Детали результата</summary><div className="reviewMetadata">
              {showingBase && base ? <><span>Тип: BASE</span><span>Кадр: {base.frameCode}</span><span>Generation ID: {base.generationId}</span></> : openedCandidate ? <><span>Generation ID: {openedCandidate.id}</span><span>Provider: {openedCandidate.provider}</span><span>Тип: {openedCandidate.generationType}</span><span>Создано: {new Date(openedCandidate.createdAt).toLocaleString()}</span></> : <span>Технические данные появятся после создания Generation.</span>}
              <span>Selected Generation ID: {frame?.selectedGenerationId ?? "нет"}</span>
            </div></details>          <div className="frameTechnicalIdentity"><p>Frame: {frame?.id ?? "нет"}</p><p>Cast revision: {frame?.characterCastRevision ?? "неизвестна"}</p><p>Source Frame: {frame?.previousFrameId ?? "нет"}</p><p>Source Generation: {openedCandidate?.parentGenerationId ?? base?.generationId ?? "нет"}</p><p>Strategy: {frame?.generationStrategy ?? "нет"}</p><button type="button" onClick={() => useUiStore.getState().setSection("generations")}>История генераций</button></div>
        <details className="frameHistoricalContext"><summary>Происхождение Target и исторический контекст Generation</summary><p>Target revision: {savedTarget.data?.status === "AVAILABLE" ? savedTarget.data.revision : "недоступна"}</p>{savedTarget.data?.status === "AVAILABLE" ? <pre>{JSON.stringify({ originType: savedTarget.data.originType, sourceFrameId: savedTarget.data.sourceFrameId, sourceGenerationId: savedTarget.data.sourceGenerationId, explicitlyEditedAt: savedTarget.data.explicitlyEditedAt }, null, 2)}</pre> : null}<p>Generation: {openedCandidate?.id ?? "нет"} · {openedCandidate?.provider} · {openedCandidate?.model}</p>{openedCandidate?.frameSnapshot ? <details><summary>Frame snapshot</summary><pre>{openedCandidate.frameSnapshot}</pre></details> : null}{openedCandidate?.storyStateSnapshot ? <details><summary>Generation Story State snapshot</summary><pre>{openedCandidate.storyStateSnapshot}</pre></details> : null}{openedCandidate?.references?.map(reference => <p key={reference.id}>{reference.code} · exact reference {reference.referenceId}</p>)}</details>
        <details className="technicalDetails" open><summary>Технические детали</summary><div className="frameSectionBody"><div className="referenceList">
          <h3>Подобранные референсы · {preview.data?.references.length ?? 0}</h3>
          {preview.data ? <FrameContextSummary preview={preview.data} /> : null}
          {preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? <div className="versionBlock"><h3>BASE IMAGE</h3><div className="refRow"><Check size={15} /><span>{preview.data.context.previousLockedFrame?.frameCode ?? "Не найден"}</span><small>{preview.data.context.previousLockedFrame?.generationId ?? "Недоступная база"}</small></div></div> : null}
          {preview.data?.warnings.map((warning) => <p className={warning.severity === "blocking" ? "warning blocking" : "warning"} key={`${warning.code}-${warning.entityId}`}>{warning.message}</p>)}
          {preview.data?.references.map((reference) => <div className="refRow" key={reference.id}><Check size={15} /><span>{reference.label ?? reference.code}</span><small>{reference.role ?? referenceKindLabel(reference.kind)}</small></div>)}
          {preview.data?.deltaInstructions ? <div className="versionBlock"><h3>DELTA INSTRUCTIONS</h3><pre>{preview.data.deltaInstructions}</pre></div> : null}
          <GeometryPreview frame={frame} preview={preview.data} fallbackAspectRatio={project.defaultAspectRatio} />
        </div>
        <details className="promptPreview">
          <summary>Production prompt</summary>
          <pre>{preview.data?.prompt ?? "Создайте или выберите кадр, чтобы увидеть prompt."}</pre>
        </details></div></details></FrameInspectorPanel></FrameInspector>
      </div>
      <LockConfirmationDialog confirmation={reviewActions.confirmation} pending={reviewActions.busy} onConfirm={reviewActions.confirmLock} onCancel={reviewActions.cancelLock} />
      <FrameFilmstrip project={project} frames={sceneFrames} selectedId={frame?.id ?? null} onSelect={selectFrame} onCreate={() => createFrame.mutate()} creating={createFrame.isPending} canCreate={Boolean(scene) && !hasFrameChanges && !targetDirty && !sceneDirty} />
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

export function StoryStateEditor({ project, onDirtyChange }: { project: Project; onDirtyChange?: (dirty: boolean) => void }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const initial = scene?.storyState?.document ?? emptyState(scene?.id ?? "");
  const [state, setState] = React.useState<StoryStateDocument>(initial);
  const [environmentPending, setEnvironmentPending] = React.useState(false);
  const dirty = environmentPending || !equalDrafts(state, initial);
  React.useEffect(() => setState(initial), [scene?.id]);
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const save = useMutation({
    mutationFn: () => api.put(`/api/story-state/${scene?.id}`, { document: state }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
  });
  if (!scene) return <section className="sideSection">Создайте сцену, чтобы редактировать состояние сцены.</section>;

  return (
    <section className="sideSection">
      <div className="toolbar"><h2>Текущее состояние сцены</h2><button disabled={save.isPending} onClick={(event) => { const section = event.currentTarget.closest("section"); if (section && reportEnvironmentValidity(section)) save.mutate(); }} title="Сохранить состояние сцены"><Save size={16} /></button></div>
      {save.error ? <p className="warning" role="alert">{save.error.message}</p> : null}
      <label>Время<input value={state.time.description} onChange={(event) => setState({ ...state, time: { description: event.target.value } })} /></label>
      <EnvironmentStateEditor state={state} onChange={setState} onPendingChange={setEnvironmentPending} />
      {project.characters.map((character) => (
        <CharacterStateFields key={character.id} character={character} state={state} onChange={setState} />
      ))}
      <StoryFactsEditor state={state} onChange={setState} />
      {Object.entries(state.props).map(([id, prop]) => <label key={id}>Владелец предмета · {id}<StoryStateHolder value={prop.holderCharacterId} characters={project.characters} onChange={holderCharacterId => setState({ ...state, props: { ...state.props, [id]: { ...prop, holderCharacterId } } })} /></label>)}
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
      <div className="refRow"><ImagePlus size={15} /><span>ЗАПРОС PROVIDER</span><small>{preview?.geometry.requestedAspectRatio ?? fallbackAspectRatio} / {preview?.geometry.requestedResolution ?? "авто"} / {preview?.geometry.requestedImageSize ?? "1K"}</small></div>
      <div className="refRow"><Settings size={15} /><span>ПОСТОБРАБОТКА</span><small>Кроп: {preview?.geometry.requiresCrop ? "ДА" : "НЕТ"} / {preview?.geometry.cropStrategy ?? "NONE"}</small></div>
      {preview?.geometry.requiresCrop ? <p className="warning">Целевой panel ratio отличается от запроса Gemini. Prompt содержит safe area instruction; crop/editor будет отдельным этапом.</p> : null}
    </div>
  );
}
