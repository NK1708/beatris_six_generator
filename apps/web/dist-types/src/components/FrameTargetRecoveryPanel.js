import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, RotateCcw, X } from "lucide-react";
import { ApiError, api } from "../api.js";
import { frameLockReadinessQueryKey } from "./FrameLockReadiness.js";
import { frameTargetStoryStateQueryKey, StoryStateDocumentView } from "./FrameTargetStoryStatePanel.js";
export const frameTargetRecoveryCandidatesQueryKey = (frameId) => ["frame-target-recovery-candidates", frameId];
const blockReasonLabels = {
    FRAME_GENERATING: "Восстановление недоступно во время генерации.",
    TARGET_ALREADY_INITIALIZED: "Целевое состояние кадра уже существует.",
    GENERATION_NOT_SUCCESS: "Generation не завершена успешно.",
    SNAPSHOT_MISSING: "Историческое состояние отсутствует.",
    SNAPSHOT_INVALID: "Историческое состояние повреждено.",
    SNAPSHOT_SCENE_MISMATCH: "Историческое состояние относится к другой сцене.",
    SNAPSHOT_REFERENCE_MISSING: "В историческом состоянии есть недоступные canonical references.",
    LOCKED_SOURCE_NOT_SELECTED: "Для закреплённого кадра можно использовать только выбранную Generation."
};
const imageAvailabilityLabels = {
    AVAILABLE: "Изображение доступно",
    MISSING: "Файл изображения отсутствует",
    INVALID_PATH: "Путь изображения недопустим",
    UNREADABLE: "Файл изображения нельзя прочитать",
    UNSUPPORTED_FORMAT: "Формат изображения не поддерживается"
};
export function FrameTargetRecoveryPanel({ frameId, frameStatus, characters, onRecovered, onTargetAlreadyExists }) {
    const queryClient = useQueryClient();
    const activeFrameId = React.useRef(frameId);
    activeFrameId.current = frameId;
    const mountedRef = React.useRef(true);
    const [open, setOpen] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState(null);
    const [confirming, setConfirming] = React.useState(false);
    const [errorCode, setErrorCode] = React.useState(null);
    const postingRef = React.useRef(false);
    const openerRef = React.useRef(null);
    const candidates = useQuery({
        queryKey: frameTargetRecoveryCandidatesQueryKey(frameId),
        queryFn: () => api.getFrameTargetRecoveryCandidates(frameId),
        retry: false
    });
    const recover = useMutation({
        mutationFn: (input) => api.recoverFrameTargetStoryState(input.frameId, { sourceGenerationId: input.sourceGenerationId }),
        onSuccess: (target, input) => {
            postingRef.current = false;
            queryClient.setQueryData(frameTargetStoryStateQueryKey(input.frameId), target);
            void queryClient.invalidateQueries({ queryKey: frameTargetRecoveryCandidatesQueryKey(input.frameId) });
            void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(input.frameId) });
            if (!mountedRef.current || activeFrameId.current !== input.frameId)
                return;
            setOpen(false);
            setSelectedId(null);
            setConfirming(false);
            setErrorCode(null);
            onRecovered(target);
        },
        onError: (error, input) => {
            postingRef.current = false;
            if (!mountedRef.current || activeFrameId.current !== input.frameId)
                return;
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
    if (candidates.isPending)
        return _jsx("p", { className: "targetStateStatus", role: "status", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0445 Generations..." });
    if (candidates.isError)
        return _jsxs("div", { className: "targetStateError", role: "alert", children: [_jsx("span", { children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F." }), _jsx("button", { type: "button", onClick: () => void candidates.refetch(), children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C" })] });
    if (response && response.targetStatus !== "MISSING")
        return _jsx("p", { className: "targetStateNotice targetStateNotice-info", role: "status", children: "\u0426\u0435\u043B\u0435\u0432\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043A\u0430\u0434\u0440\u0430." });
    if (!hasHistory)
        return null;
    const selected = response?.candidates.find((candidate) => candidate.generationId === selectedId) ?? null;
    const close = () => {
        if (recover.isPending)
            return;
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
    return _jsxs("section", { className: "targetRecoveryEntry", "aria-label": "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043A\u0430\u0434\u0440\u0430", children: [_jsx("p", { children: "\u0423 \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430 \u043D\u0435\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u043E\u0433\u043E \u0446\u0435\u043B\u0435\u0432\u043E\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F. \u0415\u0433\u043E \u043C\u043E\u0436\u043D\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0437 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043E\u0434\u043D\u043E\u0439 \u0438\u0437 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0439." }), !open ? _jsx("button", { ref: openerRef, type: "button", onClick: openRecovery, children: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0437 Generation" }) : _jsxs("div", { className: "targetRecoveryFlow", children: [_jsxs("div", { className: "targetRecoveryHeader", children: [_jsxs("div", { children: [_jsx("h3", { children: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043A\u0430\u0434\u0440\u0430" }), _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0443\u044E Generation \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u043C." })] }), _jsx("button", { type: "button", className: "iconButton", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435", title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", disabled: recover.isPending, onClick: close, children: _jsx(X, { size: 16 }) })] }), frameStatus === "LOCKED" ? _jsxs("p", { className: "targetStateNotice targetStateNotice-warning", children: [_jsx(AlertTriangle, { size: 16 }), " \u041A\u0430\u0434\u0440 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D. \u041F\u043E\u0441\u043B\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430."] }) : null, frameStatus === "GENERATING" ? _jsx("p", { className: "targetStateError", role: "alert", children: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E, \u043F\u043E\u043A\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F." }) : null, _jsx("div", { className: "targetRecoveryCandidates", role: "radiogroup", "aria-label": "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F", children: response.candidates.map((candidate) => _jsx(RecoveryCandidateCard, { candidate: candidate, selected: candidate.generationId === selectedId, onSelect: () => { setSelectedId(candidate.generationId); setConfirming(false); setErrorCode(null); } }, candidate.generationId)) }), selected?.previewDocument ? _jsxs("div", { className: "targetRecoveryPreview", children: [_jsx("h4", { children: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438\u0437 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 Generation" }), _jsx(StoryStateDocumentView, { document: selected.previewDocument, characters: characters }), _jsxs("p", { className: "targetStateNotice targetStateNotice-warning", children: [_jsx(AlertTriangle, { size: 16 }), " \u042D\u0442\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F. \u041E\u043D\u043E \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430."] })] }) : null, selected && selected.imageAvailability !== "AVAILABLE" ? _jsxs("p", { className: "targetStateNotice targetStateNotice-warning", children: [_jsx(AlertTriangle, { size: 16 }), " \u0424\u0430\u0439\u043B \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0418\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C, \u043D\u043E \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0433\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F."] }) : null, errorCode ? _jsx(RecoveryError, { code: errorCode, onRefresh: errorCode === "RECOVERY_CONFLICT" ? () => void candidates.refetch() : undefined }) : null, confirming && selected ? _jsxs("div", { className: "targetRecoveryConfirmation", role: "region", "aria-labelledby": "recovery-confirm-title", children: [_jsx("strong", { id: "recovery-confirm-title", children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435" }), _jsxs("span", { children: ["\u041A\u0430\u0434\u0440: ", frameId] }), _jsxs("span", { children: ["\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ", shortId(selected.generationId)] }), _jsx("p", { children: "\u0411\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u043E \u0446\u0435\u043B\u0435\u0432\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 Generations \u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u0442\u0441\u044F. \u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u0430\u0434\u0440\u0430 \u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0430\u044F Generation \u043E\u0441\u0442\u0430\u043D\u0443\u0442\u0441\u044F \u043F\u0440\u0435\u0436\u043D\u0438\u043C\u0438." })] }) : null, _jsxs("div", { className: "targetStateActions", children: [confirming ? _jsx("button", { type: "button", disabled: !selected?.isEligible || recover.isPending || frameStatus === "GENERATING", onClick: () => { if (!selected?.isEligible || postingRef.current)
                                    return; postingRef.current = true; recover.mutate({ frameId, sourceGenerationId: selected.generationId }); }, children: recover.isPending ? "Восстановление..." : _jsxs(_Fragment, { children: [_jsx(Check, { size: 15 }), " \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"] }) }) : _jsx("button", { type: "button", disabled: !selected?.isEligible || frameStatus === "GENERATING", onClick: () => setConfirming(true), children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" }), _jsxs("button", { type: "button", disabled: recover.isPending, onClick: close, children: [_jsx(X, { size: 15 }), " \u041E\u0442\u043C\u0435\u043D\u0430"] })] })] })] });
}
function RecoveryCandidateCard({ candidate, selected, onSelect }) {
    return _jsxs("label", { className: `targetRecoveryCandidate${selected ? " is-selected" : ""}${candidate.isEligible ? "" : " is-disabled"}`, children: [_jsx("input", { type: "radio", name: "recovery-source", value: candidate.generationId, checked: selected, disabled: !candidate.isEligible, onChange: onSelect }), _jsxs("span", { className: "targetRecoveryCandidateBody", children: [_jsxs("span", { className: "targetRecoveryCandidateTitle", children: [_jsxs("strong", { children: [candidate.provider, " \u00B7 ", candidate.model] }), candidate.isRecommended ? _jsx("span", { className: "status status-selected", children: "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F" }) : null, candidate.isSelected ? _jsx("span", { className: "status status-selected", children: "\u0412\u044B\u0431\u0440\u0430\u043D\u0430" }) : null] }), _jsxs("span", { children: [formatDate(candidate.createdAt), " \u00B7 ", candidate.generationType, " \u00B7 ", candidate.generationStatus] }), _jsx("span", { className: candidate.imageAvailability === "AVAILABLE" ? "targetRecoveryAvailable" : "targetRecoveryWarning", children: imageAvailabilityLabels[candidate.imageAvailability] }), _jsxs("small", { children: ["Generation ID: ", candidate.generationId] }), candidate.isEligible ? _jsx("span", { className: "targetRecoveryAvailable", children: "\u041F\u0440\u0438\u0433\u043E\u0434\u043D\u0430 \u0434\u043B\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" }) : _jsx("span", { className: "targetRecoveryReasons", children: candidate.blockingReasons.map((reason) => _jsx("span", { children: blockReasonLabels[reason] }, reason)) })] })] });
}
function RecoveryError({ code, onRefresh }) {
    const message = recoveryErrorMessage(code);
    return _jsxs("div", { className: "targetStateError", role: "alert", children: [_jsx("strong", { children: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E" }), _jsx("span", { children: message }), onRefresh ? _jsxs("button", { type: "button", onClick: onRefresh, children: [_jsx(RotateCcw, { size: 14 }), " \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A"] }) : null] });
}
export function recoveryErrorMessage(code) {
    const labels = {
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
function shortId(value) { return value.length > 12 ? `${value.slice(0, 8)}…` : value; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU"); }
