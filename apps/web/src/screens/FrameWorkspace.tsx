import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Brush, Check, Download, ImagePlus, Loader2, Map, Save, Settings, Upload, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import type { AssetStatus, Character, CharacterDraft, ChatGPTExportSummary, ContinuityEditContract, Frame, FrameDraft, Generation, Location, LocationAngle, LocationAngleDraft, Outfit, OutfitDraft, OwnerType, PreviewResponse, Project, Reference, RegistryProject, Scene, SceneDraft, Section, StyleDraft, StyleProfile } from "../model.js";
import { continuityCategories } from "../model.js";
import { emptyState, environmentLabel, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import type { StoryStateDocument } from "@bearridge/shared";
import { emptyFrameDraft, frameToDraft } from "./AssetLibrary.js";
import { createFrameForScene } from "../frameCreation.js";
import { orderedSceneFrames, storyboardImageCandidates } from "../storyboard.js";
import { continuityContractSummary, initialFrameSections, openedFrameCandidate, selectedChatGPTReceipt, toggleFrameSection, type FrameSection } from "../frameWorkspaceUi.js";
import { FrameTargetStoryStatePanel } from "../components/FrameTargetStoryStatePanel.js";
import { FrameLockReadinessNotice, frameLockReadinessQueryKey, useFrameLockReadiness } from "../components/FrameLockReadiness.js";
export function FrameEditor({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectedFrameId = useUiStore((state) => state.selectedFrameId);
  const selectScene = useUiStore((state) => state.selectScene);
  const selectFrame = useUiStore((state) => state.selectFrame);
  const returnToStoryboard = useUiStore((state) => state.returnToStoryboard);
  const setFrameDraftDirty = useUiStore((state) => state.setFrameDraftDirty);
  const openRepair = useUiStore((state) => state.openRepair);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const sceneFrames = React.useMemo(() => orderedSceneFrames(scene?.frames ?? []), [scene?.frames]);
  const frame = sceneFrames.find((item) => item.id === selectedFrameId) ?? sceneFrames[0];
  const [action, setAction] = React.useState("");
  const [frameDraft, setFrameDraft] = React.useState<FrameDraft>(() => frame ? frameToDraft(frame) : emptyFrameDraft());
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
  const frameIndex = sceneFrames.findIndex((item) => item.id === frame?.id);
  const candidates = frame ? storyboardImageCandidates(frame) : [];
  const openedCandidate = openedFrameCandidate(candidates, openedCandidateId);
  const previousFrame = scene?.frames.find((item) => item.id === frame?.previousFrameId);
  const previousImage = previousFrame?.status === "LOCKED" ? previousFrame.generations.find((item) => item.id === previousFrame.selectedGenerationId && item.status === "SUCCESS") : undefined;
  const base = frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? preview.data?.context.previousLockedFrame ?? (previousImage && previousFrame ? { id: previousFrame.id, frameCode: previousFrame.frameCode, generationId: previousImage.id, outputFilePath: previousImage.outputFilePath } : undefined) : undefined;
  const selectedExport = selectedChatGPTReceipt(chatGPTExports.data, selectedExportId);
  const showingBase = imageView === "base" && Boolean(base);
  const selectedCandidate = openedCandidate?.id === frame?.selectedGenerationId;
  const continuitySummary = continuityContractSummary(frameDraft.continuityEditContract, preview.data?.detectedContinuityChanges ?? []);
  const lockReadiness = useFrameLockReadiness(frame?.id);
  const selectGeneration = useMutation({
    mutationFn: (generationId: string) => api.put(`/api/frames/${frame?.id}/selected-generation`, { generationId }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", project.id] }); if (frame) void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(frame.id) }); }
  });
  const lockFrame = useMutation({
    mutationFn: () => api.post(`/api/frames/${frame?.id}/lock`, {}),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", project.id] }); if (frame) void lockReadiness.refetch(); }
  });
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
    onSuccess: (created) => {
      selectFrame(created.frame.id);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    }
  });
  const saveFrame = useMutation({
    mutationFn: () => {
      if (!frame) throw new Error("Выберите кадр.");
      const original = frameToDraft(frame);
      const castChanged = frameDraft.characterCastMode !== original.characterCastMode
        || JSON.stringify(frameDraft.characterIds) !== JSON.stringify(original.characterIds)
        || JSON.stringify(frameDraft.additionalCharacterReferenceIds) !== JSON.stringify(original.additionalCharacterReferenceIds);
      const { characterCastMode, characterIds, ...rest } = frameDraft;
      return api.put<Frame>(`/api/frames/${frame.id}`, {
        ...rest,
        ...(castChanged ? {
          characterCastMode: characterCastMode === "INHERIT" ? "INHERIT" : "EXPLICIT",
          ...(characterCastMode === "INHERIT" ? {} : { characterIds }),
          expectedCharacterCastRevision: frame.characterCastRevision ?? 0
        } : {}),
        targetWidth: toPositiveNumber(frameDraft.targetWidth),
        targetHeight: toPositiveNumber(frameDraft.targetHeight)
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
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
    setFrameDraft(frame ? frameToDraft(frame) : emptyFrameDraft());
    setOpenedCandidateId(null);
    setImageView("result");
  }, [frame?.id, project.id]);

  React.useEffect(() => {
    setOpenSections(initialFrameSections(frameDraft.generationStrategy));
  }, [frame?.id, frameDraft.generationStrategy]);

  React.useEffect(() => {
    setFrameDraftDirty(hasFrameChanges);
  }, [hasFrameChanges, setFrameDraftDirty]);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasFrameChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasFrameChanges]);

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
        <button type="button" onClick={returnToStoryboard}><ArrowLeft size={16} /> Раскадровка</button>
        <div className="frameHeading"><h2>{scene ? scene.sequence > 0 ? `Сцена ${scene.sequence}` : scene.name : "Сцена не выбрана"} · {frame ? `Кадр ${frameIndex + 1} из ${sceneFrames.length}` : "Кадров нет"}</h2>{frame ? <small>{frame.frameCode}</small> : null}</div>
        {hasFrameChanges ? <span className="status status-unsaved">Не сохранено</span> : null}
        <button type="button" title="Предыдущий кадр" aria-label="Предыдущий кадр" disabled={frameIndex <= 0} onClick={() => { const previous = sceneFrames[frameIndex - 1]; if (previous) selectFrame(previous.id); }}><ArrowLeft size={16} /></button>
        <button type="button" title="Следующий кадр" aria-label="Следующий кадр" disabled={!scene || frameIndex < 0 || frameIndex >= sceneFrames.length - 1} onClick={() => { const next = sceneFrames[frameIndex + 1]; if (next) selectFrame(next.id); }}><ArrowRight size={16} /></button>
        <button disabled={!frame || !hasFrameChanges || saveFrame.isPending} onClick={() => saveFrame.mutate()}>{saveFrame.isPending ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Сохранить кадр</button>
        <button disabled={!frame || hasFrameChanges || exportForChatGPT.isPending || blockingWarnings.length > 0} onClick={() => exportForChatGPT.mutate()}>{exportForChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Export for ChatGPT</button>
        <input ref={importInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) importChatGPT.mutate(file); event.target.value = ""; }} />
        <div className="frameImportAction"><button disabled={!frame || !selectedExport || importChatGPT.isPending} title={selectedExport ? `Receipt ${selectedExport.exportId}` : "Сначала выберите export receipt"} onClick={() => importInput.current?.click()}>{importChatGPT.isPending ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Import ChatGPT Result</button><small>{selectedExport ? `Receipt ${selectedExport.exportId.slice(0, 8)} · ${new Date(selectedExport.createdAt).toLocaleString()}` : "Нет выбранного receipt"}</small></div>
      </div>
      {exportForChatGPT.error ? <p className="warning">{exportForChatGPT.error.message}</p> : null}
      {importChatGPT.error ? <p className="warning">{importChatGPT.error.message}</p> : null}
      <div className="editorGrid">
        <section className="frameVisual" aria-label="Просмотр кадра">
          {base ? <div className="frameViewSwitch" role="group" aria-label="Изображение"><button type="button" aria-pressed={imageView === "result"} onClick={() => setImageView("result")}>Результат</button><button type="button" aria-pressed={imageView === "base"} onClick={() => setImageView("base")}>BASE · {base.frameCode}</button></div> : null}
          <div className="frameImageStage">
            {imageView === "base" && base ? <img src={projectFileUrl(project, base.outputFilePath)} alt={`BASE ${base.frameCode}`} /> : openedCandidate?.outputFilePath ? <img src={projectFileUrl(project, openedCandidate.outputFilePath)} alt={`Результат ${frame?.frameCode}`} /> : <div className="imagePlaceholder">Пока нет результата</div>}
          </div>
          <section className="frameReview" aria-label="Проверка результата">
            <div className="frameReviewStatus">
              <span className="reviewStatusItem">Кадр <strong>{frame?.status ?? "нет"}</strong></span>
              <span className="reviewStatusItem">OPENED <strong>{showingBase && base ? `BASE · ${base.frameCode}` : openedCandidate ? `${openedCandidate.id.slice(0, 8)} · ${openedCandidate.status}` : "нет Generation"}</strong></span>
              {!showingBase && selectedCandidate ? <span className="status status-selected">SELECTED</span> : null}
              {!showingBase && selectedCandidate && frame?.status === "LOCKED" ? <span className="status status-locked">LOCKED</span> : null}
            </div>
            {candidates.length > 1 ? <label>Открыть кандидата<select aria-label="Открыть кандидата" value={openedCandidate?.id ?? ""} onChange={(event) => { setOpenedCandidateId(event.target.value); setImageView("result"); }}>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id.slice(0, 8)} · {candidate.provider} · {candidate.id === frame?.selectedGenerationId ? "SELECTED" : "кандидат"}</option>)}</select></label> : null}
            {openedCandidate ? <div className="frameReviewActions"><button type="button" title={showingBase ? "Переключитесь на результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : selectedCandidate ? "Этот результат уже выбран" : "Выбрать открытый результат"} disabled={showingBase || selectedCandidate || selectGeneration.isPending || frame?.status === "LOCKED" || frame?.status === "GENERATING"} onClick={() => selectGeneration.mutate(openedCandidate.id)}><Check size={16} /> Выбрать</button><button type="button" title={showingBase ? "Переключитесь на результат" : !selectedCandidate ? "Сначала выберите открытый результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : "Закрепить выбранный результат"} disabled={showingBase || !selectedCandidate || frame?.status === "LOCKED" || lockReadiness.data?.status !== "READY" || lockFrame.isPending} onClick={() => lockFrame.mutate()}><Check size={16} /> Закрепить</button><button type="button" title={showingBase ? "Переключитесь на результат" : "Открыть Repair для этого результата"} disabled={showingBase} onClick={() => { if (frame) openRepair(frame.id, openedCandidate.id); }}><Wrench size={16} /> Repair</button></div> : null}
            {selectedCandidate && !showingBase ? <FrameLockReadinessNotice readiness={lockReadiness.data} loading={lockReadiness.isPending} /> : null}
            {openedCandidate && !showingBase && !selectedCandidate ? <small className="muted">Открыт для просмотра. Для закрепления сначала выберите его.</small> : null}
            {!openedCandidate && !showingBase ? <small className="muted">У этого кадра пока нет результатов генерации.</small> : null}
            <details className="reviewDetails"><summary>Детали результата</summary><div className="reviewMetadata">
              {showingBase && base ? <><span>Тип: BASE</span><span>Кадр: {base.frameCode}</span><span>Generation ID: {base.generationId}</span></> : openedCandidate ? <><span>Generation ID: {openedCandidate.id}</span><span>Provider: {openedCandidate.provider}</span><span>Тип: {openedCandidate.generationType}</span><span>Создано: {new Date(openedCandidate.createdAt).toLocaleString()}</span></> : <span>Технические данные появятся после создания Generation.</span>}
              <span>Selected Generation ID: {frame?.selectedGenerationId ?? "нет"}</span>
            </div></details>
          </section>
          {selectGeneration.error ? <p className="warning">{selectGeneration.error.message}</p> : null}
          {lockFrame.error ? <p className="warning">{lockFrame.error.message}</p> : null}
          {frame && chatGPTExports.data?.length ? <details className="exportHistory"><summary>История экспорта · {chatGPTExports.data.length}</summary><label>Receipt для Import<select aria-label="ChatGPT export receipt" value={selectedExportId} onChange={(event) => setSelectedExportId(event.target.value)}>{chatGPTExports.data.map((item) => <option key={item.exportId} value={item.exportId}>{new Date(item.createdAt).toLocaleString()} · {item.strategy}{item.operation === "REPAIR" ? " · REPAIR" : ""}{item.baseFrameCode ? ` · base ${item.baseFrameCode}` : ""} · {item.exportId.slice(0, 8)}</option>)}</select></label></details> : null}
          {lastImport && frame && lastImport.frameId === frame.id ? <details className="importReceipt"><summary>Импортировано · {lastImport.generation.status}</summary><div className="fieldStack"><small>Source: ChatGPT manual import</small><small>Strategy: {frame.generationStrategy}</small><small>Export: {lastImport.exportId}</small>{lastImport.generation.outputFilePath ? <img className="reviewImage" src={projectFileUrl(project, lastImport.generation.outputFilePath)} alt="Импортированный результат" /> : null}</div></details> : null}
          <details className="currentStoryState"><summary>Текущее состояние сцены</summary><p className="muted">Может отличаться от состояния на момент выбранного кадра.</p><StoryStateEditor project={project} /></details>
        </section>
        <aside className="frameInspector" aria-label="Редактор кадра"><div className="fieldStack">
          <label>Сцена<select value={scene?.id ?? ""} onChange={(event) => selectScene(event.target.value)}>{project.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Кадр<select value={frame?.id ?? ""} onChange={(event) => selectFrame(event.target.value)}><option value="" disabled>{sceneFrames.length ? "Выберите кадр" : "Кадров пока нет"}</option>{sceneFrames.map((item) => <option key={item.id} value={item.id}>{item.frameCode}</option>)}</select></label>
          <button className="frameNewButton" disabled={!scene || hasFrameChanges || createFrame.isPending} onClick={() => createFrame.mutate()}>{createFrame.isPending ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />} Новый кадр</button>
          <label>Стратегия генерации<select disabled={!frame} value={frame ? frameDraft.generationStrategy : "NEW_COMPOSITION"} onChange={(event) => setFrameDraft({ ...frameDraft, generationStrategy: event.target.value as Frame["generationStrategy"] })}><option value="NEW_COMPOSITION">Новая композиция</option><option value="CONTINUE_PREVIOUS_FRAME">Продолжить предыдущий кадр</option></select><small>{frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Использовать предыдущий закреплённый кадр как визуальную основу и применить контролируемое изменение." : "Создать новую композицию по каноническим референсам."}</small></label>
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
          <details className="frameFieldGroup frameContextGroup"><summary>Контекст и референсы <small>{frameDraft.characterIds.length} персонажа · {effectiveLocation?.name ?? "без локации"} · {effectiveLocation?.angles.find((angle) => angle.id === frameDraft.locationAngleId)?.name ?? "без ракурса"} · {project.styleProfiles.find((style) => style.id === (frameDraft.styleProfileId || scene?.styleProfileId))?.name ?? "без стиля"}</small></summary><div className="frameSectionBody">
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
          <FrameTargetStoryStatePanel frameId={frame?.id ?? null} frameStatus={frame?.status ?? null} characters={project.characters} />
        </div>
        <details className="technicalDetails"><summary>Технические детали</summary><div className="frameSectionBody"><div className="referenceList">
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
        </details></div></details></aside>
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

export function StoryStateEditor({ project }: { project: Project }) {
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
      <div className="toolbar"><h2>Текущее состояние сцены</h2><button onClick={() => save.mutate()} title="Сохранить состояние сцены"><Save size={16} /></button></div>
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
