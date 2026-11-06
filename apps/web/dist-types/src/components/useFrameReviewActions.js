import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.js";
import { useUiStore } from "../state.js";
import { requestConfirmedLock } from "../confirmedLock.js";
import { canSelectFrameGeneration, frameLockReadinessQueryKey, useFrameLockReadiness } from "./FrameLockReadiness.js";
import { frameTargetStoryStateQueryKey } from "./FrameTargetStoryStatePanel.js";
export function sameLockConfirmation(a, b) { return b.status === "READY" && a.frameId === b.frameId && a.selectedGenerationId === b.selectedGenerationId && a.targetRevision === b.targetRevision && a.targetFingerprint === b.targetFingerprint && a.snapshotFingerprint === b.snapshotFingerprint; }
export function useFrameReviewActions(project, frame, dirty) {
    const client = useQueryClient();
    const readiness = useFrameLockReadiness(frame?.id);
    const [confirmation, setConfirmation] = React.useState(null);
    const [notice, setNotice] = React.useState(null);
    const pending = React.useRef(false);
    const mounted = React.useRef(true);
    const current = React.useRef({ frame, dirty });
    current.current = { frame, dirty };
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    React.useEffect(() => { setConfirmation(null); setNotice(null); }, [frame?.id, project.id]);
    const contextCurrent = () => mounted.current && (!useUiStore.getState().selectedProjectId || useUiStore.getState().selectedProjectId === project.id) && current.current.frame?.id === frame?.id;
    const refresh = async () => { await Promise.allSettled([client.invalidateQueries({ queryKey: ["project", project.id] }), client.invalidateQueries({ queryKey: frameLockReadinessQueryKey(frame?.id ?? "none") }), client.invalidateQueries({ queryKey: frameTargetStoryStateQueryKey(frame?.id ?? "none") })]); };
    const confirmedFrame = (response) => {
        client.setQueryData(["project", project.id], previous => previous ? { ...previous, scenes: previous.scenes.map(scene => ({ ...scene, frames: scene.frames.map(item => item.id === response.id ? { ...item, status: response.status, selectedGenerationId: response.selectedGenerationId } : item) })) } : previous);
    };
    const selectMutation = useMutation({
        mutationKey: ["studio-project", "review-selection", project.id, frame?.id], retry: false,
        mutationFn: (id) => api.put(`/api/frames/${frame.id}/selected-generation`, { generationId: id }),
        onSuccess: response => { confirmedFrame(response); if (contextCurrent())
            setNotice("Результат выбран. Кадр на проверке; закрепление выполняется отдельно."); },
        onSettled: async () => { await refresh(); pending.current = false; }
    });
    const lockMutation = useMutation({
        mutationKey: ["studio-project", "review-lock", project.id, frame?.id], retry: false,
        mutationFn: async (ticket) => {
            const latest = await api.get(`/api/frames/${ticket.ready.frameId}/lock-readiness`);
            if (!contextCurrent() || current.current.dirty || current.current.frame?.selectedGenerationId !== ticket.ready.selectedGenerationId || !sameLockConfirmation(ticket.ready, latest))
                throw new ApiError("Выбор или Target изменились после открытия подтверждения. Обновите проверку и подтвердите актуальный результат.", "FRAME_LOCK_READINESS_STALE", 409);
            return requestConfirmedLock(ticket.ready.frameId, { expectedGenerationId: ticket.ready.selectedGenerationId, expectedTargetRevision: ticket.ready.targetRevision });
        },
        onSuccess: response => { confirmedFrame(response); if (contextCurrent())
            setNotice(response.status === "LOCKED" ? "Сервер подтвердил закрепление кадра. Исторический источник доступен для продолжения." : "Ответ получен. Обновите состояние кадра."); },
        onError: async (error) => {
            if (!(error instanceof ApiError) || error.code !== "LOCK_OUTCOME_UNKNOWN" || !contextCurrent())
                return;
            try {
                const latest = await api.get(`/api/projects/${encodeURIComponent(project.id)}/full`);
                if (!contextCurrent())
                    return;
                client.setQueryData(["project", project.id], latest);
                const actual = latest.scenes.flatMap(scene => scene.frames).find(item => item.id === frame?.id);
                setNotice(actual?.status === "LOCKED" ? "После потери ответа сервер подтвердил: кадр закреплён. Повторный Lock не отправлялся." : "Статус кадра запрошен после потери ответа. Проверьте актуальный результат перед новым подтверждением.");
            }
            catch {
                if (contextCurrent())
                    setNotice("Актуальный статус пока неизвестен. Восстановите соединение и обновите кадр перед повторной проверкой.");
            }
        },
        onSettled: async () => { if (contextCurrent())
            setConfirmation(null); await refresh(); pending.current = false; }
    });
    const busy = selectMutation.isPending || lockMutation.isPending;
    const select = (id) => {
        const value = current.current.frame;
        const generation = value?.generations.find(item => item.id === id);
        if (!contextCurrent() || pending.current || current.current.dirty || !value || !generation || value.selectedGenerationId === id || !canSelectFrameGeneration(value.status, generation.status))
            return;
        pending.current = true;
        setNotice(null);
        lockMutation.reset();
        selectMutation.mutate(id);
    };
    const canLock = Boolean(frame && !dirty && !busy && !readiness.isFetching && !readiness.isError && frame.status !== "LOCKED" && frame.status !== "GENERATING" && readiness.data?.status === "READY" && readiness.data.frameId === frame.id && readiness.data.selectedGenerationId === frame.selectedGenerationId);
    const requestLock = () => {
        if (!contextCurrent() || pending.current || current.current.dirty || !canLock || !frame || readiness.data?.status !== "READY")
            return;
        const generation = frame.generations.find(item => item.id === frame.selectedGenerationId);
        if (!generation || generation.status !== "SUCCESS")
            return;
        lockMutation.reset();
        selectMutation.reset();
        setConfirmation({ frameCode: frame.frameCode, frameNumber: frame.sequence, generationStatus: generation.status, ready: readiness.data });
    };
    const confirmLock = () => { if (!confirmation || pending.current || !contextCurrent() || current.current.dirty)
        return; pending.current = true; setNotice(null); lockMutation.mutate(confirmation); };
    return { readiness, busy, select, canLock, requestLock, confirmation, confirmLock, cancelLock: () => { if (!pending.current)
            setConfirmation(null); }, refresh, notice, error: lockMutation.error ?? selectMutation.error, selectMutation, lockMutation };
}
