import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Brush, Check, Download, ImagePlus, Loader2, Map, Save, Settings, Upload, User, Wrench, X } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import { continuityCategories } from "../model.js";
import { emptyState, parseRatio, projectFileUrl, readFileAsDataUrl, referenceKindLabel, splitLines, splitList, toPositiveNumber } from "../utils.js";
import { emptyFrameDraft, frameToDraft } from "./AssetLibrary.js";
import { createFrameForScene } from "../frameCreation.js";
import { orderedSceneFrames, storyboardImageCandidates } from "../storyboard.js";
import { continuityContractSummary, initialFrameSections, openedFrameCandidate, selectedChatGPTReceipt, toggleFrameSection } from "../frameWorkspaceUi.js";
import { FrameTargetStoryStatePanel } from "../components/FrameTargetStoryStatePanel.js";
import { FrameLockReadinessNotice, frameLockReadinessQueryKey, useFrameLockReadiness } from "../components/FrameLockReadiness.js";
export function FrameEditor({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const selectedFrameId = useUiStore((state) => state.selectedFrameId);
    const selectScene = useUiStore((state) => state.selectScene);
    const selectFrame = useUiStore((state) => state.selectFrame);
    const returnToStoryboard = useUiStore((state) => state.returnToStoryboard);
    const setFrameDraftDirty = useUiStore((state) => state.setFrameDraftDirty);
    const openRepair = useUiStore((state) => state.openRepair);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
    const sceneFrames = React.useMemo(() => orderedSceneFrames(scene?.frames ?? []), [scene?.frames]);
    const frame = sceneFrames.find((item) => item.id === selectedFrameId) ?? sceneFrames[0];
    const [action, setAction] = React.useState("");
    const [frameDraft, setFrameDraft] = React.useState(() => frame ? frameToDraft(frame) : emptyFrameDraft());
    const [targetWidth, setTargetWidth] = React.useState("1200");
    const [targetHeight, setTargetHeight] = React.useState("675");
    const inheritedLocationId = frameDraft.locationId || scene?.locationId || "";
    const effectiveLocation = project.locations.find((location) => location.id === inheritedLocationId);
    const selectedLocation = project.locations.find((location) => location.id === inheritedLocationId) ?? project.locations[0];
    const [selectedExportId, setSelectedExportId] = React.useState("");
    const [lastImport, setLastImport] = React.useState(null);
    const [openedCandidateId, setOpenedCandidateId] = React.useState(null);
    const [imageView, setImageView] = React.useState("result");
    const [openSections, setOpenSections] = React.useState(() => initialFrameSections(frame?.generationStrategy ?? "NEW_COMPOSITION"));
    const toggleSection = (section) => setOpenSections((current) => toggleFrameSection(current, section));
    const importInput = React.useRef(null);
    const preview = useQuery({
        queryKey: ["preview", frame?.id],
        queryFn: () => api.get(`/api/frames/${frame?.id}/preview`),
        enabled: Boolean(frame?.id)
    });
    const blockingWarnings = preview.data?.warnings.filter((warning) => warning.severity === "blocking") ?? [];
    const chatGPTExports = useQuery({
        queryKey: ["chatgpt-exports", frame?.id],
        queryFn: () => api.get(`/api/frames/${frame?.id}/exports/chatgpt`),
        enabled: Boolean(frame?.id)
    });
    const newFrameAction = action.trim();
    const hasFrameChanges = frame ? JSON.stringify(frameDraft) !== JSON.stringify(frameToDraft(frame)) : false;
    const frameIndex = sceneFrames.findIndex((item) => item.id === frame?.id);
    const candidates = frame ? storyboardImageCandidates(frame) : [];
    const openedCandidate = openedFrameCandidate(candidates, openedCandidateId);
    const previousFrame = scene?.frames.find((item) => item.id === frame?.previousFrameId);
    const previousImage = previousFrame?.status === "LOCKED" ? previousFrame.generations.find((item) => item.id === previousFrame.selectedGenerationId && item.status === "SUCCESS") : undefined;
    const base = frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? preview.data?.context.previousLockedFrame ?? (previousImage && previousFrame ? { id: previousFrame.id, frameCode: previousFrame.frameCode, generationId: previousImage.id, outputFilePath: previousImage.outputFilePath } : undefined) : undefined;
    const selectedExport = selectedChatGPTReceipt(chatGPTExports.data, selectedExportId);
    const showingBase = imageView === "base" && Boolean(base);
    const selectedCandidate = openedCandidate?.id === frame?.selectedGenerationId;
    const continuitySummary = continuityContractSummary(frameDraft.continuityEditContract, preview.data?.detectedContinuityChanges ?? []);
    const lockReadiness = useFrameLockReadiness(frame?.id);
    const selectGeneration = useMutation({
        mutationFn: (generationId) => api.put(`/api/frames/${frame?.id}/selected-generation`, { generationId }),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", project.id] }); if (frame)
            void queryClient.invalidateQueries({ queryKey: frameLockReadinessQueryKey(frame.id) }); }
    });
    const lockFrame = useMutation({
        mutationFn: () => api.post(`/api/frames/${frame?.id}/lock`, {}),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["project", project.id] }); if (frame)
            void lockReadiness.refetch(); }
    });
    const createFrame = useMutation({
        mutationFn: () => {
            if (!scene)
                throw new Error("Выберите сцену для создания кадра.");
            return createFrameForScene(scene, {
                action: newFrameAction,
                locationId: frameDraft.locationId || undefined,
                locationAngleId: frameDraft.locationAngleId || undefined,
                styleProfileId: frameDraft.styleProfileId || undefined,
                targetWidth: toPositiveNumber(targetWidth),
                targetHeight: toPositiveNumber(targetHeight)
            });
        },
        onSuccess: (created) => {
            selectFrame(created.frame.id);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
        }
    });
    const saveFrame = useMutation({
        mutationFn: () => {
            if (!frame)
                throw new Error("Выберите кадр.");
            const original = frameToDraft(frame);
            const castChanged = frameDraft.characterCastMode !== original.characterCastMode
                || JSON.stringify(frameDraft.characterIds) !== JSON.stringify(original.characterIds)
                || JSON.stringify(frameDraft.additionalCharacterReferenceIds) !== JSON.stringify(original.additionalCharacterReferenceIds);
            const { characterCastMode, characterIds, ...rest } = frameDraft;
            return api.put(`/api/frames/${frame.id}`, {
                ...rest,
                ...(castChanged ? {
                    characterCastMode: characterCastMode === "INHERIT" ? "INHERIT" : "EXPLICIT",
                    ...(characterCastMode === "INHERIT" ? {} : { characterIds }),
                    expectedCharacterCastRevision: frame.characterCastRevision ?? 0
                } : {}),
                targetWidth: toPositiveNumber(frameDraft.targetWidth),
                targetHeight: toPositiveNumber(frameDraft.targetHeight)
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
        }
    });
    const exportForChatGPT = useMutation({
        mutationFn: async () => {
            if (!frame)
                throw new Error("Выберите кадр для экспорта.");
            const response = await fetch(`/api/frames/${frame.id}/export/chatgpt`, { method: "POST" });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error ?? "Не удалось подготовить экспорт для ChatGPT.");
            }
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") ?? "";
            const fileName = /filename="(?<name>[^"]+)"/u.exec(disposition)?.groups?.name ?? `${frame.frameCode}_CHATGPT.zip`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            return response.headers.get("X-Bearridge-Export-Id") ?? "";
        },
        onSuccess: (exportId) => {
            if (exportId)
                setSelectedExportId(exportId);
            void queryClient.invalidateQueries({ queryKey: ["chatgpt-exports", frame?.id] });
        }
    });
    const importChatGPT = useMutation({
        mutationFn: async (file) => {
            if (!frame || !selectedExport)
                throw new Error("Выберите ChatGPT export для привязки результата.");
            const generation = await api.post(`/api/frames/${frame.id}/import/chatgpt`, {
                exportId: selectedExport.exportId,
                fileName: file.name,
                dataUrl: await readFileAsDataUrl(file)
            });
            return { frameId: frame.id, exportId: selectedExport.exportId, generation };
        },
        onSuccess: (result) => {
            setLastImport(result);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
            void queryClient.invalidateQueries({ queryKey: ["preview", frame?.id] });
        }
    });
    React.useEffect(() => {
        if (scene)
            selectScene(scene.id);
        if (frame)
            selectFrame(frame.id);
    }, [scene?.id, frame?.id]);
    React.useEffect(() => {
        setFrameDraft(frame ? frameToDraft(frame) : emptyFrameDraft());
        setOpenedCandidateId(null);
        setImageView("result");
    }, [frame?.id, project.id]);
    React.useEffect(() => {
        setOpenSections(initialFrameSections(frameDraft.generationStrategy));
    }, [frame?.id, frameDraft.generationStrategy]);
    React.useEffect(() => {
        setFrameDraftDirty(hasFrameChanges);
    }, [hasFrameChanges, setFrameDraftDirty]);
    React.useEffect(() => {
        const warn = (event) => {
            if (!hasFrameChanges)
                return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [hasFrameChanges]);
    React.useEffect(() => {
        setSelectedExportId(chatGPTExports.data?.[0]?.exportId ?? "");
    }, [frame?.id, chatGPTExports.data?.[0]?.exportId]);
    React.useEffect(() => {
        if (frameDraft.locationAngleId && selectedLocation && !selectedLocation.angles.some((angle) => angle.id === frameDraft.locationAngleId)) {
            setFrameDraft((current) => ({ ...current, locationAngleId: null }));
        }
    }, [selectedLocation?.id, frameDraft.locationAngleId]);
    return (_jsxs("section", { className: "frameEditor", children: [_jsxs("div", { className: "toolbar", children: [_jsxs("button", { type: "button", onClick: returnToStoryboard, children: [_jsx(ArrowLeft, { size: 16 }), " \u0420\u0430\u0441\u043A\u0430\u0434\u0440\u043E\u0432\u043A\u0430"] }), _jsxs("div", { className: "frameHeading", children: [_jsxs("h2", { children: [scene ? scene.sequence > 0 ? `Сцена ${scene.sequence}` : scene.name : "Сцена не выбрана", " \u00B7 ", frame ? `Кадр ${frameIndex + 1} из ${sceneFrames.length}` : "Кадров нет"] }), frame ? _jsx("small", { children: frame.frameCode }) : null] }), hasFrameChanges ? _jsx("span", { className: "status status-unsaved", children: "\u041D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E" }) : null, _jsx("button", { type: "button", title: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u0430\u0434\u0440", "aria-label": "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u0430\u0434\u0440", disabled: frameIndex <= 0, onClick: () => { const previous = sceneFrames[frameIndex - 1]; if (previous)
                            selectFrame(previous.id); }, children: _jsx(ArrowLeft, { size: 16 }) }), _jsx("button", { type: "button", title: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043A\u0430\u0434\u0440", "aria-label": "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043A\u0430\u0434\u0440", disabled: !scene || frameIndex < 0 || frameIndex >= sceneFrames.length - 1, onClick: () => { const next = sceneFrames[frameIndex + 1]; if (next)
                            selectFrame(next.id); }, children: _jsx(ArrowRight, { size: 16 }) }), _jsxs("button", { disabled: !frame || !hasFrameChanges || saveFrame.isPending, onClick: () => saveFrame.mutate(), children: [saveFrame.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u0430\u0434\u0440"] }), _jsxs("button", { disabled: !frame || hasFrameChanges || exportForChatGPT.isPending || blockingWarnings.length > 0, onClick: () => exportForChatGPT.mutate(), children: [exportForChatGPT.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Download, { size: 16 }), " Export for ChatGPT"] }), _jsx("input", { ref: importInput, hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => { const file = event.target.files?.[0]; if (file)
                            importChatGPT.mutate(file); event.target.value = ""; } }), _jsxs("div", { className: "frameImportAction", children: [_jsxs("button", { disabled: !frame || !selectedExport || importChatGPT.isPending, title: selectedExport ? `Receipt ${selectedExport.exportId}` : "Сначала выберите export receipt", onClick: () => importInput.current?.click(), children: [importChatGPT.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Upload, { size: 16 }), " Import ChatGPT Result"] }), _jsx("small", { children: selectedExport ? `Receipt ${selectedExport.exportId.slice(0, 8)} · ${new Date(selectedExport.createdAt).toLocaleString()}` : "Нет выбранного receipt" })] })] }), exportForChatGPT.error ? _jsx("p", { className: "warning", children: exportForChatGPT.error.message }) : null, importChatGPT.error ? _jsx("p", { className: "warning", children: importChatGPT.error.message }) : null, _jsxs("div", { className: "editorGrid", children: [_jsxs("section", { className: "frameVisual", "aria-label": "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u0430\u0434\u0440\u0430", children: [base ? _jsxs("div", { className: "frameViewSwitch", role: "group", "aria-label": "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435", children: [_jsx("button", { type: "button", "aria-pressed": imageView === "result", onClick: () => setImageView("result"), children: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442" }), _jsxs("button", { type: "button", "aria-pressed": imageView === "base", onClick: () => setImageView("base"), children: ["BASE \u00B7 ", base.frameCode] })] }) : null, _jsx("div", { className: "frameImageStage", children: imageView === "base" && base ? _jsx("img", { src: projectFileUrl(project, base.outputFilePath), alt: `BASE ${base.frameCode}` }) : openedCandidate?.outputFilePath ? _jsx("img", { src: projectFileUrl(project, openedCandidate.outputFilePath), alt: `Результат ${frame?.frameCode}` }) : _jsx("div", { className: "imagePlaceholder", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430" }) }), _jsxs("section", { className: "frameReview", "aria-label": "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430", children: [_jsxs("div", { className: "frameReviewStatus", children: [_jsxs("span", { className: "reviewStatusItem", children: ["\u041A\u0430\u0434\u0440 ", _jsx("strong", { children: frame?.status ?? "нет" })] }), _jsxs("span", { className: "reviewStatusItem", children: ["OPENED ", _jsx("strong", { children: showingBase && base ? `BASE · ${base.frameCode}` : openedCandidate ? `${openedCandidate.id.slice(0, 8)} · ${openedCandidate.status}` : "нет Generation" })] }), !showingBase && selectedCandidate ? _jsx("span", { className: "status status-selected", children: "SELECTED" }) : null, !showingBase && selectedCandidate && frame?.status === "LOCKED" ? _jsx("span", { className: "status status-locked", children: "LOCKED" }) : null] }), candidates.length > 1 ? _jsxs("label", { children: ["\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430", _jsx("select", { "aria-label": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430", value: openedCandidate?.id ?? "", onChange: (event) => { setOpenedCandidateId(event.target.value); setImageView("result"); }, children: candidates.map((candidate) => _jsxs("option", { value: candidate.id, children: [candidate.id.slice(0, 8), " \u00B7 ", candidate.provider, " \u00B7 ", candidate.id === frame?.selectedGenerationId ? "SELECTED" : "кандидат"] }, candidate.id)) })] }) : null, openedCandidate ? _jsxs("div", { className: "frameReviewActions", children: [_jsxs("button", { type: "button", title: showingBase ? "Переключитесь на результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : selectedCandidate ? "Этот результат уже выбран" : "Выбрать открытый результат", disabled: showingBase || selectedCandidate || selectGeneration.isPending || frame?.status === "LOCKED" || frame?.status === "GENERATING", onClick: () => selectGeneration.mutate(openedCandidate.id), children: [_jsx(Check, { size: 16 }), " \u0412\u044B\u0431\u0440\u0430\u0442\u044C"] }), _jsxs("button", { type: "button", title: showingBase ? "Переключитесь на результат" : !selectedCandidate ? "Сначала выберите открытый результат" : frame?.status === "LOCKED" ? "Кадр уже закреплён" : "Закрепить выбранный результат", disabled: showingBase || !selectedCandidate || frame?.status === "LOCKED" || lockReadiness.data?.status !== "READY" || lockFrame.isPending, onClick: () => lockFrame.mutate(), children: [_jsx(Check, { size: 16 }), " \u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C"] }), _jsxs("button", { type: "button", title: showingBase ? "Переключитесь на результат" : "Открыть Repair для этого результата", disabled: showingBase, onClick: () => { if (frame)
                                                    openRepair(frame.id, openedCandidate.id); }, children: [_jsx(Wrench, { size: 16 }), " Repair"] })] }) : null, selectedCandidate && !showingBase ? _jsx(FrameLockReadinessNotice, { readiness: lockReadiness.data, loading: lockReadiness.isPending }) : null, openedCandidate && !showingBase && !selectedCandidate ? _jsx("small", { className: "muted", children: "\u041E\u0442\u043A\u0440\u044B\u0442 \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430. \u0414\u043B\u044F \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u044F \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0435\u0433\u043E." }) : null, !openedCandidate && !showingBase ? _jsx("small", { className: "muted", children: "\u0423 \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438." }) : null, _jsxs("details", { className: "reviewDetails", children: [_jsx("summary", { children: "\u0414\u0435\u0442\u0430\u043B\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430" }), _jsxs("div", { className: "reviewMetadata", children: [showingBase && base ? _jsxs(_Fragment, { children: [_jsx("span", { children: "\u0422\u0438\u043F: BASE" }), _jsxs("span", { children: ["\u041A\u0430\u0434\u0440: ", base.frameCode] }), _jsxs("span", { children: ["Generation ID: ", base.generationId] })] }) : openedCandidate ? _jsxs(_Fragment, { children: [_jsxs("span", { children: ["Generation ID: ", openedCandidate.id] }), _jsxs("span", { children: ["Provider: ", openedCandidate.provider] }), _jsxs("span", { children: ["\u0422\u0438\u043F: ", openedCandidate.generationType] }), _jsxs("span", { children: ["\u0421\u043E\u0437\u0434\u0430\u043D\u043E: ", new Date(openedCandidate.createdAt).toLocaleString()] })] }) : _jsx("span", { children: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F Generation." }), _jsxs("span", { children: ["Selected Generation ID: ", frame?.selectedGenerationId ?? "нет"] })] })] })] }), selectGeneration.error ? _jsx("p", { className: "warning", children: selectGeneration.error.message }) : null, lockFrame.error ? _jsx("p", { className: "warning", children: lockFrame.error.message }) : null, frame && chatGPTExports.data?.length ? _jsxs("details", { className: "exportHistory", children: [_jsxs("summary", { children: ["\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430 \u00B7 ", chatGPTExports.data.length] }), _jsxs("label", { children: ["Receipt \u0434\u043B\u044F Import", _jsx("select", { "aria-label": "ChatGPT export receipt", value: selectedExportId, onChange: (event) => setSelectedExportId(event.target.value), children: chatGPTExports.data.map((item) => _jsxs("option", { value: item.exportId, children: [new Date(item.createdAt).toLocaleString(), " \u00B7 ", item.strategy, item.operation === "REPAIR" ? " · REPAIR" : "", item.baseFrameCode ? ` · base ${item.baseFrameCode}` : "", " \u00B7 ", item.exportId.slice(0, 8)] }, item.exportId)) })] })] }) : null, lastImport && frame && lastImport.frameId === frame.id ? _jsxs("details", { className: "importReceipt", children: [_jsxs("summary", { children: ["\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u00B7 ", lastImport.generation.status] }), _jsxs("div", { className: "fieldStack", children: [_jsx("small", { children: "Source: ChatGPT manual import" }), _jsxs("small", { children: ["Strategy: ", frame.generationStrategy] }), _jsxs("small", { children: ["Export: ", lastImport.exportId] }), lastImport.generation.outputFilePath ? _jsx("img", { className: "reviewImage", src: projectFileUrl(project, lastImport.generation.outputFilePath), alt: "\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442" }) : null] })] }) : null, _jsxs("details", { className: "currentStoryState", children: [_jsx("summary", { children: "\u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B" }), _jsx("p", { className: "muted", children: "\u041C\u043E\u0436\u0435\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043D\u0430 \u043C\u043E\u043C\u0435\u043D\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430." }), _jsx(StoryStateEditor, { project: project })] })] }), _jsxs("aside", { className: "frameInspector", "aria-label": "\u0420\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u043A\u0430\u0434\u0440\u0430", children: [_jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u0421\u0446\u0435\u043D\u0430", _jsx("select", { value: scene?.id ?? "", onChange: (event) => selectScene(event.target.value), children: project.scenes.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041A\u0430\u0434\u0440", _jsxs("select", { value: frame?.id ?? "", onChange: (event) => selectFrame(event.target.value), children: [_jsx("option", { value: "", disabled: true, children: sceneFrames.length ? "Выберите кадр" : "Кадров пока нет" }), sceneFrames.map((item) => _jsx("option", { value: item.id, children: item.frameCode }, item.id))] })] }), _jsxs("button", { className: "frameNewButton", disabled: !scene || hasFrameChanges || createFrame.isPending, onClick: () => createFrame.mutate(), children: [createFrame.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(ImagePlus, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043A\u0430\u0434\u0440"] }), _jsxs("label", { children: ["\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438", _jsxs("select", { disabled: !frame, value: frame ? frameDraft.generationStrategy : "NEW_COMPOSITION", onChange: (event) => setFrameDraft({ ...frameDraft, generationStrategy: event.target.value }), children: [_jsx("option", { value: "NEW_COMPOSITION", children: "\u041D\u043E\u0432\u0430\u044F \u043A\u043E\u043C\u043F\u043E\u0437\u0438\u0446\u0438\u044F" }), _jsx("option", { value: "CONTINUE_PREVIOUS_FRAME", children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u0430\u0434\u0440" })] }), _jsx("small", { children: frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" ? "Использовать предыдущий закреплённый кадр как визуальную основу и применить контролируемое изменение." : "Создать новую композицию по каноническим референсам." })] }), _jsxs("details", { className: "frameFieldGroup", open: openSections.main, children: [_jsx("summary", { onClick: (event) => { event.preventDefault(); toggleSection("main"); }, children: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0435" }), _jsxs("div", { className: "frameSectionBody", children: [_jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u0434\u0440\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.description : "", onChange: (event) => setFrameDraft({ ...frameDraft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435", _jsx("textarea", { value: frame ? frameDraft.action : action, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, action: event.target.value }) : setAction(event.target.value) })] })] })] }), _jsxs("details", { className: "frameFieldGroup", open: openSections.camera, children: [_jsx("summary", { onClick: (event) => { event.preventDefault(); toggleSection("camera"); }, children: "\u041A\u0430\u043C\u0435\u0440\u0430 \u0438 \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430" }), _jsxs("div", { className: "frameSectionBody", children: [_jsxs("label", { children: ["\u041A\u0430\u043C\u0435\u0440\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.camera : "", onChange: (event) => setFrameDraft({ ...frameDraft, camera: event.target.value }) })] }), _jsxs("label", { children: ["\u041A\u043E\u043C\u043F\u043E\u0437\u0438\u0446\u0438\u044F", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.composition : "", onChange: (event) => setFrameDraft({ ...frameDraft, composition: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.lighting : "", onChange: (event) => setFrameDraft({ ...frameDraft, lighting: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u044B\u0440\u0430\u0436\u0435\u043D\u0438\u0435 / \u043F\u043E\u0437\u0430", _jsx("textarea", { disabled: !frame, value: frame ? frameDraft.expressionNotes : "", onChange: (event) => setFrameDraft({ ...frameDraft, expressionNotes: event.target.value }) })] })] })] }), frameDraft.generationStrategy === "CONTINUE_PREVIOUS_FRAME" && frame ? _jsxs("details", { className: "frameFieldGroup continuityGroup", open: openSections.continuity, children: [_jsxs("summary", { onClick: (event) => { event.preventDefault(); toggleSection("continuity"); }, children: ["\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F ", _jsxs("small", { children: [continuitySummary.detectedCount, " \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E \u00B7 ", continuitySummary.allowedCategoryCount, " \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u00B7 CHANGE ONLY ", continuitySummary.hasExplicitChanges ? "задан" : "не задан", " \u00B7 FORBIDDEN ", continuitySummary.hasForbiddenChanges ? "задан" : "не задан"] })] }), _jsxs("div", { className: "frameSectionBody", children: [_jsxs("label", { children: ["Continuity notes", _jsx("textarea", { value: frameDraft.continuityNotes, onChange: (event) => setFrameDraft({ ...frameDraft, continuityNotes: event.target.value }) })] }), _jsx(ContinuityEditContractEditor, { contract: frameDraft.continuityEditContract, detected: preview.data?.detectedContinuityChanges ?? [], onChange: (continuityEditContract) => setFrameDraft({ ...frameDraft, continuityEditContract }) })] })] }) : null, _jsxs("details", { className: "frameFieldGroup frameContextGroup", children: [_jsxs("summary", { children: ["\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0438 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B ", _jsxs("small", { children: [frameDraft.characterIds.length, " \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u00B7 ", effectiveLocation?.name ?? "без локации", " \u00B7 ", effectiveLocation?.angles.find((angle) => angle.id === frameDraft.locationAngleId)?.name ?? "без ракурса", " \u00B7 ", project.styleProfiles.find((style) => style.id === (frameDraft.styleProfileId || scene?.styleProfileId))?.name ?? "без стиля"] })] }), _jsxs("div", { className: "frameSectionBody", children: [_jsx("div", { className: "frameContextFields", children: _jsxs("div", { className: "fieldStack", children: [_jsx("label", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), _jsxs("div", { className: "segmentedControl", role: "radiogroup", "aria-label": "\u0420\u0435\u0436\u0438\u043C \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439", children: [_jsxs("label", { children: [_jsx("input", { type: "radio", name: "character-cast-mode", checked: frameDraft.characterCastMode === "INHERIT", disabled: !frame || frame.status === "GENERATING" || frame.status === "LOCKED", onChange: () => setFrameDraft({ ...frameDraft, characterCastMode: "INHERIT" }) }), " \u041D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0441\u0442\u0430\u0432"] }), _jsxs("label", { children: [_jsx("input", { type: "radio", name: "character-cast-mode", checked: frameDraft.characterCastMode === "EXPLICIT", disabled: !frame || frame.status === "GENERATING" || frame.status === "LOCKED", onChange: () => frame && setFrameDraft({ ...frameDraft, characterCastMode: "EXPLICIT", characterIds: frame.effectiveCharacterIds ?? frame.characterIds }) }), " \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E"] })] }), _jsx("small", { children: frameDraft.characterCastMode === "LEGACY" ? "Источник состава неизвестен (legacy fallback)." : frameDraft.characterCastMode === "INHERIT" ? (frame?.characterCastSource === "INHERITED_PREVIOUS" ? "Снимок унаследован от предыдущего кадра." : "Снимок унаследован из состава сцены.") : "Состав выбран явно." }), frameDraft.characterCastMode === "EXPLICIT" && frameDraft.characterIds.length === 0 ? _jsx("strong", { children: "\u0412 \u044D\u0442\u043E\u043C \u043A\u0430\u0434\u0440\u0435 \u043D\u0435\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0435\u0439" }) : null, project.characters.map((character) => (_jsxs("div", { className: "versionBlock", children: [_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", disabled: frameDraft.characterCastMode !== "EXPLICIT" || frame?.status === "GENERATING" || frame?.status === "LOCKED", checked: frameDraft.characterIds.includes(character.id), onChange: (event) => {
                                                                                        setFrameDraft((current) => ({
                                                                                            ...current,
                                                                                            characterIds: event.target.checked ? [...current.characterIds, character.id] : current.characterIds.filter((id) => id !== character.id),
                                                                                            additionalCharacterReferenceIds: event.target.checked ? current.additionalCharacterReferenceIds : { ...current.additionalCharacterReferenceIds, [character.id]: [] }
                                                                                        }));
                                                                                    } }), character.name] }), frameDraft.characterIds.includes(character.id) ? (_jsxs("div", { className: "fieldStack", children: [_jsx("small", { children: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430" }), character.references.filter((reference) => reference.status === "LOCKED" && reference.type !== "MASTER").map((reference) => {
                                                                                    const selected = frameDraft.additionalCharacterReferenceIds[character.id] ?? [];
                                                                                    return (_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", disabled: frameDraft.characterCastMode !== "EXPLICIT" || frame?.status === "GENERATING" || frame?.status === "LOCKED", checked: selected.includes(reference.id), onChange: (event) => setFrameDraft((current) => ({
                                                                                                    ...current,
                                                                                                    additionalCharacterReferenceIds: {
                                                                                                        ...current.additionalCharacterReferenceIds,
                                                                                                        [character.id]: event.target.checked
                                                                                                            ? [...(current.additionalCharacterReferenceIds[character.id] ?? []), reference.id]
                                                                                                            : (current.additionalCharacterReferenceIds[character.id] ?? []).filter((id) => id !== reference.id)
                                                                                                    }
                                                                                                })) }), reference.type ?? "OTHER", " \u00B7 ", reference.code] }, reference.id));
                                                                                }), !character.references.some((reference) => reference.status === "LOCKED" && reference.type !== "MASTER") ? _jsx("small", { children: "\u041D\u0435\u0442 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 LOCKED \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u043E\u0432." }) : null] })) : null] }, character.id))), _jsxs("label", { children: ["\u041B\u043E\u043A\u0430\u0446\u0438\u044F", _jsxs("select", { value: frameDraft.locationId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, locationId: event.target.value || null }), children: [_jsxs("option", { value: "", children: ["\u0418\u0437 \u0441\u0446\u0435\u043D\u044B", scene?.locationId ? `: ${project.locations.find((item) => item.id === scene.locationId)?.name ?? ""}` : ""] }), project.locations.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0420\u0430\u043A\u0443\u0440\u0441", _jsxs("select", { value: frameDraft.locationAngleId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, locationAngleId: event.target.value || null }), children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u0430\u043A\u0443\u0440\u0441\u0430" }), selectedLocation?.angles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0438\u043B\u044C", _jsxs("select", { value: frameDraft.styleProfileId ?? "", onChange: (event) => setFrameDraft({ ...frameDraft, styleProfileId: event.target.value || null }), children: [_jsxs("option", { value: "", children: ["\u0418\u0437 \u0441\u0446\u0435\u043D\u044B", scene?.styleProfileId ? `: ${project.styleProfiles.find((item) => item.id === scene.styleProfileId)?.name ?? ""}` : ""] }), project.styleProfiles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] })] }) }), _jsxs("div", { className: "switchGrid", children: [_jsxs("label", { children: ["\u0428\u0438\u0440\u0438\u043D\u0430 panel", _jsx("input", { value: frame ? frameDraft.targetWidth : targetWidth, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, targetWidth: event.target.value }) : setTargetWidth(event.target.value) })] }), _jsxs("label", { children: ["\u0412\u044B\u0441\u043E\u0442\u0430 panel", _jsx("input", { value: frame ? frameDraft.targetHeight : targetHeight, onChange: (event) => frame ? setFrameDraft({ ...frameDraft, targetHeight: event.target.value }) : setTargetHeight(event.target.value) })] })] })] })] }), _jsx(FrameTargetStoryStatePanel, { frameId: frame?.id ?? null, frameStatus: frame?.status ?? null, characters: project.characters })] }), _jsxs("details", { className: "technicalDetails", children: [_jsx("summary", { children: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0435\u0442\u0430\u043B\u0438" }), _jsxs("div", { className: "frameSectionBody", children: [_jsxs("div", { className: "referenceList", children: [_jsxs("h3", { children: ["\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B \u00B7 ", preview.data?.references.length ?? 0] }), preview.data ? _jsx(FrameContextSummary, { preview: preview.data }) : null, preview.data?.strategy === "CONTINUE_PREVIOUS_FRAME" ? _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "BASE IMAGE" }), _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: preview.data.context.previousLockedFrame?.frameCode ?? "Не найден" }), _jsx("small", { children: preview.data.context.previousLockedFrame?.generationId ?? "Недоступная база" })] })] }) : null, preview.data?.warnings.map((warning) => _jsx("p", { className: warning.severity === "blocking" ? "warning blocking" : "warning", children: warning.message }, `${warning.code}-${warning.entityId}`)), preview.data?.references.map((reference) => _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: reference.label ?? reference.code }), _jsx("small", { children: reference.role ?? referenceKindLabel(reference.kind) })] }, reference.id)), preview.data?.deltaInstructions ? _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "DELTA INSTRUCTIONS" }), _jsx("pre", { children: preview.data.deltaInstructions })] }) : null, _jsx(GeometryPreview, { frame: frame, preview: preview.data, fallbackAspectRatio: project.defaultAspectRatio })] }), _jsxs("details", { className: "promptPreview", children: [_jsx("summary", { children: "Production prompt" }), _jsx("pre", { children: preview.data?.prompt ?? "Создайте или выберите кадр, чтобы увидеть prompt." })] })] })] })] })] })] }));
}
function ContinuityEditContractEditor({ contract, detected, onChange }) {
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("label", { children: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" }), detected.length ? detected.map((change) => _jsxs("div", { className: "refRow", children: [_jsx(Check, { size: 15 }), _jsx("span", { children: change.label }), _jsxs("small", { children: [change.previousValue, " \u2192 ", change.currentValue] })] }, `${change.entityId}-${change.category}`)) : _jsx("small", { children: "\u0414\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u044B\u0439 structured Story State diff \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442." }), _jsx("label", { children: "\u0420\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439" }), _jsx("div", { className: "fieldStack", children: continuityCategories.map((category) => {
                    const automaticallyAllowed = detected.some((change) => change.category === category);
                    const explicitlyAllowed = contract.allowedChanges.includes(category);
                    return _jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: automaticallyAllowed || explicitlyAllowed, disabled: automaticallyAllowed, onChange: (event) => onChange({ ...contract, allowedChanges: event.target.checked ? [...contract.allowedChanges, category] : contract.allowedChanges.filter((item) => item !== category) }) }), category, automaticallyAllowed ? " (обнаружено автоматически)" : ""] }, category);
                }) }), _jsx(MultilineListEditor, { label: "\u042F\u0432\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F", values: contract.changes, onChange: (changes) => onChange({ ...contract, changes }), placeholder: "\u041E\u0434\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" }), _jsx(MultilineListEditor, { label: "\u0417\u0430\u043F\u0440\u0435\u0449\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F", values: contract.forbidden, onChange: (forbidden) => onChange({ ...contract, forbidden }), placeholder: "\u041E\u0434\u043D\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0443" })] }));
}
function MultilineListEditor({ label, values, placeholder, onChange }) {
    const serializedValues = values.join("\n");
    const [text, setText] = React.useState(serializedValues);
    React.useEffect(() => {
        if (splitLines(text).join("\n") !== serializedValues)
            setText(serializedValues);
    }, [serializedValues, text]);
    return (_jsxs("label", { children: [label, _jsx("textarea", { value: text, onChange: (event) => {
                    setText(event.target.value);
                    onChange(splitLines(event.target.value));
                }, placeholder: placeholder })] }));
}
export function StoryStateEditor({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
    const initial = scene?.storyState?.document ?? emptyState(scene?.id ?? "");
    const [state, setState] = React.useState(initial);
    React.useEffect(() => setState(initial), [scene?.id]);
    const save = useMutation({
        mutationFn: () => api.put(`/api/story-state/${scene?.id}`, { document: state }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    if (!scene)
        return _jsx("section", { className: "sideSection", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0441\u0446\u0435\u043D\u0443, \u0447\u0442\u043E\u0431\u044B \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B." });
    return (_jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "\u0422\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B" }), _jsx("button", { onClick: () => save.mutate(), title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0446\u0435\u043D\u044B", children: _jsx(Save, { size: 16 }) })] }), _jsxs("label", { children: ["\u0412\u0440\u0435\u043C\u044F", _jsx("input", { value: state.time.description, onChange: (event) => setState({ ...state, time: { description: event.target.value } }) })] }), _jsx(EnvironmentStateEditor, { state: state, onChange: setState }), project.characters.map((character) => (_jsx(CharacterStateFields, { character: character, state: state, onChange: setState }, character.id))), _jsx(StoryFactsEditor, { state: state, onChange: setState }), _jsxs("details", { children: [_jsx("summary", { children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C raw JSON" }), _jsx("pre", { children: JSON.stringify(state, null, 2) })] })] }));
}
function CharacterStateFields({ character, state, onChange }) {
    const current = state.characters[character.id] ?? { present: false };
    const update = (patch) => {
        onChange({
            ...state,
            characters: {
                ...state.characters,
                [character.id]: { ...current, ...patch }
            }
        });
    };
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: Boolean(current.present), onChange: (event) => update({ present: event.target.checked, outfitId: current.outfitId ?? character.outfits[0]?.id }) }), character.name] }), current.present ? (_jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041E\u0431\u0440\u0430\u0437", _jsxs("select", { value: current.outfitId ?? "", onChange: (event) => update({ outfitId: event.target.value || undefined }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), character.outfits.map((outfit) => _jsx("option", { value: outfit.id, children: outfit.name }, outfit.id))] })] }), _jsxs("label", { children: ["\u042D\u043C\u043E\u0446\u0438\u044F", _jsx("input", { value: current.emotion ?? "", onChange: (event) => update({ emotion: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u043B\u043E\u0441\u044B", _jsx("input", { value: current.hairState ?? "", onChange: (event) => update({ hairState: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u043E\u0437\u0430", _jsx("input", { value: current.pose ?? "", onChange: (event) => update({ pose: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435", _jsx("input", { value: current.locationPosition ?? "", onChange: (event) => update({ locationPosition: event.target.value }) })] }), _jsxs("label", { children: ["\u0412 \u0440\u0443\u043A\u0430\u0445", _jsx("input", { value: (current.heldProps ?? []).join(", "), onChange: (event) => update({ heldProps: splitList(event.target.value) }) })] })] })) : null] }));
}
function EnvironmentStateEditor({ state, onChange }) {
    const entries = Object.entries(state.environment);
    const updateKey = (oldKey, nextKey) => {
        const nextEnvironment = { ...state.environment };
        const value = nextEnvironment[oldKey];
        delete nextEnvironment[oldKey];
        if (nextKey.trim())
            nextEnvironment[nextKey.trim()] = value ?? "";
        onChange({ ...state, environment: nextEnvironment });
    };
    const updateValue = (key, value) => onChange({ ...state, environment: { ...state.environment, [key]: value } });
    const remove = (key) => {
        const nextEnvironment = { ...state.environment };
        delete nextEnvironment[key];
        onChange({ ...state, environment: nextEnvironment });
    };
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u041E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u0435" }), _jsxs("button", { onClick: () => onChange({ ...state, environment: { ...state.environment, [`state_${entries.length + 1}`]: "" } }), children: [_jsx(ImagePlus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), entries.length ? entries.map(([key, value]) => (_jsxs("div", { className: "keyValueRow", children: [_jsx("input", { value: key, onChange: (event) => updateKey(key, event.target.value) }), _jsx("input", { value: String(value ?? ""), onChange: (event) => updateValue(key, event.target.value) }), _jsx("button", { onClick: () => remove(key), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 14 }) })] }, key))) : _jsx("p", { className: "muted", children: "\u041D\u0435\u0442 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043B\u043E\u0432\u0438\u0439 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F." })] }));
}
function StoryFactsEditor({ state, onChange }) {
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u0424\u0430\u043A\u0442\u044B \u0438\u0441\u0442\u043E\u0440\u0438\u0438" }), _jsxs("button", { onClick: () => onChange({ ...state, storyFacts: [...state.storyFacts, ""] }), children: [_jsx(ImagePlus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), state.storyFacts.map((fact, index) => (_jsxs("div", { className: "keyValueRow", children: [_jsx("input", { value: fact, onChange: (event) => onChange({ ...state, storyFacts: state.storyFacts.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }) }), _jsx("button", { onClick: () => onChange({ ...state, storyFacts: state.storyFacts.filter((_, itemIndex) => itemIndex !== index) }), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 14 }) })] }, index)))] }));
}
function FrameContextSummary({ preview }) {
    const presentCharacters = preview.context.characters.map((character) => {
        const state = preview.context.storyState.characters[character.id];
        return `${character.name}${state?.outfitId ? " / образ задан" : ""}`;
    });
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430" }), _jsxs("div", { className: "refRow", children: [_jsx(User, { size: 15 }), _jsx("span", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), _jsx("small", { children: presentCharacters.join(", ") || "не выбраны" })] }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u044F" }), _jsx("small", { children: preview.context.location?.name ?? "не выбрана" })] }), _jsxs("div", { className: "refRow", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: "\u0420\u0430\u043A\u0443\u0440\u0441" }), _jsx("small", { children: preview.context.locationAngle?.name ?? "не выбран" })] }), _jsxs("div", { className: "refRow", children: [_jsx(Brush, { size: 15 }), _jsx("span", { children: "\u0421\u0442\u0438\u043B\u044C" }), _jsx("small", { children: preview.context.styleProfile?.name ?? "не выбран" })] })] }));
}
function GeometryPreview({ frame, preview, fallbackAspectRatio }) {
    const targetRatio = preview?.geometry.targetAspectRatio ?? frame?.targetAspectRatio ?? parseRatio(fallbackAspectRatio);
    const targetSize = frame?.targetWidth && frame.targetHeight ? `${frame.targetWidth} x ${frame.targetHeight}` : "из настроек проекта";
    return (_jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "\u0413\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u043A\u0430\u0434\u0440\u0430" }), _jsxs("div", { className: "refRow", children: [_jsx(Map, { size: 15 }), _jsx("span", { children: "\u0426\u0415\u041B\u0415\u0412\u0410\u042F PANEL" }), _jsxs("small", { children: [targetSize, " / ", targetRatio.toFixed(2), ":1"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: "\u0417\u0410\u041F\u0420\u041E\u0421 GEMINI" }), _jsxs("small", { children: [preview?.geometry.requestedAspectRatio ?? fallbackAspectRatio, " / ", preview?.geometry.requestedResolution ?? "авто", " / ", preview?.geometry.requestedImageSize ?? "1K"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Settings, { size: 15 }), _jsx("span", { children: "\u041F\u041E\u0421\u0422\u041E\u0411\u0420\u0410\u0411\u041E\u0422\u041A\u0410" }), _jsxs("small", { children: ["\u041A\u0440\u043E\u043F: ", preview?.geometry.requiresCrop ? "ДА" : "НЕТ", " / ", preview?.geometry.cropStrategy ?? "NONE"] })] }), preview?.geometry.requiresCrop ? _jsx("p", { className: "warning", children: "\u0426\u0435\u043B\u0435\u0432\u043E\u0439 panel ratio \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F \u043E\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 Gemini. Prompt \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 safe area instruction; crop/editor \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u044D\u0442\u0430\u043F\u043E\u043C." }) : null] }));
}
