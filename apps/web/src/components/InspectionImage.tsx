import React from "react";
import type { Generation, Project } from "../model.js";
import { projectFileUrl } from "../utils.js";

export type InspectionZoom = "fit" | number;
export function InspectionImage({ project, generation, zoom = "fit", label, onFitScale }: { project: Project; generation: Generation; zoom?: InspectionZoom; label: string; onFitScale?: (percent: number) => void }) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    const element = viewport.current;
    if (!element || !size) return;
    const update = () => { if (element.clientWidth && element.clientHeight) onFitScale?.(100 * Math.min(element.clientWidth / size.width, element.clientHeight / size.height)); };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, [size, onFitScale]);
  return <div className="inspectionImage"><div className={"inspectionViewport" + (zoom === "fit" ? " isFit" : "")} ref={viewport} data-zoom={zoom}>
    {!generation.outputFilePath || failed ? <div className="inspectionImageError" role="alert"><strong>Изображение недоступно</strong><p>{label} · {generation.id}</p><p>Файл этого результата отсутствует или не читается. Другое изображение не подставлено.</p>{generation.outputFilePath ? <button type="button" onClick={() => { setFailed(false); setSize(null); setRetry(value => value + 1); }}>Повторить загрузку</button> : null}</div> : <img key={retry} src={projectFileUrl(project, generation.outputFilePath)} alt={label + " · " + generation.id} style={zoom === "fit" ? { width: "100%", height: "100%", objectFit: "contain" } : size ? { width: size.width * zoom / 100, height: size.height * zoom / 100, maxWidth: "none", maxHeight: "none" } : { width: "auto", maxWidth: "none" }} onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => { setFailed(true); setSize(null); }} />}
  </div><small>{size ? `Фактический размер: ${size.width} × ${size.height}` : "Фактический размер недоступен"} · {zoom === "fit" ? "Вписать целиком" : zoom + "%"}</small></div>;
}
