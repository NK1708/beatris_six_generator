import React from "react";
import { ImageOff, Maximize2 } from "lucide-react";

export interface FrameCanvasSource { id: string; url: string | null; label: string }

export function FrameCanvas({ source, targetWidth, targetHeight, targetRatio, onGenerate }: {
  source: FrameCanvasSource | null; targetWidth: number | null; targetHeight: number | null; targetRatio: number; onGenerate?: () => void;
}) {
  // Image loading state belongs to this exact source, never to the next Frame.
  const [loaded, setLoaded] = React.useState<{ id: string; width: number; height: number } | null>(null);
  const [failedId, setFailedId] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const failed = Boolean(source && (!source.url || failedId === source.id));
  const dimensions = loaded?.id === source?.id ? loaded : null;
  return <section className={`frameCanvas${!source || failed ? " frameCanvasEmpty" : ""}`} aria-label="Просмотр кадра">
    <div className="frameCanvasToolbar"><span><Maximize2 size={14} /> Вписать в область</span><span>{dimensions ? `${dimensions.width} × ${dimensions.height} · ${(dimensions.width / dimensions.height).toFixed(2)}:1` : "Размер изображения недоступен"}</span></div>
    <div className="frameCanvasViewport" data-view-mode="fit">
      {!source ? <div className="frameCanvasMessage"><ImageOff size={28} /><h3>Изображение ещё не создано</h3><p>Подготовьте постановку и получите первый результат в разделе генерации.</p>{onGenerate ? <button type="button" className="primaryAction" onClick={onGenerate}>Перейти к генерации</button> : null}</div>
        : failed ? <div className="frameCanvasMessage" role="alert"><ImageOff size={28} /><h3>Изображение недоступно</h3><p>Не удалось открыть файл результата {source.label}. Другой результат не подставлен.</p>{source.url ? <button type="button" onClick={() => { setFailedId(null); setRetry(value => value + 1); }}>Повторить загрузку</button> : null}</div>
        : <img key={`${source.id}:${source.url}:${retry}`} src={source.url!} alt={source.label} onLoad={event => setLoaded({ id: source.id, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => { setFailedId(source.id); setLoaded(null); }} />}
    </div>
    <div className="frameCanvasGeometry">Целевая область: {targetWidth && targetHeight ? `${targetWidth} × ${targetHeight}` : "размер из проекта"} · {targetRatio.toFixed(2)}:1 <span>Параметры генерации — в технических сведениях</span></div>
  </section>;
}
