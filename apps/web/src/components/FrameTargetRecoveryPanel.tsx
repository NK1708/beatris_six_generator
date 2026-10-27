import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, RotateCcw, X } from "lucide-react";
import type {
  AvailableFrameTargetStoryStateResponse,
  FrameTargetRecoveryBlockReason,
  FrameTargetRecoveryCandidate,
  RecoveryImageAvailability
} from "@bearridge/shared";
import { ApiError, api } from "../api.js";
import type { Character, FrameStatus } from "../model.js";
import { frameLockReadinessQueryKey } from "./FrameLockReadiness.js";
import { frameTargetStoryStateQueryKey, StoryStateDocumentView } from "./FrameTargetStoryStatePanel.js";

export const frameTargetRecoveryCandidatesQueryKey = (frameId: string) => ["frame-target-recovery-candidates", frameId] as const;

const blockReasonLabels: Record<FrameTargetRecoveryBlockReason, string> = {
  FRAME_GENERATING: "Восстановление недоступно во время генерации.",
  TARGET_ALREADY_INITIALIZED: "Целевое состояние кадра уже существует.",
  GENERATION_NOT_SUCCESS: "Generation не завершена успешно.",
  SNAPSHOT_MISSING: "Историческое состояние отсутствует.",
  SNAPSHOT_INVALID: "Историческое состояние повреждено.",
  SNAPSHOT_SCENE_MISMATCH: "Историческое состояние относится к другой сцене.",
  SNAPSHOT_REFERENCE_MISSING: "В историческом состоянии есть недоступные canonical references.",
  LOCKED_SOURCE_NOT_SELECTED: "Для закреплённого кадра можно использовать только выбранную Generation."
};

const imageAvailabilityLabels: Record<RecoveryImageAvailability, string> = {
  AVAILABLE: "Изображение доступно",
  MISSING: "Файл изображения отсутствует",
  INVALID_PATH: "Путь изображения недопустим",
  UNREADABLE: "Файл изображения нельзя прочитать",
  UNSUPPORTED_FORMAT: "Формат изображения не поддерживается"
};

export function FrameTargetRecoveryPanel({ frameId, frameStatus, characters, onRecovered, onTargetAlreadyExists }: {
  frameId: string;
  frameStatus: FrameStatus;
  characters: Character[];
  onRecovered(target: AvailableFrameTargetStoryStateResponse): void;
  onTargetAlreadyExists(): void;
}) {
  const queryClient = useQueryClient();
  const activeFrameId = React.useRef(frameId);
  activeFrameId.current = frameId;
  const mountedRef = React.useRef(true);
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const postingRef = React.useRef(false);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);

  const candidates = useQuery({
    queryKey: frameTargetRecoveryCandidatesQueryKey(frameId),
    queryFn: () => api.getFrameTargetRecoveryCandidates(frameId),
    retry: false
  });
  const recover = useMutation({
    mutationFn: (input: { frameId: string; sourceGenerationId: string }) => api.recoverFrameTargetStoryState(input.frameId, { sourceGenerationId: input.sourceGenerationId }),
    onSuccess: (target, input) => {
      postingRef.current = false;
      queryClient.setQueryData(frameTargetStoryStateQueryKey(input.frameId), target);
      void queryClient.invalidateQueries({ queryKey: frameTargetRecoveryCandidatesQueryKey(input.frameId) });
      void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(input.frameId) });
      if (!mountedRef.current || activeFrameId.current !== input.frameId) return;
      setOpen(false);
      setSelectedId(null);
      setConfirming(false);
      setErrorCode(null);
      onRecovered(target);
    },
    onError: (error, input) => {
      postingRef.current = false;
      if (!mountedRef.current || activeFrameId.current !== input.frameId) return;
      const code = error instanceof ApiError ? error.code : null;
      setErrorCode(code ?? "NETWORK_ERROR");
      if (code === "TARGET_ALREADY_INITIALIZED") {
        setOpen(false);
        void queryClient.invalidateQueries({ queryKey: frameTargetStoryStateQueryKey(input.frameId) });
        void queryClient.invalidateQueries({ queryKey: frameTargetRecoveryCandidatesQueryKey(input.frameId) });
        onTargetAlreadyExists();
      }
    }
  });

  React.useEffect(() => {
    setOpen(false);
    setSelectedId(null);
    setConfirming(false);
    setErrorCode(null);
    postingRef.current = false;
  }, [frameId]);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

  const response = candidates.data?.frameId === frameId && Array.isArray(candidates.data.candidates) ? candidates.data : undefined;
  const hasHistory = Boolean(response?.candidates.length);
  if (candidates.isPending) return <p className="targetStateStatus" role="status">Проверка исторических Generations...</p>;
  if (candidates.isError) return <div className="targetStateError" role="alert"><span>Не удалось проверить доступные источники восстановления.</span><button type="button" onClick={() => void candidates.refetch()}>Повторить</button></div>;
  if (response && response.targetStatus !== "MISSING") return <p className="targetStateNotice targetStateNotice-info" role="status">Целевое состояние уже существует. Обновите данные кадра.</p>;
  if (!hasHistory) return null;

  const selected = response?.candidates.find((candidate) => candidate.generationId === selectedId) ?? null;
  const close = () => {
    if (recover.isPending) return;
    setOpen(false);
    setSelectedId(null);
    setConfirming(false);
    setErrorCode(null);
    queueMicrotask(() => openerRef.current?.focus());
  };
  const openRecovery = () => {
    setOpen(true);
    setSelectedId(null);
    setConfirming(false);
    setErrorCode(null);
  };

  return <section className="targetRecoveryEntry" aria-label="Восстановление состояния кадра">
    <p>У этого кадра нет сохранённого целевого состояния. Его можно восстановить из исторического состояния одной из генераций.</p>
    {!open ? <button ref={openerRef} type="button" onClick={openRecovery}>Восстановить из Generation</button> : <div className="targetRecoveryFlow">
      <div className="targetRecoveryHeader"><div><h3>Восстановление состояния кадра</h3><p>Выберите историческую Generation и проверьте состояние перед восстановлением.</p></div><button type="button" className="iconButton" aria-label="Закрыть восстановление" title="Закрыть" disabled={recover.isPending} onClick={close}><X size={16} /></button></div>
      {frameStatus === "LOCKED" ? <p className="targetStateNotice targetStateNotice-warning"><AlertTriangle size={16} /> Кадр закреплён. После восстановления состояние будет доступно только для просмотра.</p> : null}
      {frameStatus === "GENERATING" ? <p className="targetStateError" role="alert">Восстановление недоступно, пока выполняется генерация.</p> : null}
      <div className="targetRecoveryCandidates" role="radiogroup" aria-label="Источник восстановления">
        {response!.candidates.map((candidate) => <RecoveryCandidateCard key={candidate.generationId} candidate={candidate} selected={candidate.generationId === selectedId} onSelect={() => { setSelectedId(candidate.generationId); setConfirming(false); setErrorCode(null); }} />)}
      </div>
      {selected?.previewDocument ? <div className="targetRecoveryPreview"><h4>Состояние из выбранной Generation</h4><StoryStateDocumentView document={selected.previewDocument} characters={characters} /><p className="targetStateNotice targetStateNotice-warning"><AlertTriangle size={16} /> Это состояние использовалось при создании изображения. Оно может отличаться от фактического содержимого кадра.</p></div> : null}
      {selected && selected.imageAvailability !== "AVAILABLE" ? <p className="targetStateNotice targetStateNotice-warning"><AlertTriangle size={16} /> Файл изображения недоступен. Историческое состояние можно восстановить, но закрепление кадра потребует доступного изображения.</p> : null}
      {errorCode ? <RecoveryError code={errorCode} onRefresh={errorCode === "RECOVERY_CONFLICT" ? () => void candidates.refetch() : undefined} /> : null}
      {confirming && selected ? <div className="targetRecoveryConfirmation" role="region" aria-labelledby="recovery-confirm-title">
        <strong id="recovery-confirm-title">Подтвердите восстановление</strong>
        <span>Кадр: {frameId}</span><span>Источник: {shortId(selected.generationId)}</span>
        <p>Будет создано целевое состояние кадра. Существующие Generations и изображения не изменятся. Статус кадра и выбранная Generation останутся прежними.</p>
      </div> : null}
      <div className="targetStateActions">
        {confirming ? <button type="button" disabled={!selected?.isEligible || recover.isPending || frameStatus === "GENERATING"} onClick={() => { if (!selected?.isEligible || postingRef.current) return; postingRef.current = true; recover.mutate({ frameId, sourceGenerationId: selected.generationId }); }}>{recover.isPending ? "Восстановление..." : <><Check size={15} /> Восстановить состояние</>}</button> : <button type="button" disabled={!selected?.isEligible || frameStatus === "GENERATING"} onClick={() => setConfirming(true)}>Продолжить</button>}
        <button type="button" disabled={recover.isPending} onClick={close}><X size={15} /> Отмена</button>
      </div>
    </div>}
  </section>;
}

function RecoveryCandidateCard({ candidate, selected, onSelect }: { candidate: FrameTargetRecoveryCandidate; selected: boolean; onSelect(): void }) {
  return <label className={`targetRecoveryCandidate${selected ? " is-selected" : ""}${candidate.isEligible ? "" : " is-disabled"}`}>
    <input type="radio" name="recovery-source" value={candidate.generationId} checked={selected} disabled={!candidate.isEligible} onChange={onSelect} />
    <span className="targetRecoveryCandidateBody"><span className="targetRecoveryCandidateTitle"><strong>{candidate.provider} · {candidate.model}</strong>{candidate.isRecommended ? <span className="status status-selected">Рекомендуется</span> : null}{candidate.isSelected ? <span className="status status-selected">Выбрана</span> : null}</span>
      <span>{formatDate(candidate.createdAt)} · {candidate.generationType} · {candidate.generationStatus}</span>
      <span className={candidate.imageAvailability === "AVAILABLE" ? "targetRecoveryAvailable" : "targetRecoveryWarning"}>{imageAvailabilityLabels[candidate.imageAvailability]}</span>
      <small>Generation ID: {candidate.generationId}</small>
      {candidate.isEligible ? <span className="targetRecoveryAvailable">Пригодна для восстановления</span> : <span className="targetRecoveryReasons">{candidate.blockingReasons.map((reason) => <span key={reason}>{blockReasonLabels[reason]}</span>)}</span>}
    </span>
  </label>;
}

function RecoveryError({ code, onRefresh }: { code: string; onRefresh?: (() => void) | undefined }) {
  const message = recoveryErrorMessage(code);
  return <div className="targetStateError" role="alert"><strong>Восстановление не выполнено</strong><span>{message}</span>{onRefresh ? <button type="button" onClick={onRefresh}><RotateCcw size={14} /> Обновить список</button> : null}</div>;
}

export function recoveryErrorMessage(code: string): string {
  const labels: Record<string, string> = {
    FRAME_NOT_FOUND: "Кадр больше недоступен.", FRAME_GENERATING: "Дождитесь завершения текущей генерации.",
    TARGET_ALREADY_INITIALIZED: "Целевое состояние кадра уже создано.", RECOVERY_SOURCE_REQUIRED: "Выберите источник восстановления.",
    GENERATION_NOT_FOUND: "Generation больше недоступна.", GENERATION_OWNERSHIP_MISMATCH: "Generation относится к другому кадру.",
    GENERATION_NOT_SUCCESS: "Generation не завершена успешно.", SNAPSHOT_MISSING: "У Generation отсутствует историческое состояние.",
    SNAPSHOT_INVALID: "Историческое состояние повреждено.", SNAPSHOT_SCENE_MISMATCH: "Историческое состояние относится к другой сцене.",
    SNAPSHOT_REFERENCE_MISSING: "В историческом состоянии есть недоступные canonical references.",
    LOCKED_SOURCE_NOT_SELECTED: "Для закреплённого кадра доступна только выбранная Generation.",
    RECOVERY_CONFLICT: "Данные кадра изменились. Обновите список и проверьте источник повторно.",
    NETWORK_ERROR: "Не удалось связаться с сервером. Выбор и preview сохранены; можно повторить попытку."
  };
  return labels[code] ?? "Не удалось восстановить состояние. Проверьте источник и повторите попытку.";
}

function shortId(value: string): string { return value.length > 12 ? `${value.slice(0, 8)}…` : value; }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU"); }
