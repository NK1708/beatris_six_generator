import React from "react";
import { StoryStateHolder, displayStoryStateValue } from "./StoryStateHolder.js";
import type { StoryStateDocument } from "@bearridge/shared";
import type { Character } from "../model.js";
import { compareTargetProperty, formatTargetValue, targetStateDiff, type TargetComparisonSource, type TargetPropertyDiff } from "../targetStateComparison.js";
import { EnvironmentStateEditor } from "./EnvironmentStateEditor.js";

const statusLabels = { unchanged: "Без изменений", changed: "Изменено", added: "Добавлено", removed: "Удалено", unavailable: "Источник недоступен" };
const fieldLabels: Record<string, string> = { time: "Время", description: "Описание", environment: "Окружение", characters: "Персонажи", present: "Присутствие", outfitId: "Образ", emotion: "Эмоция", hairState: "Волосы", pose: "Поза", locationPosition: "Положение", heldProps: "В руках", notes: "Заметки", props: "Предметы", location: "Расположение", holderCharacterId: "У персонажа", state: "Состояние", storyFacts: "Факты истории" };

export function StatePropertyDiff({ diff, display = formatTargetValue }: { diff: TargetPropertyDiff; display?: (value: unknown) => string }) {
  return <div className={"targetPropertyDiff diff-" + diff.status}><span className="targetDiffBadge">{statusLabels[diff.status]}</span><div><span>Исходное</span><strong>{diff.status === "unavailable" ? "Недоступно" : display(diff.before)}</strong></div><span aria-hidden="true">→</span><div><span>Целевое</span><strong>{display(diff.after)}</strong></div></div>;
}

export function TargetComparisonOverview({ source, document, characters }: { source: TargetComparisonSource; document: StoryStateDocument; characters: Character[] }) {
  const rows = targetStateDiff(source, document);
  const names = new Map(characters.map(character => [character.id, character.name]));
  const changed = rows.filter(row => row.status !== "unchanged" && row.status !== "unavailable").length;
  return <div className="targetComparisonOverview"><div className={"targetSourceNotice " + (source.status === "AVAILABLE" ? "" : "isUnavailable")}><h3>{source.label}</h3><p>{source.note}</p></div><details className="targetComparisonList"><summary>{source.status === "AVAILABLE" ? "Исходное → Целевое · изменений: " + changed : "Исходное → Целевое · сравнение недоступно"}</summary>{rows.map(row => <div className="targetComparisonItem" key={JSON.stringify(row.path)}><h4>{row.path.map(part => names.get(part) ?? fieldLabels[part] ?? part).join(" / ")}</h4><StatePropertyDiff diff={row} display={value => displayStoryStateValue(value, row.path, characters)} /></div>)}</details></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="targetFullSection" open><summary>{title}</summary><div className="targetFullSectionBody">{children}</div></details>;
}

function StringList({ title, values, onChange }: { title: string; values: string[]; onChange(values: string[]): void }) {
  return <div className="targetFullList"><div className="toolbar"><strong>{title}</strong><button type="button" onClick={() => onChange([...values, ""])}>Добавить</button></div>{values.map((value, index) => <div className="targetFullListRow" key={index}><input aria-label={title + " " + (index + 1)} value={value} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))} /><button type="button" aria-label={"Удалить: " + title + " " + (index + 1)} onClick={() => onChange(values.filter((_, i) => i !== index))}>Удалить</button></div>)}{!values.length ? <p className="muted">Список пуст.</p> : null}</div>;
}

export function TargetStateFields({ document, source, characters, castIds, onChange, onEnvironmentPendingChange, readOnly = false }: {
  document: StoryStateDocument; source: TargetComparisonSource; characters: Character[]; castIds: string[]; onChange(document: StoryStateDocument): void; onEnvironmentPendingChange?: ((pending: boolean) => void) | undefined; readOnly?: boolean;
}) {
  const before = source.status === "AVAILABLE" ? source.document : null;
  const ids = [...new Set([...castIds, ...Object.keys(document.characters), ...Object.keys(before?.characters ?? {})])];
  const property = (path: string[]) => <StatePropertyDiff diff={compareTargetProperty(source, document, path)} display={value => displayStoryStateValue(value, path, characters)} />;
  const optional = (value: string) => value.trim() ? value : undefined;
  return <fieldset className="targetFullFields" disabled={readOnly}>
    <Section title="Время"><label>Описание времени<textarea value={document.time.description} onChange={event => onChange({ ...document, time: { ...document.time, description: event.target.value } })} /></label>{property(["time", "description"])}</Section>
    <Section title="Персонажи"><p className="muted">Состав кадра и присутствие в состоянии — разные данные. Изменения здесь не меняют Frame Cast.</p>
      {ids.map(id => {
        const character = characters.find(item => item.id === id);
        const value = document.characters[id];
        const update = (patch: Partial<StoryStateDocument["characters"][string]>) => { if (value) onChange({ ...document, characters: { ...document.characters, [id]: { ...value, ...patch } } }); };
        return <article className="targetCharacterCard" key={id}><header><h3>{character?.name ?? id}</h3><span>{castIds.includes(id) ? "В составе кадра" : "Вне состава кадра"}</span><span>{value ? value.present ? "Присутствует в Target" : "Не присутствует в Target" : "Нет записи в Target"}</span></header>
          {value ? <><label className="checkline"><input type="checkbox" checked={value.present} onChange={event => update({ present: event.target.checked })} />Присутствует в целевом состоянии</label>{property(["characters", id, "present"])}
            <div className="targetCharacterProperties"><div><label>Образ<select value={value.outfitId ?? ""} onChange={event => update({ outfitId: optional(event.target.value) })}><option value="">Не задан</option>{value.outfitId && !character?.outfits.some(outfit => outfit.id === value.outfitId) ? <option value={value.outfitId}>Сохранённый образ: {value.outfitId}</option> : null}{character?.outfits.map(outfit => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}</select></label><StatePropertyDiff diff={compareTargetProperty(source, document, ["characters", id, "outfitId"])} display={raw => typeof raw === "string" ? character?.outfits.find(outfit => outfit.id === raw)?.name ?? raw : formatTargetValue(raw)} /></div>
              {(["emotion", "hairState", "pose", "locationPosition"] as const).map(field => <div key={field}><label>{fieldLabels[field]}<input value={value[field] ?? ""} onChange={event => update({ [field]: optional(event.target.value) })} /></label>{property(["characters", id, field])}</div>)}
            </div><StringList title="Удерживаемые предметы" values={value.heldProps ?? []} onChange={heldProps => update({ heldProps })} />{property(["characters", id, "heldProps"])}<StringList title="Заметки персонажа" values={value.notes ?? []} onChange={notes => update({ notes })} />{property(["characters", id, "notes"])}<button type="button" onClick={() => { const next = { ...document.characters }; delete next[id]; onChange({ ...document, characters: next }); }}>Удалить запись Target</button></> : <><StatePropertyDiff diff={compareTargetProperty(source, document, ["characters", id])} /><button type="button" onClick={() => onChange({ ...document, characters: { ...document.characters, [id]: { present: false } } })}>Добавить состояние персонажа</button></>}
        </article>;
      })}
      {!ids.length ? <p className="muted">Персонажи в составе и состояниях не заданы.</p> : null}
      <label>Добавить запись персонажа в Target<select value="" onChange={event => { if (event.target.value) onChange({ ...document, characters: { ...document.characters, [event.target.value]: { present: false } } }); }}><option value="">Выберите персонажа</option>{characters.filter(character => !document.characters[character.id]).map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
    </Section>
    <Section title="Окружение"><EnvironmentStateEditor state={document} onChange={onChange} typedValues onPendingChange={onEnvironmentPendingChange} /><details className="targetEnvironmentDiff" open><summary>Исходное → Целевое</summary>{[...new Set([...Object.keys(before?.environment ?? {}), ...Object.keys(document.environment)])].map(key => <div className="targetComparisonItem" key={key}><h4>{key}</h4>{property(["environment", key])}</div>)}</details></Section>
    <Section title="Предметы">{[...new Set([...Object.keys(before?.props ?? {}), ...Object.keys(document.props)])].map(id => {
      const value = document.props[id];
      return <article className="targetPropCard" key={id}><h3>{id}</h3>{value ? <><div className="targetCharacterProperties">{(["location", "holderCharacterId", "state"] as const).map(field => <div key={field}><label>{fieldLabels[field]}{field === "holderCharacterId" ? <StoryStateHolder value={value.holderCharacterId} characters={characters} onChange={holderCharacterId => onChange({ ...document, props: { ...document.props, [id]: { ...value, holderCharacterId } } })} /> : <input value={value[field] ?? ""} onChange={event => onChange({ ...document, props: { ...document.props, [id]: { ...value, [field]: optional(event.target.value) } } })} />}</label>{property(["props", id, field])}</div>)}</div><button type="button" onClick={() => { const next = { ...document.props }; delete next[id]; onChange({ ...document, props: next }); }}>Удалить предмет из Target</button></> : property(["props", id])}</article>;
    })}<button type="button" onClick={() => { let index = 1; while (Object.hasOwn(document.props, "prop_" + index)) index++; onChange({ ...document, props: { ...document.props, ["prop_" + index]: {} } }); }}>Добавить предмет</button></Section>
    <Section title="Факты истории"><StringList title="Факты истории" values={document.storyFacts} onChange={storyFacts => onChange({ ...document, storyFacts })} />{property(["storyFacts"])}</Section>
  </fieldset>;
}
