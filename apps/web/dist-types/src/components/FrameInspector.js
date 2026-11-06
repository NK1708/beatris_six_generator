import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PanelRightClose } from "lucide-react";
const tabs = [["staging", "Постановка"], ["context", "Контекст"], ["state", "Состояние"], ["technical", "Техническое"]];
export function FrameInspector({ tab, onTab, collapsed, onClose, children }) {
    return _jsxs("aside", { className: "frameInspector studioFrameInspector", id: "frame-inspector", "aria-label": "\u0420\u0435\u0434\u0430\u043A\u0442\u043E\u0440 \u043A\u0430\u0434\u0440\u0430", hidden: collapsed, onKeyDown: event => { if (event.key === "Escape")
            onClose(); }, children: [_jsxs("div", { className: "frameInspectorHeader", children: [_jsx("h3", { children: "\u0418\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440" }), _jsx("button", { type: "button", className: "shellIconButton", onClick: onClose, "aria-label": "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440", title: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C Inspector", children: _jsx(PanelRightClose, { size: 18 }) })] }), _jsx("div", { className: "frameInspectorTabs", role: "tablist", "aria-label": "\u0420\u0430\u0437\u0434\u0435\u043B\u044B \u0438\u043D\u0441\u043F\u0435\u043A\u0442\u043E\u0440\u0430", children: tabs.map(([id, label], index) => _jsx("button", { type: "button", role: "tab", id: `inspector-tab-${id}`, "aria-controls": `inspector-panel-${id}`, "aria-selected": id === tab, tabIndex: id === tab ? 0 : -1, onClick: () => onTab(id), onKeyDown: event => {
                        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                        if (next === null)
                            return;
                        event.preventDefault();
                        const nextId = tabs[next][0];
                        onTab(nextId);
                        document.getElementById(`inspector-tab-${nextId}`)?.focus();
                    }, children: label }, id)) }), _jsx("div", { className: "frameInspectorContent", children: children })] });
}
export function FrameInspectorPanel({ id, active, children }) {
    return _jsx("section", { id: `inspector-panel-${id}`, role: "tabpanel", "aria-labelledby": `inspector-tab-${id}`, hidden: active !== id, className: "frameInspectorPanel", children: children });
}
