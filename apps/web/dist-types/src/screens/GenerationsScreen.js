import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useFrameReviewActions } from "../components/useFrameReviewActions.js";
import { LockConfirmationDialog } from "../components/LockConfirmationDialog.js";
import { ReviewActionFeedback } from "../components/FrameReviewWorkspace.js";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Upload } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import { projectFileUrl, readFileAsDataUrl, splitLines } from "../utils.js";
import { StatusBadge } from "../components/References.js";
import { canSelectFrameGeneration, FrameLockReadinessNotice, frameLockReadinessQueryKey } from "../components/FrameLockReadiness.js";
export function ReviewPanel({ project, target }) {
    return _jsx(ReviewPanelSession, { project: project, target: target }, project.id + ":" + (target?.frame.id ?? "none"));
}
function ReviewPanelSession({ project, target }) {
    const dirty = useUiStore(state => state.frameDraftDirty);
    const actions = useFrameReviewActions(project, target?.frame, dirty);
    const readiness = actions.readiness;
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h2", { children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430" }), target ? _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: [target.frame.frameCode, " \u00B7 ", target.generation.id.slice(0, 8), " \u00B7 ", target.generation.provider] }), target.generation.outputFilePath ? _jsx("img", { className: "reviewImage", src: projectFileUrl(project, target.generation.outputFilePath), alt: `Результат ${target.frame.frameCode}` }) : _jsx("div", { className: "imagePlaceholder", children: "\u041D\u0435\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx("p", { className: "muted", children: target.isSelected ? target.frame.status === "LOCKED" ? "Выбран и закреплён" : "Выбран для закрепления" : "Сначала выберите этот результат в списке кандидатов." })] }) : _jsx("div", { className: "imagePlaceholder", children: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438." }), target ? _jsx(FrameLockReadinessNotice, { readiness: readiness.data, loading: readiness.isPending }) : null, _jsxs("button", { disabled: !target?.isSelected || !actions.canLock, onClick: actions.requestLock, children: [_jsx(Check, { size: 16 }), " \u0423\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u0437\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0434\u0440"] }), _jsx(ReviewActionFeedback, { actions: actions }), _jsx(LockConfirmationDialog, { confirmation: actions.confirmation, pending: actions.busy, onConfirm: actions.confirmLock, onCancel: actions.cancelLock })] }));
}
export function GenerationsScreen({ project }) {
    const queryClient = useQueryClient();
    const openGeneration = useUiStore((state) => state.openGeneration);
    const reviewFrameId = useUiStore((state) => state.reviewFrameId);
    const reviewGenerationId = useUiStore((state) => state.reviewGenerationId);
    const repairRequest = useUiStore((state) => state.repairRequest);
    const clearRepairRequest = useUiStore((state) => state.clearRepairRequest);
    const frames = project.scenes.flatMap((scene) => scene.frames.map((frame) => ({ ...frame, sceneName: scene.name })));
    const [repairSource, setRepairSource] = React.useState(null);
    React.useEffect(() => {
        if (repairRequest) {
            setRepairSource(repairRequest);
            clearRepairRequest();
        }
    }, [repairRequest, clearRepairRequest]);
    const [repairChanges, setRepairChanges] = React.useState("");
    const [repairForbidden, setRepairForbidden] = React.useState("");
    const [repairExportId, setRepairExportId] = React.useState("");
    const repairInput = React.useRef(null);
    const repairFrame = frames.find((item) => item.id === repairSource?.frameId);
    const repairGeneration = repairFrame?.generations.find((item) => item.id === repairSource?.generationId);
    const repairExports = useQuery({
        queryKey: ["chatgpt-exports", repairSource?.frameId],
        queryFn: () => api.get(`/api/frames/${repairSource?.frameId}/exports/chatgpt`),
        enabled: Boolean(repairSource)
    });
    const matchingRepairExports = repairExports.data?.filter((item) => item.operation === "REPAIR" && item.repairSourceGenerationId === repairSource?.generationId) ?? [];
    const exportRepair = useMutation({
        mutationFn: async () => {
            if (!repairSource)
                throw new Error("Выберите исходную генерацию.");
            const response = await fetch(`/api/frames/${repairSource.frameId}/export/chatgpt/repair`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceGenerationId: repairSource.generationId, changes: splitLines(repairChanges), forbidden: splitLines(repairForbidden) })
            });
            if (!response.ok) {
                const body = await response.json();
                throw new Error(body.error ?? "Не удалось экспортировать repair.");
            }
            const blob = await response.blob();
            const name = /filename="(?<name>[^"]+)"/u.exec(response.headers.get("Content-Disposition") ?? "")?.groups?.name ?? "Bearridge_REPAIR_CHATGPT.zip";
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            return response.headers.get("X-Bearridge-Export-Id") ?? "";
        },
        onSuccess: (exportId) => {
            setRepairExportId(exportId);
            void queryClient.invalidateQueries({ queryKey: ["chatgpt-exports", repairSource?.frameId] });
        }
    });
    const importRepair = useMutation({
        mutationFn: async (file) => {
            if (!repairSource || !repairExportId)
                throw new Error("Выберите repair export.");
            return api.post(`/api/frames/${repairSource.frameId}/import/chatgpt`, {
                exportId: repairExportId,
                fileName: file.name,
                dataUrl: await readFileAsDataUrl(file)
            });
        },
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    const selectGeneration = useMutation({
        mutationFn: ({ frameId, generationId }) => api.put(`/api/frames/${frameId}/selected-generation`, { generationId }),
        onSuccess: (_result, variables) => {
            openGeneration(variables.frameId, variables.generationId);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(variables.frameId) });
        }
    });
    return (_jsxs("section", { className: "referenceList", children: [_jsx("h2", { children: "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438" }), frames.map((frame) => (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: frame.frameCode }), _jsx("span", { className: "muted", children: frame.sceneName })] }), frame.generations.length ? frame.generations.map((generation) => {
                        const selected = generation.id === frame.selectedGenerationId;
                        const locked = selected && frame.status === "LOCKED";
                        const opened = reviewFrameId === frame.id && reviewGenerationId === generation.id;
                        return _jsxs("div", { className: `versionRow generationCandidate${selected ? " generationCandidateSelected" : ""}${opened ? " generationCandidateOpen" : ""}`, children: [_jsx("input", { "aria-label": `Select generation ${generation.id}`, checked: selected, disabled: !canSelectFrameGeneration(frame.status, generation.status) || selectGeneration.isPending, name: `selected-generation-${frame.id}`, onChange: () => selectGeneration.mutate({ frameId: frame.id, generationId: generation.id }), type: "radio" }), _jsxs("div", { children: [_jsx("strong", { children: generation.status }), selected ? _jsx("span", { className: "status status-selected", children: "SELECTED" }) : null, locked ? _jsx(StatusBadge, { status: "LOCKED" }) : null, _jsxs("small", { children: [generation.model, " / ", generation.provider] }), _jsxs("small", { children: [generation.generationType, " / ", generation.id.slice(0, 8), " / ", new Date(generation.createdAt).toLocaleString()] }), _jsxs("small", { children: [generation.targetWidth && generation.targetHeight ? `${generation.targetWidth} x ${generation.targetHeight}` : "без target geometry", " / crop ", generation.requiresCrop ? "да" : "нет"] })] }), _jsxs("div", { className: "miniActions", children: [generation.outputFilePath ? _jsx("img", { src: projectFileUrl(project, generation.outputFilePath) }) : null, _jsx("button", { type: "button", "aria-pressed": opened, onClick: () => openGeneration(frame.id, generation.id), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" }), generation.status === "SUCCESS" ? _jsx("button", { type: "button", onClick: () => {
                                                openGeneration(frame.id, generation.id);
                                                setRepairSource({ frameId: frame.id, generationId: generation.id });
                                                setRepairChanges("");
                                                setRepairForbidden("");
                                                setRepairExportId("");
                                            }, children: "Repair Generation" }) : null] })] }, generation.id);
                    }) : _jsx("p", { className: "muted", children: "\u0414\u043B\u044F \u043A\u0430\u0434\u0440\u0430 \u0435\u0449\u0451 \u043D\u0435\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0439." })] }, frame.id))), repairSource && repairGeneration ? _jsxs("section", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("h3", { children: ["Repair Generation \u00B7 ", repairFrame?.frameCode, " \u00B7 ", repairGeneration.id.slice(0, 8)] }), _jsx("button", { type: "button", onClick: () => setRepairSource(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }), repairGeneration.outputFilePath ? _jsx("img", { className: "reviewImage", src: projectFileUrl(project, repairGeneration.outputFilePath), alt: "\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F Generation" }) : null, _jsxs("label", { children: ["Change Only", _jsx("textarea", { value: repairChanges, onChange: (event) => setRepairChanges(event.target.value), placeholder: "\u041E\u0434\u043D\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" })] }), _jsxs("label", { children: ["Forbidden", _jsx("textarea", { value: repairForbidden, onChange: (event) => setRepairForbidden(event.target.value), placeholder: "\u041E\u0434\u043D\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" })] }), _jsxs("button", { type: "button", disabled: !splitLines(repairChanges).length || exportRepair.isPending, onClick: () => exportRepair.mutate(), children: [_jsx(Download, { size: 16 }), " Export Repair for ChatGPT"] }), exportRepair.error ? _jsx("p", { className: "warning", children: exportRepair.error.message }) : null, matchingRepairExports.length ? _jsxs("label", { children: ["Repair export", _jsxs("select", { value: repairExportId, onChange: (event) => setRepairExportId(event.target.value), children: [_jsx("option", { value: "", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 export" }), matchingRepairExports.map((item) => _jsxs("option", { value: item.exportId, children: [new Date(item.createdAt).toLocaleString(), " \u00B7 ", item.exportId.slice(0, 8)] }, item.exportId))] })] }) : null, _jsx("input", { ref: repairInput, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => { const file = event.target.files?.[0]; if (file)
                            importRepair.mutate(file); event.target.value = ""; } }), _jsxs("button", { type: "button", disabled: !repairExportId || importRepair.isPending, onClick: () => repairInput.current?.click(), children: [_jsx(Upload, { size: 16 }), " Import repaired image"] }), importRepair.error ? _jsx("p", { className: "warning", children: importRepair.error.message }) : null] }) : null] }));
}
