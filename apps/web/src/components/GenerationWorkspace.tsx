import { generationModeLabel, generationStatusLabel } from "../frameWorkspaceUi.js";
import type { FrameReviewActions } from "./useFrameReviewActions.js";
import { ReviewActionFeedback } from "./FrameReviewWorkspace.js";
import React from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import type { Frame, Generation, PreviewResponse, Project } from "../model.js";
import { useUiStore } from "../state.js";
import { projectFileUrl } from "../utils.js";
import { canSelectFrameGeneration, frameLockReadinessQueryKey } from "./FrameLockReadiness.js";
import { canPrepareProduction, generationFix, generationMetadata, generationProblemLabel, generationRequest, GenerationRequestError, type GenerationDiagnostic, type GenerationFix } from "../generationWorkspace.js";

function ResultImage({ project, generation }: { project: Project; generation: Generation }) {
  const [failed, setFailed] = React.useState(false);
  const [size, setSize] = React.useState<string | null>(null);
  if (!generation.outputFilePath || failed) return <div className="generationImagePlaceholder">{generation.status === "PENDING" || generation.status === "RUNNING" ? "Изображение ещё не готово" : generation.outputFilePath ? "Файл изображения недоступен" : "Файл изображения отсутствует"}</div>;
  return <div className="generationThumbnail"><img src={projectFileUrl(project, generation.outputFilePath)} alt={"Результат " + generation.id} onError={() => setFailed(true)} onLoad={event => setSize(event.currentTarget.naturalWidth + " × " + event.currentTarget.naturalHeight)} /><small>{size ?? "Размер изображения ещё не прочитан"}</small></div>;
}

function Problem({ issue, project, onFix }: { issue: GenerationDiagnostic; project: Project; onFix(fix: GenerationFix): void }) {
  const fix = generationFix(project, issue);
  return <li><p>{generationProblemLabel(issue.code, issue.message)}</p>{fix.kind === "explain" ? <small>{fix.label}</small> : <button type="button" onClick={() => onFix(fix)}>{fix.label}</button>}<details><summary>Технические сведения</summary><code>{issue.code}</code><p>{issue.message}</p>{issue.entityId ? <small>Asset: {issue.entityId}</small> : null}</details></li>;
}

export interface GenerationWorkspaceProps {
  project: Project; frame: Frame | undefined; preview: PreviewResponse | undefined;
  previewLoading: boolean; previewError: Error | null; dirty: boolean;
  refresh(): void; onView(generationId: string): void; onTarget(): void; onCast(): void;
  manualControls: React.ReactNode; reviewActions?: FrameReviewActions; onCompare?: () => void; onReview?: () => void;
}

export function GenerationWorkspace({ project, frame, preview, previewLoading, previewError, dirty, refresh, onView, onTarget, onCast, manualControls, reviewActions, onCompare, onReview }: GenerationWorkspaceProps) {
  const client = useQueryClient();
  const frameId = frame?.id;
  const requestKey = ["studio-project", "generation", project.id, frameId];
  const otherRequest = useIsMutating({ mutationKey: requestKey });
  const sending = React.useRef(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [sessionModes, setSessionModes] = React.useState<Record<string, "draft" | "production">>({});
  const health = useQuery({ queryKey: ["generation-provider"], queryFn: () => api.get<{ provider: string }>("/api/health"), enabled: Boolean(frameId), staleTime: 60000, retry: false });
  const invalidate = () => { void client.invalidateQueries({ queryKey: ["project", project.id] }); if (frameId) { void client.invalidateQueries({ queryKey: ["preview", frameId] }); void client.invalidateQueries({ queryKey: frameLockReadinessQueryKey(frameId) }); } };
  const generate = useMutation({
    mutationKey: requestKey, retry: false,
    mutationFn: (mode: "draft" | "production") => generationRequest<Generation>("/api/generations", { frameId, mode }),
    onSuccess: (result, mode) => { setSessionModes(current => ({ ...current, [result.id]: mode })); setNotice(result.status === "SUCCESS" ? "Результат создан. Откройте его для проверки; выбор выполняется отдельно." : "Запрос завершён. Проверьте статус в списке результатов."); },
    onSettled: () => { sending.current = false; invalidate(); }
  });
  const localSelect = useMutation({
    mutationKey: ["studio-project", "generation-selection", project.id, frameId], retry: false,
    mutationFn: (generationId: string) => api.put(`/api/frames/${frameId}/selected-generation`, { generationId }),
    onSuccess: () => { invalidate(); setNotice("Результат выбран. Готовность к закреплению проверяется отдельно в режиме изображения."); }
  });
  const busy = generate.isPending || otherRequest > 0 || frame?.status === "GENERATING";
  const locked = frame?.status === "LOCKED";
  const unavailable = !frame || locked || busy || dirty || (reviewActions?.busy ?? localSelect.isPending);
  const productionReady = !previewLoading && !previewError && canPrepareProduction(preview);
  const launch = (mode: "draft" | "production") => {
    if (sending.current || unavailable || (mode === "production" && !productionReady)) return;
    // Synchronous guard covers multiple clicks before React updates isPending.
    sending.current = true; setNotice(null); generate.mutate(mode);
  };
  const onFix = (fix: GenerationFix) => {
    const state = useUiStore.getState();
    if (fix.kind === "target") onTarget();
    else if (fix.kind === "cast") onCast();
    else if (fix.kind === "character" || fix.kind === "outfit") {
      state.setSection("characters"); if (useUiStore.getState().section === "characters") state.selectCharacter(fix.id);
      if (fix.kind === "outfit" && useUiStore.getState().section === "characters") state.setSection("outfits");
    } else if (fix.kind === "location") {
      state.setSection("locations"); if (useUiStore.getState().section === "locations") state.selectLocation(fix.id);
    } else if (fix.kind === "style") {
      state.setSection("styles"); if (useUiStore.getState().section === "styles") state.selectStyle(fix.id);
    }
  };
  const serverProblems = previewError instanceof GenerationRequestError ? previewError.problems : [];
  const blocking = preview?.warnings.filter(item => item.severity === "blocking") ?? [];
  const warnings = preview?.warnings.filter(item => item.severity !== "blocking") ?? [];
  const provider = health.data?.provider;
  const configuredModelsApply = provider === "gemini" || provider === "mock";
  return <section className="generationWorkspace" aria-label="Подготовка генерации и результаты">
    <header className="generationStatusSummary"><div><h2>Генерация</h2><p className="muted">{frame ? frame.frameCode + " · " + (frame.generationStrategy === "NEW_COMPOSITION" ? "Новая композиция" : "Продолжение предыдущего кадра") : "Выберите кадр"}</p><p className={productionReady ? "generationReady" : "generationBlocked"} role="status">{locked ? "Кадр закреплён · доступна история результатов" : previewLoading ? "Проверка финальной генерации…" : productionReady ? "Финальная генерация готова к запуску" : "Финальная генерация пока недоступна"} · Проблем: {blocking.length + serverProblems.length}{previewError && !serverProblems.length ? " · проверка не получена" : ""}</p><p className="generationDraftAvailability">Черновая генерация: {unavailable ? locked ? "кадр закреплён" : dirty ? "сначала сохраните изменения" : busy ? "запрос выполняется" : !frame ? "выберите кадр" : "дождитесь завершения действия" : "доступна"}</p></div><div className="generationSummaryActions"><button type="button" className="primaryAction" disabled={unavailable} onClick={() => launch(productionReady ? "production" : "draft")}>{productionReady ? "Создать финальный результат" : "Создать черновик"}</button><button type="button" disabled={busy || previewLoading} onClick={() => { refresh(); invalidate(); }}>Обновить проверку и результаты</button></div>{dirty ? <p className="warning" role="alert">Есть несохранённые изменения постановки, Target или сцены. Сохраните их перед запуском. Переключение режимов сохраняет черновики.</p> : null}</header>
    <section className="generationLaunch"><h3>Запуск генерации</h3><dl><dt>Провайдер</dt><dd>{provider ?? "Не удалось определить через /api/health"}</dd><dt>Целевая область</dt><dd>{frame?.targetWidth && frame.targetHeight ? frame.targetWidth + " × " + frame.targetHeight : "Геометрия по настройкам проекта"}{frame?.targetAspectRatio ? " · " + frame.targetAspectRatio.toFixed(2) + ":1" : ""}</dd></dl><div className="generationModeCards"><div><h4>Черновая генерация</h4><p>По текущему состоянию сцены. Допускает часть пробелов контекста; ограничения продолжения проверит сервер.</p><strong>{unavailable ? "Сейчас недоступна" : "Доступна"}</strong><small>Модель: {configuredModelsApply ? project.defaultDraftModel : "Определяется сервером; модель не возвращена"}</small><button type="button" disabled={unavailable} onClick={() => launch("draft")}>Создать черновик</button></div><div><h4>Финальная генерация</h4><p>По сохранённому целевому состоянию и обязательным каноническим референсам.</p><strong>{productionReady && !unavailable ? "Готова к запуску" : "Недоступна: " + (dirty ? "сохраните изменения" : locked ? "кадр закреплён" : busy ? "дождитесь запроса" : "проверьте проблемы контекста")}</strong><small>Модель: {configuredModelsApply ? project.defaultProductionModel : "Определяется сервером; модель не возвращена"}</small><button type="button" disabled={unavailable || !productionReady} onClick={() => launch("production")}>Создать финальный результат</button></div></div>
      {busy ? <p role="status">Запрос выполняется или кадр находится в GENERATING. Дождитесь результата; повторная отправка отключена.</p> : null}{notice ? <p role="status">{notice}</p> : null}
      {generate.error ? <div className="generationIssueGroup blocking" role="alert"><p>{generate.error instanceof GenerationRequestError && generate.error.code ? generationProblemLabel(generate.error.code, generate.error.message) : "Не удалось получить ответ. Проверьте список результатов перед повторным запуском."}</p>{generate.error instanceof GenerationRequestError ? <><ul>{generate.error.problems.map((item, index) => <Problem key={index} issue={item} project={project} onFix={onFix} />)}</ul><details><summary>Ошибка запроса</summary><code>{generate.error.code} · HTTP {generate.error.status}</code><p>{generate.error.message}</p></details></> : null}</div> : null}
      <details><summary>Если соединение прервалось</summary><p>Запрос может завершиться на сервере после потери соединения. API не предоставляет ключ идемпотентности для повторной отправки. Обновите результаты и статус кадра перед новым запуском. Автоматического повтора нет.</p></details>
    </section>
    <section className="generationPreparation"><h3>Проблемы контекста и референсы</h3><div className="generationIssuesGrid">      {previewError && !locked ? <div className="generationIssueGroup blocking" role="alert"><h4>Серверная проверка недоступна</h4><p>{previewError instanceof GenerationRequestError && previewError.code ? generationProblemLabel(previewError.code, previewError.message) : previewError.message}</p><ul>{serverProblems.map((item, index) => <Problem key={index} issue={item} project={project} onFix={onFix} />)}</ul>{previewError instanceof GenerationRequestError ? <details><summary>Код ответа</summary><code>{previewError.code ?? "HTTP_ERROR"} · HTTP {previewError.status}</code></details> : null}</div> : null}
      {blocking.length ? <div className="generationIssueGroup blocking" role="alert"><h4>Блокирующие проблемы · {blocking.length}</h4><ul>{blocking.map((item, index) => <Problem key={index} issue={item} project={project} onFix={onFix} />)}</ul></div> : null}
      {warnings.length ? <div className="generationIssueGroup"><h4>Предупреждения · {warnings.length}</h4><ul>{warnings.map((item, index) => <Problem key={index} issue={item} project={project} onFix={onFix} />)}</ul></div> : null}
      </div><div className="generationContextActions"><button type="button" onClick={onTarget}>Открыть состояние кадра</button><button type="button" onClick={onCast}>Состав персонажей кадра</button></div>
      {preview ? <details className="generationContext"><summary>Контекст финальной генерации и референсы · {preview.references.length}</summary><p className="muted">Показан контекст финальной генерации. Черновая генерация использует текущее состояние сцены.</p><dl><dt>Персонажи</dt><dd>{preview.context.characters.map(item => item.name).join(", ") || "Нет персонажей"}</dd><dt>Локация</dt><dd>{preview.context.location?.name ?? "Не задана"}</dd><dt>Стиль</dt><dd>{preview.context.styleProfile?.name ?? "Не задан"}</dd><dt>Target</dt><dd>{preview.productionTarget ? "Сохранённая revision " + preview.productionTarget.revision : "Revision не возвращена"}</dd><dt>Время</dt><dd>{preview.context.storyState.time?.description || "Не задано"}</dd></dl>{preview.references.length ? <ul>{preview.references.map(reference => <li key={reference.id}><strong>{reference.label ?? reference.code}</strong><small>{reference.role ?? reference.kind}</small><details><summary>Версия референса</summary><code>{reference.code} · {reference.id}</code></details></li>)}</ul> : <p>Канонические референсы не подобраны. Учитывайте сообщения серверной проверки.</p>}{preview.baseReference ? <p>Визуальная основа: {preview.baseReference.label ?? preview.baseReference.code}</p> : null}<details><summary>Серверный preview геометрии и prompt</summary><p>Геометрия preview: {preview.geometry.requestedResolution} · {preview.geometry.requestedAspectRatio}. Параметры конкретного запроса определяет сервер.</p><pre>{preview.prompt}</pre></details></details> : <p className="muted">Контекст и референсы будут показаны после успешного получения preview. Черновая генерация проверяет свой контекст на сервере при запуске.</p>}
    </section>
    <section className="generationResults"><div className="compareActions">{onCompare ? <button type="button" onClick={onCompare}>Сравнить результаты</button> : null}{onReview ? <button type="button" onClick={onReview}>Проверить выбранный результат</button> : null}</div><h3>Результаты кадра · {frame?.generations.length ?? 0}</h3><p className="muted">{!frame?.selectedGenerationId ? "Результат пока не выбран. Просмотр изображения не меняет выбор." : frame.generations.some(item => item.id === frame.selectedGenerationId) ? "Выбранный результат отмечен в списке. Новый просмотр не меняет этот выбор." : "Выбранная Generation отсутствует в списке. Другой результат не подставляется."}</p>{!frame?.generations.length ? <p className="generationEmpty">Результатов пока нет. Подготовьте контекст и запустите черновую или финальную генерацию либо импортируйте изображение вручную.</p> : null}{frame?.generations.map(generation => {
      const metadata = generationMetadata(generation); const selected = generation.id === frame.selectedGenerationId;
      return <article className={"generationResultCard" + (selected ? " isSelected" : "")} key={generation.id} data-generation-id={generation.id}><ResultImage key={generation.id + ":" + generation.outputFilePath} project={project} generation={generation} /><div><div className="generationResultHeading"><strong>{generationStatusLabel(generation.status)}</strong>{selected ? <span className="status status-selected">Выбранный результат</span> : null}</div><p>{metadata.mode === "Режим не сохранён" && sessionModes[generation.id] ? (sessionModes[generation.id] === "draft" ? "Черновая генерация" : "Финальная генерация") + " · запуск в этой сессии" : generationModeLabel(metadata.mode)} · {new Date(generation.createdAt).toLocaleString()}</p><p>{generation.provider} / {generation.model}</p><small>Запрошено: {generation.resolution ?? "размер не сохранён"}{generation.aspectRatio ? " · " + generation.aspectRatio : ""}</small>{metadata.targetRevision !== null ? <small>Target revision при запуске: {metadata.targetRevision}</small> : null}{generation.status === "FAILED" ? <p className="warning" role="alert">Генерация завершилась с ошибкой. {metadata.error ?? "Текст ошибки не сохранён."}</p> : null}{generation.status === "PENDING" || generation.status === "RUNNING" ? <p role="status">Результат ещё не готов. Обновите список после завершения запроса.</p> : null}<details><summary>Идентификатор и тип операции</summary><code>{generation.id}</code><p>{generation.generationType}</p></details><div className="generationResultActions"><button type="button" onClick={() => onView(generation.id)}>Посмотреть</button><button type="button" disabled={selected || dirty || busy || (reviewActions?.busy ?? localSelect.isPending) || !canSelectFrameGeneration(frame.status, generation.status)} onClick={() => { if (!(reviewActions?.busy ?? localSelect.isPending) && !dirty && !busy && canSelectFrameGeneration(frame.status, generation.status)) (reviewActions ? reviewActions.select(generation.id) : localSelect.mutate(generation.id)); }}>Выбрать результат</button></div></div></article>;
    })}{reviewActions ? <ReviewActionFeedback actions={reviewActions} /> : localSelect.error ? <p role="alert" className="warning">{localSelect.error.message}</p> : null}</section>
    <section className="generationManual"><h3>ChatGPT · ручной экспорт и импорт</h3><p className="muted">Экспортируйте пакет, получите изображение вручную и импортируйте его с выбранным пакетом. Отправка в ChatGPT не выполняется автоматически.</p>{manualControls}</section>
  </section>;
}
