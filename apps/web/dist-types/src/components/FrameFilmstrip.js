import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { frameStatusLabel } from "../frameWorkspaceUi.js";
import React from "react";
import { ImageOff, ImagePlus } from "lucide-react";
import { projectFileUrl } from "../utils.js";
function FilmstripThumbnail({ frame, project }) {
    const selected = frame.generations.find(item => item.id === frame.selectedGenerationId);
    const [failed, setFailed] = React.useState(false);
    const url = selected?.outputFilePath ? projectFileUrl(project, selected.outputFilePath) : null;
    return _jsx("span", { className: "filmstripThumbnail", children: url && !failed ? _jsx("img", { src: url, onError: () => setFailed(true), alt: `Миниатюра ${frame.frameCode}` }) : _jsxs("span", { children: [_jsx(ImageOff, { size: 18 }), _jsx("small", { children: selected ? "Файл недоступен" : "Нет изображения" })] }) });
}
export function FrameFilmstrip({ project, frames, selectedId, onSelect, onCreate, creating, canCreate }) {
    const active = React.useRef(null);
    React.useEffect(() => { active.current?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [selectedId]);
    return _jsx("nav", { className: "frameFilmstrip", "aria-label": "\u041A\u0430\u0434\u0440\u044B \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0441\u0446\u0435\u043D\u044B", children: _jsxs("div", { className: "frameFilmstripTrack", children: [frames.map((frame, index) => _jsxs("button", { ref: frame.id === selectedId ? active : undefined, type: "button", className: `filmstripFrame${frame.id === selectedId ? " isActive" : ""}`, "aria-current": frame.id === selectedId ? "true" : undefined, title: frame.frameCode + " · " + frame.id, "aria-label": `Открыть кадр ${index + 1}`, onClick: () => onSelect(frame.id), children: [_jsx(FilmstripThumbnail, { frame: frame, project: project }, `${frame.id}:${frame.selectedGenerationId}:${frame.generations.find(item => item.id === frame.selectedGenerationId)?.outputFilePath}`), _jsxs("span", { className: "filmstripCaption", children: [_jsxs("strong", { children: ["\u041A\u0430\u0434\u0440 ", index + 1] }), _jsx("small", { children: frameStatusLabel(frame.status) })] })] }, frame.id)), _jsxs("button", { className: "filmstripCreate", type: "button", disabled: !canCreate || creating, onClick: onCreate, children: [_jsx(ImagePlus, { size: 20 }), _jsx("span", { children: creating ? "Создание…" : "Новый кадр" })] })] }) });
}
