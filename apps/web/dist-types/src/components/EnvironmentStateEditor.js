import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { ImagePlus, X } from "lucide-react";
export function environmentRowErrors(rows) {
    const names = rows.map((row) => row.name.trim());
    return names.map((name) => !name ? "Введите имя параметра." : names.filter((candidate) => candidate === name).length > 1 ? "Имена параметров не должны повторяться." : "");
}
export function rowsToEnvironment(rows) {
    if (environmentRowErrors(rows).some(Boolean) || rows.some(row => row.invalidValue))
        return null;
    return Object.fromEntries(rows.map((row) => [row.name.trim(), row.value]));
}
// Native validity also guards the Scene save action; invalid drafts stay local.
export function reportEnvironmentValidity(container) {
    for (const input of container.querySelectorAll("[data-environment-key]")) {
        if (!input.reportValidity())
            return false;
    }
    return true;
}
export function EnvironmentStateEditor({ state, onChange, typedValues = false, onPendingChange }) {
    const nextId = React.useRef(0);
    const makeRows = (environment) => Object.entries(environment).map(([name, value]) => ({ id: String(nextId.current++), name, value }));
    const [rows, setRows] = React.useState(() => makeRows(state.environment));
    const emitted = React.useRef(state.environment);
    const sceneId = React.useRef(state.sceneId);
    React.useEffect(() => {
        if (sceneId.current !== state.sceneId || emitted.current !== state.environment) {
            sceneId.current = state.sceneId;
            emitted.current = state.environment;
            setRows(makeRows(state.environment));
        }
    }, [state.sceneId, state.environment]);
    const change = (next) => {
        setRows(next);
        const environment = rowsToEnvironment(next);
        if (environment !== null) {
            emitted.current = environment;
            onChange({ ...state, environment });
        }
    };
    const errors = environmentRowErrors(rows);
    const pending = errors.some(Boolean) || rows.some(row => row.invalidValue);
    React.useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
    const prefix = React.useId();
    return _jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u041E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u0435" }), _jsxs("button", { type: "button", onClick: () => change([...rows, { id: String(nextId.current++), name: "", value: "" }]), children: [_jsx(ImagePlus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })] }), rows.map((row, index) => _jsxs("div", { children: [_jsxs("div", { className: "keyValueRow", children: [_jsx("input", { "aria-label": "\u0418\u043C\u044F \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F", "data-environment-key": "", required: true, "aria-invalid": Boolean(errors[index]), "aria-describedby": errors[index] ? `${prefix}-${row.id}` : undefined, ref: (input) => input?.setCustomValidity(errors[index] ?? ""), value: row.name, onChange: (event) => change(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item)) }), typedValues ? _jsxs("div", { className: "typedEnvironmentValue", children: [_jsxs("select", { "aria-label": "\u0422\u0438\u043F \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F", value: row.value === null ? "null" : typeof row.value, onChange: event => change(rows.map(item => item.id === row.id ? { ...item, value: event.target.value === "null" ? null : event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "", numberText: undefined, invalidValue: false } : item)), children: [_jsx("option", { value: "string", children: "\u0422\u0435\u043A\u0441\u0442" }), _jsx("option", { value: "number", children: "\u0427\u0438\u0441\u043B\u043E" }), _jsx("option", { value: "boolean", children: "\u0414\u0430 / \u041D\u0435\u0442" }), _jsx("option", { value: "null", children: "Null" })] }), typeof row.value === "boolean" ? _jsxs("select", { "aria-label": "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F", value: String(row.value), onChange: event => change(rows.map(item => item.id === row.id ? { ...item, value: event.target.value === "true" } : item)), children: [_jsx("option", { value: "true", children: "\u0414\u0430" }), _jsx("option", { value: "false", children: "\u041D\u0435\u0442" })] }) : row.value === null ? _jsx("span", { className: "muted", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E (null)" }) : _jsx("input", { "aria-label": "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F", type: typeof row.value === "number" ? "number" : "text", step: typeof row.value === "number" ? "any" : undefined, required: typeof row.value === "number", "aria-invalid": Boolean(row.invalidValue), value: typeof row.value === "number" ? row.numberText ?? String(row.value) : row.value, onChange: event => { const text = event.target.value; change(rows.map(item => item.id === row.id ? typeof item.value === "number" ? { ...item, numberText: text, invalidValue: !text.trim() || !Number.isFinite(Number(text)), value: text.trim() && Number.isFinite(Number(text)) ? Number(text) : item.value } : { ...item, value: text } : item)); } })] }) : _jsx("input", { "aria-label": "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F", value: String(row.value ?? ""), onChange: (event) => change(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item)) }), _jsx("button", { type: "button", onClick: () => change(rows.filter((item) => item.id !== row.id)), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(X, { size: 14 }) })] }), errors[index] ? _jsx("p", { className: "warning", role: "alert", id: `${prefix}-${row.id}`, children: errors[index] }) : null, row.invalidValue ? _jsx("p", { className: "warning", role: "alert", children: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u043D\u0435\u0447\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E. \u041F\u0440\u0435\u0436\u043D\u0435\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0432\u043C\u0435\u0441\u0442\u043E \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0433\u043E \u0432\u0432\u043E\u0434\u0430." }) : null] }, row.id)), !rows.length ? _jsx("p", { className: "muted", children: "\u041D\u0435\u0442 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0443\u0441\u043B\u043E\u0432\u0438\u0439 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F." }) : null] });
}
