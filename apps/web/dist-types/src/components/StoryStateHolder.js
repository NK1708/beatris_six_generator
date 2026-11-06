import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatTargetValue } from "../targetStateComparison.js";
export function holderName(id, characters) {
    return characters.find(character => character.id === id)?.name ?? `Неизвестный владелец (${id})`;
}
/** Presentation only: never normalize or rewrite the persisted document. */
export function displayStoryStateValue(value, path, characters) {
    if (path.length === 3 && path[0] === "props" && path[2] === "holderCharacterId") {
        return typeof value === "string" && value !== "" ? holderName(value, characters) : formatTargetValue(value);
    }
    if (path[0] === "props" && path.length < 3 && value && typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value).map(([key, item]) => `${key}: ${displayStoryStateValue(item, [...path, key], characters)}`).join("; ");
    }
    return formatTargetValue(value);
}
export function StoryStateHolder({ value, characters, onChange }) {
    return _jsxs("select", { value: value ?? "", onChange: event => onChange(event.target.value === "" ? undefined : event.target.value), children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430" }), value && !characters.some(character => character.id === value) ? _jsx("option", { value: value, children: holderName(value, characters) }) : null, characters.map(character => _jsx("option", { value: character.id, children: character.name }, character.id))] });
}
