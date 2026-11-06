import { generationModeLabel, generationStatusLabel } from "../frameWorkspaceUi.js";
import React from "react";
import type { Frame, Generation, Project } from "../model.js";
import { generationMetadata } from "../generationWorkspace.js";
import { InspectionImage, type InspectionZoom } from "./InspectionImage.js";
import { canSelectFrameGeneration } from "./FrameLockReadiness.js";

export function GenerationCompare({ project, frame, dirty, pending, onSelect, onReview, onView }: { project: Project; frame: Frame | undefined; dirty: boolean; pending: boolean; onSelect(id: string): void; onReview(): void; onView(id: string): void }) {
  const results = frame?.generations ?? [];
  const preferred = [...results.filter(item => item.status === "SUCCESS"), ...results.filter(item => item.status !== "SUCCESS")];
  const [left, setLeft] = React.useState(preferred[0]?.id ?? "");
  const [right, setRight] = React.useState(preferred[1]?.id ?? "");
  const [sync, setSync] = React.useState(true);
  const [zoomA, setZoomA] = React.useState<InspectionZoom>("fit");
  const [zoomB, setZoomB] = React.useState<InspectionZoom>("fit");
  const [fitA, setFitA] = React.useState(100); const [fitB, setFitB] = React.useState(100);
  const changeZoom = (side: "A" | "B", value: InspectionZoom) => { const next = value === "fit" ? value : Math.max(5, Math.min(400, Math.round(value))); if (sync || side === "A") setZoomA(next); if (sync || side === "B") setZoomB(next); };
  const both = (value: InspectionZoom) => { setZoomA(value); setZoomB(value); };
  const panel = (side: "A" | "B", id: string, setId: (id: string) => void, zoom: InspectionZoom, fit: number) => {
    // Defaults are display choices only. An explicit missing ID never falls back.
    const actualId = id || preferred[side === "A" ? 0 : 1]?.id || "";
    const generation = results.find(item => item.id === actualId);
    const selected = Boolean(generation && generation.id === frame?.selectedGenerationId);
    const metadata = generation ? generationMetadata(generation) : null;
    return <article className="comparePanel" aria-label={"Панель " + side}><h3>Панель {side}</h3><label>Результат {side}<select aria-label={"Результат " + side} value={actualId} onChange={event => { setId(event.target.value); }}><option value="" disabled>Выберите результат</option>{results.map((item, index) => <option key={item.id} value={item.id}>{index + 1} · {item.id.slice(-8)} · {generationStatusLabel(item.status)}{item.id === frame?.selectedGenerationId ? " · Выбран" : ""}</option>)}</select></label>
      {generation ? <><div className="compareZoomControls"><button type="button" aria-label={"Уменьшить " + side} onClick={() => changeZoom(side, (zoom === "fit" ? fit : zoom) - 25)}>−</button><span>{zoom === "fit" ? "Вписано · " + Math.round(fit) + "%" : zoom + "%"}</span><button type="button" aria-label={"Увеличить " + side} onClick={() => changeZoom(side, (zoom === "fit" ? fit : zoom) + 25)}>+</button><button type="button" onClick={() => changeZoom(side, "fit")}>Вписать {side}</button></div><InspectionImage key={generation.id + ":" + generation.outputFilePath} project={project} generation={generation} zoom={zoom} label={"Сравнение " + side} onFitScale={side === "A" ? setFitA : setFitB} /><div className="compareMetadata"><strong>{generation.id.slice(-8)} · {generationStatusLabel(generation.status)}</strong>{selected ? <span className="status status-selected">Выбран для кадра</span> : null}<span>{metadata ? generationModeLabel(metadata.mode) : ""}</span><span>{generation.provider} / {generation.model}</span><span>{new Date(generation.createdAt).toLocaleString()}</span><details><summary>Полный Generation ID</summary><code>{generation.id}</code></details></div><div className="compareActions"><button type="button" onClick={() => onView(generation.id)}>Посмотреть</button><button type="button" disabled={pending || dirty || selected || !frame || !canSelectFrameGeneration(frame.status, generation.status)} onClick={() => onSelect(generation.id)}>Выбрать этот результат</button></div></> : <p role="status">Результат недоступен в этом кадре. Выберите существующую запись.</p>}
    </article>;
  };
  return <section className="generationCompare" aria-label="Сравнение результатов"><header><h2>Сравнение</h2><p>Сейчас выбран для кадра: <strong title={frame?.selectedGenerationId ?? undefined}>{frame?.selectedGenerationId?.slice(-8) ?? "результат не выбран"}</strong></p><p className="muted">Панели A/B и масштаб — локальный просмотр. Сравнение не меняет выбранный результат или статус кадра.</p></header>{dirty ? <p className="warning">Есть несохранённые изменения. Сравнение доступно, выбор результата — после сохранения.</p> : null}
    {results.length < 2 ? <div className="compareEmpty"><h3>{results.length ? "Доступен один результат" : "Результатов пока нет"}</h3><p>Для сравнения нужны хотя бы два результата текущего кадра. Новые результаты доступны в режиме «Генерация».</p></div> : null}
    {results.length ? <><div className="compareToolbar"><button type="button" onClick={() => both("fit")}>Вписать в окно</button><button type="button" onClick={() => both(100)}>100%</button><button type="button" onClick={() => both("fit")}>Сбросить масштаб</button><label className="checkline"><input type="checkbox" checked={sync} onChange={event => { setSync(event.target.checked); if (event.target.checked) setZoomB(zoomA); }} />Синхронный масштаб</label></div><div className="comparePanels">{panel("A", left, setLeft, zoomA, fitA)}{results.length >= 2 ? panel("B", right, setRight, zoomB, fitB) : null}</div></> : null}
    <button type="button" onClick={onReview}>Перейти к проверке выбранного результата</button>
  </section>;
}
