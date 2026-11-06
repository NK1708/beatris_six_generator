import { frameStatusLabel } from "../frameWorkspaceUi.js";
import React from "react";
import { ImageOff, ImagePlus } from "lucide-react";
import type { Frame, Project } from "../model.js";
import { projectFileUrl } from "../utils.js";

function FilmstripThumbnail({ frame, project }: { frame: Frame; project: Project }) {
  const selected = frame.generations.find(item => item.id === frame.selectedGenerationId);
  const [failed, setFailed] = React.useState(false);
  const url = selected?.outputFilePath ? projectFileUrl(project, selected.outputFilePath) : null;
  return <span className="filmstripThumbnail">{url && !failed ? <img src={url} onError={() => setFailed(true)} alt={`Миниатюра ${frame.frameCode}`} /> : <span><ImageOff size={18} /><small>{selected ? "Файл недоступен" : "Нет изображения"}</small></span>}</span>;
}

export function FrameFilmstrip({ project, frames, selectedId, onSelect, onCreate, creating, canCreate }: {
  project: Project; frames: Frame[]; selectedId: string | null; onSelect(id: string): void; onCreate(): void; creating: boolean; canCreate: boolean;
}) {
  const active = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { active.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [selectedId]);
  return <nav className="frameFilmstrip" aria-label="Кадры текущей сцены"><div className="frameFilmstripTrack">
    {frames.map((frame, index) => <button ref={frame.id === selectedId ? active : undefined} type="button" key={frame.id} className={`filmstripFrame${frame.id === selectedId ? " isActive" : ""}`} aria-current={frame.id === selectedId ? "true" : undefined} title={frame.frameCode + " · " + frame.id} aria-label={`Открыть кадр ${index + 1}`} onClick={() => onSelect(frame.id)}>
      <FilmstripThumbnail key={`${frame.id}:${frame.selectedGenerationId}:${frame.generations.find(item => item.id === frame.selectedGenerationId)?.outputFilePath}`} frame={frame} project={project} />
      <span className="filmstripCaption"><strong>Кадр {index + 1}</strong><small>{frameStatusLabel(frame.status)}</small></span>
    </button>)}
    <button className="filmstripCreate" type="button" disabled={!canCreate || creating} onClick={onCreate}><ImagePlus size={20} /><span>{creating ? "Создание…" : "Новый кадр"}</span></button>
  </div></nav>;
}
