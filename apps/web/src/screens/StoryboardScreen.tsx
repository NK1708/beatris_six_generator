import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ImagePlus } from "lucide-react";
import { createFrameForScene } from "../frameCreation.js";
import type { Frame, Project, Scene } from "../model.js";
import { useUiStore } from "../state.js";
import { frameAspectRatio, orderedSceneFrames, storyboardImageCandidates, storyboardStatus } from "../storyboard.js";
import { projectFileUrl } from "../utils.js";

export function StoryboardScreen({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const selectedSceneId = useUiStore((state) => state.selectedSceneId);
  const selectScene = useUiStore((state) => state.selectScene);
  const openStoryboardFrame = useUiStore((state) => state.openStoryboardFrame);
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const frames = React.useMemo(() => orderedSceneFrames(scene?.frames ?? []), [scene?.frames]);
  const createFrame = useMutation({
    mutationFn: () => {
      if (!scene) throw new Error("Выберите сцену для создания кадра.");
      return createFrameForScene(scene, {
        targetWidth: 1200,
        targetHeight: 675
      });
    },
    onSuccess: (created) => {
      openStoryboardFrame(created.frame.sceneId, created.frame.id);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    }
  });

  return <section className="storyboardScreen">
    <div className="storyboardHeader">
      <div className="storyboardHeading">
        <span className="muted">{project.name}</span>
        <h2>Раскадровка</h2>
      </div>
      <label className="storyboardScenePicker">Сцена
        <select value={scene?.id ?? ""} onChange={(event) => selectScene(event.target.value)} disabled={!project.scenes.length}>
          {project.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="storyboardSceneSummary">
        <strong>{scene?.name ?? "Сцена не выбрана"}</strong>
        <span className="muted">Кадров: {frames.length}</span>
      </div>
      <button type="button" disabled={!scene || createFrame.isPending} onClick={() => createFrame.mutate()}>
        <ImagePlus size={16} /> Новый кадр
      </button>
    </div>
    {createFrame.error ? <p className="warning">{createFrame.error.message}</p> : null}
    {scene && frames.length === 0 ? <div className="storyboardEmpty">В этой сцене пока нет кадров.</div> : null}
    {!scene ? <div className="storyboardEmpty">Создайте сцену, чтобы начать раскадровку.</div> : null}
    {frames.length > 0 && scene ? <div className="storyboardGrid">
      {frames.map((frame) => <StoryboardCard key={frame.id} frame={frame} scene={scene} project={project} onOpen={() => openStoryboardFrame(scene.id, frame.id)} />)}
    </div> : null}
  </section>;
}

function StoryboardCard({ frame, scene, project, onOpen }: { frame: Frame; scene: Scene; project: Project; onOpen(): void }) {
  const candidates = React.useMemo(() => storyboardImageCandidates(frame), [frame.generations, frame.selectedGenerationId]);
  const [imageIndex, setImageIndex] = React.useState(0);
  const candidateIds = candidates.map((item) => item.id).join(",");
  React.useEffect(() => setImageIndex(0), [candidateIds]);
  const image = candidates[imageIndex];
  const description = frame.description.trim() || frame.action.trim() || "Описание не задано";
  return <button type="button" className="storyboardCard" onClick={onOpen} aria-label={`Открыть кадр ${frame.frameCode} в редакторе`}>
    <span className="storyboardImage" style={{ aspectRatio: frameAspectRatio(frame, project.defaultAspectRatio) }}>
      {image ? <img src={projectFileUrl(project, image.outputFilePath)} alt={`Кадр ${frame.frameCode}`} loading="lazy" decoding="async" onError={() => setImageIndex((index) => index + 1)} />
        : <span className="storyboardPlaceholder"><ImagePlus size={24} aria-hidden="true" /></span>}
    </span>
    <span className="storyboardCardBody">
      <span className="storyboardCardTop"><strong>{frame.frameCode}</strong><span className={`storyboardStatus storyboardStatus-${frame.status.toLowerCase()}`}>{storyboardStatus(frame)}</span></span>
      <span className="storyboardDescription" title={description}>{description}</span>
      <span className="storyboardOpen">{scene.name} <ArrowUpRight size={15} aria-hidden="true" /></span>
    </span>
  </button>;
}
