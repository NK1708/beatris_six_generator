import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { projectFileUrl } from "../utils.js";
export function InspectionImage({ project, generation, zoom = "fit", label, onFitScale }) {
    const viewport = React.useRef(null);
    const [size, setSize] = React.useState(null);
    const [failed, setFailed] = React.useState(false);
    const [retry, setRetry] = React.useState(0);
    React.useEffect(() => {
        const element = viewport.current;
        if (!element || !size)
            return;
        const update = () => { if (element.clientWidth && element.clientHeight)
            onFitScale?.(100 * Math.min(element.clientWidth / size.width, element.clientHeight / size.height)); };
        update();
        if (typeof ResizeObserver === "undefined")
            return;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [size, onFitScale]);
    return _jsxs("div", { className: "inspectionImage", children: [_jsx("div", { className: "inspectionViewport" + (zoom === "fit" ? " isFit" : ""), ref: viewport, "data-zoom": zoom, children: !generation.outputFilePath || failed ? _jsxs("div", { className: "inspectionImageError", role: "alert", children: [_jsx("strong", { children: "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E" }), _jsxs("p", { children: [label, " \u00B7 ", generation.id] }), _jsx("p", { children: "\u0424\u0430\u0439\u043B \u044D\u0442\u043E\u0433\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0438\u043B\u0438 \u043D\u0435 \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F. \u0414\u0440\u0443\u0433\u043E\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E." }), generation.outputFilePath ? _jsx("button", { type: "button", onClick: () => { setFailed(false); setSize(null); setRetry(value => value + 1); }, children: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443" }) : null] }) : _jsx("img", { src: projectFileUrl(project, generation.outputFilePath), alt: label + " · " + generation.id, style: zoom === "fit" ? { width: "100%", height: "100%", objectFit: "contain" } : size ? { width: size.width * zoom / 100, height: size.height * zoom / 100, maxWidth: "none", maxHeight: "none" } : { width: "auto", maxWidth: "none" }, onLoad: event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }), onError: () => { setFailed(true); setSize(null); } }, retry) }), _jsxs("small", { children: [size ? `Фактический размер: ${size.width} × ${size.height}` : "Фактический размер недоступен", " \u00B7 ", zoom === "fit" ? "Вписать целиком" : zoom + "%"] })] });
}
