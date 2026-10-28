import React from "react";
import { ImagePlus, X } from "lucide-react";
import type { StoryStateDocument } from "@bearridge/shared";

type Environment = StoryStateDocument["environment"];
export interface EnvironmentRow { id: string; name: string; value: Environment[string] }

export function environmentRowErrors(rows: EnvironmentRow[]): string[] {
  const names = rows.map((row) => row.name.trim());
  return names.map((name) => !name ? "Введите имя параметра." : names.filter((candidate) => candidate === name).length > 1 ? "Имена параметров не должны повторяться." : "");
}

export function rowsToEnvironment(rows: EnvironmentRow[]): Environment | null {
  if (environmentRowErrors(rows).some(Boolean)) return null;
  return Object.fromEntries(rows.map((row) => [row.name.trim(), row.value]));
}

// Native validity also guards the Scene save action; invalid drafts stay local.
export function reportEnvironmentValidity(container: HTMLElement): boolean {
  for (const input of container.querySelectorAll<HTMLInputElement>("[data-environment-key]")) {
    if (!input.reportValidity()) return false;
  }
  return true;
}

export function EnvironmentStateEditor({ state, onChange }: { state: StoryStateDocument; onChange(next: StoryStateDocument): void }) {
  const nextId = React.useRef(0);
  const makeRows = (environment: Environment): EnvironmentRow[] => Object.entries(environment).map(([name, value]) => ({ id: String(nextId.current++), name, value }));
  const [rows, setRows] = React.useState(() => makeRows(state.environment));
  const emitted = React.useRef(state.environment);
  const sceneId = React.useRef(state.sceneId);
  React.useEffect(() => {
    if (sceneId.current !== state.sceneId || emitted.current !== state.environment) {
      sceneId.current = state.sceneId;
      emitted.current = state.environment;
      setRows(makeRows(state.environment));
    }
  }, [state.sceneId, state.environment]);
  const change = (next: EnvironmentRow[]) => {
    setRows(next);
    const environment = rowsToEnvironment(next);
    if (environment !== null) {
      emitted.current = environment;
      onChange({ ...state, environment });
    }
  };
  const errors = environmentRowErrors(rows);
  const prefix = React.useId();
  return <div className="versionBlock">
    <div className="toolbar"><h3>Окружение</h3><button type="button" onClick={() => change([...rows, { id: String(nextId.current++), name: "", value: "" }])}><ImagePlus size={16} /> Добавить</button></div>
    {rows.map((row, index) => <div key={row.id}>
      <div className="keyValueRow">
        <input aria-label="Имя параметра окружения" data-environment-key="" required aria-invalid={Boolean(errors[index])} aria-describedby={errors[index] ? `${prefix}-${row.id}` : undefined} ref={(input) => input?.setCustomValidity(errors[index] ?? "")} value={row.name} onChange={(event) => change(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
        <input aria-label="Значение параметра окружения" value={String(row.value ?? "")} onChange={(event) => change(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
        <button type="button" onClick={() => change(rows.filter((item) => item.id !== row.id))} title="Удалить"><X size={14} /></button>
      </div>
      {errors[index] ? <p className="warning" role="alert" id={`${prefix}-${row.id}`}>{errors[index]}</p> : null}
    </div>)}
    {!rows.length ? <p className="muted">Нет зафиксированных условий окружения.</p> : null}
  </div>;
}
