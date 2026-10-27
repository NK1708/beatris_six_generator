import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ImagePlus } from "lucide-react";
import { createFrameForScene } from "../frameCreation.js";
import { useUiStore } from "../state.js";
import { frameAspectRatio, orderedSceneFrames, storyboardImageCandidates, storyboardStatus } from "../storyboard.js";
import { projectFileUrl } from "../utils.js";
export function StoryboardScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedSceneId = useUiStore((state) => state.selectedSceneId);
    const selectScene = useUiStore((state) => state.selectScene);
    const openStoryboardFrame = useUiStore((state) => state.openStoryboardFrame);
    const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
    const frames = React.useMemo(() => orderedSceneFrames(scene?.frames ?? []), [scene?.frames]);
    const createFrame = useMutation({
        mutationFn: () => {
            if (!scene)
                throw new Error("Выберите сцену для создания кадра.");
            return createFrameForScene(scene, {
                targetWidth: 1200,
                targetHeight: 675
            });
        },
        onSuccess: (created) => {
            openStoryboardFrame(created.frame.sceneId, created.frame.id);
            void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
        }
    });
    return _jsxs("section", { className: "storyboardScreen", children: [_jsxs("div", { className: "storyboardHeader", children: [_jsxs("div", { className: "storyboardHeading", children: [_jsx("span", { className: "muted", children: project.name }), _jsx("h2", { children: "\u0420\u0430\u0441\u043A\u0430\u0434\u0440\u043E\u0432\u043A\u0430" })] }), _jsxs("label", { className: "storyboardScenePicker", children: ["\u0421\u0446\u0435\u043D\u0430", _jsx("select", { value: scene?.id ?? "", onChange: (event) => selectScene(event.target.value), disabled: !project.scenes.length, children: project.scenes.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("div", { className: "storyboardSceneSummary", children: [_jsx("strong", { children: scene?.name ?? "Сцена не выбрана" }), _jsxs("span", { className: "muted", children: ["\u041A\u0430\u0434\u0440\u043E\u0432: ", frames.length] })] }), _jsxs("button", { type: "button", disabled: !scene || createFrame.isPending, onClick: () => createFrame.mutate(), children: [_jsx(ImagePlus, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043A\u0430\u0434\u0440"] })] }), createFrame.error ? _jsx("p", { className: "warning", children: createFrame.error.message }) : null, scene && frames.length === 0 ? _jsx("div", { className: "storyboardEmpty", children: "\u0412 \u044D\u0442\u043E\u0439 \u0441\u0446\u0435\u043D\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043A\u0430\u0434\u0440\u043E\u0432." }) : null, !scene ? _jsx("div", { className: "storyboardEmpty", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0441\u0446\u0435\u043D\u0443, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u0440\u0430\u0441\u043A\u0430\u0434\u0440\u043E\u0432\u043A\u0443." }) : null, frames.length > 0 && scene ? _jsx("div", { className: "storyboardGrid", children: frames.map((frame) => _jsx(StoryboardCard, { frame: frame, scene: scene, project: project, onOpen: () => openStoryboardFrame(scene.id, frame.id) }, frame.id)) }) : null] });
}
function StoryboardCard({ frame, scene, project, onOpen }) {
    const candidates = React.useMemo(() => storyboardImageCandidates(frame), [frame.generations, frame.selectedGenerationId]);
    const [imageIndex, setImageIndex] = React.useState(0);
    const candidateIds = candidates.map((item) => item.id).join(",");
    React.useEffect(() => setImageIndex(0), [candidateIds]);
    const image = candidates[imageIndex];
    const description = frame.description.trim() || frame.action.trim() || "Описание не задано";
    return _jsxs("button", { type: "button", className: "storyboardCard", onClick: onOpen, "aria-label": `Открыть кадр ${frame.frameCode} в редакторе`, children: [_jsx("span", { className: "storyboardImage", style: { aspectRatio: frameAspectRatio(frame, project.defaultAspectRatio) }, children: image ? _jsx("img", { src: projectFileUrl(project, image.outputFilePath), alt: `Кадр ${frame.frameCode}`, loading: "lazy", decoding: "async", onError: () => setImageIndex((index) => index + 1) })
                    : _jsx("span", { className: "storyboardPlaceholder", children: _jsx(ImagePlus, { size: 24, "aria-hidden": "true" }) }) }), _jsxs("span", { className: "storyboardCardBody", children: [_jsxs("span", { className: "storyboardCardTop", children: [_jsx("strong", { children: frame.frameCode }), _jsx("span", { className: `storyboardStatus storyboardStatus-${frame.status.toLowerCase()}`, children: storyboardStatus(frame) })] }), _jsx("span", { className: "storyboardDescription", title: description, children: description }), _jsxs("span", { className: "storyboardOpen", children: [scene.name, " ", _jsx(ArrowUpRight, { size: 15, "aria-hidden": "true" })] })] })] });
}
