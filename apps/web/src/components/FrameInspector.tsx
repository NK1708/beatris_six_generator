import React from "react";
import { PanelRightClose } from "lucide-react";

export type InspectorTab = "staging" | "context" | "state" | "technical";
const tabs: Array<[InspectorTab, string]> = [["staging", "Постановка"], ["context", "Контекст"], ["state", "Состояние"], ["technical", "Техническое"]];

export function FrameInspector({ tab, onTab, collapsed, onClose, children }: {
  tab: InspectorTab; onTab(tab: InspectorTab): void; collapsed: boolean; onClose(): void; children: React.ReactNode;
}) {
  return <aside className="frameInspector studioFrameInspector" id="frame-inspector" aria-label="Редактор кадра" hidden={collapsed} onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <div className="frameInspectorHeader"><h3>Инспектор</h3><button type="button" className="shellIconButton" onClick={onClose} aria-label="Свернуть инспектор" title="Свернуть Inspector"><PanelRightClose size={18} /></button></div>
    <div className="frameInspectorTabs" role="tablist" aria-label="Разделы инспектора">{tabs.map(([id, label], index) => <button key={id} type="button" role="tab" id={`inspector-tab-${id}`} aria-controls={`inspector-panel-${id}`} aria-selected={id === tab} tabIndex={id === tab ? 0 : -1} onClick={() => onTab(id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); const nextId = tabs[next]![0]; onTab(nextId); document.getElementById(`inspector-tab-${nextId}`)?.focus();
    }}>{label}</button>)}</div>
    <div className="frameInspectorContent">{children}</div>
  </aside>;
}

export function FrameInspectorPanel({ id, active, children }: { id: InspectorTab; active: InspectorTab; children: React.ReactNode }) {
  return <section id={`inspector-panel-${id}`} role="tabpanel" aria-labelledby={`inspector-tab-${id}`} hidden={active !== id} className="frameInspectorPanel">{children}</section>;
}
