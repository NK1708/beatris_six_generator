import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation } from "@tanstack/react-query";
import { Check, ImagePlus, X } from "lucide-react";
import { api } from "../api.js";
import { projectFileUrl, readFileAsDataUrl } from "../utils.js";
export function ReferenceSlots({ project, ownerType, ownerId, references, slots, onChanged }) {
    return (_jsxs("section", { className: "sideSection", children: [_jsx("h3", { children: "\u0420\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B" }), slots.map((slot) => {
                const versions = references.filter((reference) => (reference.type ?? "REF") === slot).sort((left, right) => right.version - left.version);
                const locked = versions.filter((reference) => reference.status === "LOCKED");
                const canonical = locked[0];
                const history = versions.filter((reference) => ownerType === "style" ? reference.status !== "LOCKED" : reference.id !== canonical?.id);
                const styleAtLimit = ownerType === "style" && locked.length >= 6;
                return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("strong", { children: slot }), _jsx(ReferenceUpload, { ownerType: ownerType, ownerId: ownerId, type: slot, label: ownerType === "style" ? "+ Добавить референс" : "Загрузить", onDone: onChanged })] }), ownerType === "style" ? _jsxs("p", { className: "muted", children: ["\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 style refs: ", locked.length, "/6. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A visual style guidance, \u043D\u0435 \u043A\u0430\u043A \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0441\u0446\u0435\u043D\u044B."] }) : null, styleAtLimit ? _jsx("p", { className: "warning", children: "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043B\u0438\u043C\u0438\u0442 6 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 style references. \u0412\u044B\u0432\u0435\u0434\u0438\u0442\u0435 \u043E\u0434\u0438\u043D \u0438\u0437 \u043A\u0430\u043D\u043E\u043D\u0430 \u043F\u0435\u0440\u0435\u0434 \u0437\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u0438\u0435\u043C \u043D\u043E\u0432\u043E\u0433\u043E." }) : null, ownerType === "style" && locked.length ? (_jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439 style canon" }), locked.map((reference) => _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: reference, onChanged: onChanged }, reference.id))] })) : canonical ? (_jsxs("div", { children: [_jsx("p", { className: "muted", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0430\u043D\u043E\u043D" }), _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: canonical, onChanged: onChanged })] })) : _jsx("p", { className: "warning", children: "LOCKED-\u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0441\u043B\u043E\u0442\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D." }), history.length ? (_jsxs("details", { children: [_jsxs("summary", { children: ["\u0412\u0435\u0440\u0441\u0438\u0438 \u0438 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B (", history.length, ")"] }), history.map((reference) => _jsx(ReferenceVersion, { project: project, ownerType: ownerType, reference: reference, onChanged: onChanged }, reference.id))] })) : null, !versions.length ? _jsx("p", { className: "muted", children: "\u0412\u0435\u0440\u0441\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." }) : null] }, slot));
            })] }));
}
function ReferenceUpload({ ownerType, ownerId, type, label, onDone }) {
    const upload = useMutation({
        mutationFn: async (file) => api.post(referenceUploadPath(ownerType, ownerId), { type, fileName: file.name, dataUrl: await readFileAsDataUrl(file), description: "" }),
        onSuccess: onDone
    });
    return (_jsxs("label", { className: "uploadTile compactUpload", children: [_jsx(ImagePlus, { size: 15 }), _jsx("span", { children: upload.isPending ? "Загрузка" : label }), _jsx("input", { type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (event) => { const file = event.target.files?.[0]; if (file)
                    upload.mutate(file); } })] }));
}
function ReferenceVersion({ project, ownerType, reference, onChanged }) {
    const approve = useReferenceAction(ownerType, reference.id, "approve", onChanged);
    const reject = useReferenceAction(ownerType, reference.id, "reject", onChanged);
    const lock = useReferenceAction(ownerType, reference.id, "lock", onChanged);
    const deprecate = useReferenceAction(ownerType, reference.id, "deprecate", onChanged);
    return (_jsxs("div", { className: "versionRow", children: [_jsxs("div", { children: [_jsxs("strong", { children: ["V", reference.version] }), " ", _jsx(StatusBadge, { status: reference.status }), _jsx("small", { children: reference.code })] }), _jsxs("div", { className: "miniActions", children: [reference.filePath ? _jsx("img", { src: projectFileUrl(project, reference.filePath) }) : null, _jsxs("button", { disabled: reference.status !== "DRAFT", onClick: () => approve.mutate(), children: [_jsx(Check, { size: 14 }), " \u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C"] }), _jsxs("button", { disabled: reference.status === "LOCKED", onClick: () => lock.mutate(), children: [_jsx(Check, { size: 14 }), " \u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C"] }), _jsxs("button", { disabled: reference.status !== "LOCKED", onClick: () => deprecate.mutate(), children: [_jsx(X, { size: 14 }), " \u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u043A\u0430\u043D\u043E\u043D\u0430"] }), _jsxs("button", { disabled: reference.status === "LOCKED", onClick: () => reject.mutate(), children: [_jsx(X, { size: 14 }), " \u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"] })] })] }));
}
function useReferenceAction(ownerType, referenceId, action, onChanged) {
    return useMutation({
        mutationFn: () => api.post(`/api/references/${ownerType}/${referenceId}/${action}`, {}),
        onSuccess: onChanged
    });
}
export function StatusBadge({ status }) {
    return _jsx("span", { className: `status status-${status.toLowerCase()}`, children: status });
}
export const characterSlots = ["MASTER", "FRONT", "THREE_QUARTER_LEFT", "THREE_QUARTER_RIGHT", "PROFILE_LEFT", "PROFILE_RIGHT", "FULL_BODY_FRONT", "FULL_BODY_SIDE", "FULL_BODY_BACK", "EXPRESSION", "OTHER"];
export const outfitSlots = ["MASTER", "FRONT", "SIDE", "BACK", "DETAIL"];
export const locationSlots = ["MASTER", "FLOOR_PLAN", "DETAIL", "OTHER"];
function referenceUploadPath(ownerType, ownerId) {
    if (ownerType === "character")
        return `/api/characters/${ownerId}/references`;
    if (ownerType === "outfit")
        return `/api/outfits/${ownerId}/references`;
    if (ownerType === "location")
        return `/api/locations/${ownerId}/references`;
    if (ownerType === "locationAngle")
        return `/api/location-angles/${ownerId}/references`;
    return `/api/styles/${ownerId}/references`;
}
