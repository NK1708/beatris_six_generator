import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { api } from "../api.js";
export function ApiGenerationTools({ project }) {
    const queryClient = useQueryClient();
    const frames = project.scenes.flatMap((scene) => scene.frames);
    const [frameId, setFrameId] = React.useState(frames[0]?.id ?? "");
    const activeFrameId = frames.some((frame) => frame.id === frameId) ? frameId : frames[0]?.id ?? "";
    const preview = useQuery({
        queryKey: ["preview", activeFrameId],
        queryFn: () => api.get(`/api/frames/${activeFrameId}/preview`),
        enabled: Boolean(activeFrameId)
    });
    const generate = useMutation({
        mutationFn: (mode) => api.post("/api/generations", { frameId: activeFrameId, mode }),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    const blocked = preview.data?.warnings.some((warning) => warning.severity === "blocking") ?? true;
    return _jsxs("section", { className: "fieldStack", children: [_jsx("h2", { children: "API generation" }), _jsxs("label", { children: ["\u041A\u0430\u0434\u0440", _jsx("select", { value: activeFrameId, onChange: (event) => setFrameId(event.target.value), children: project.scenes.map((scene) => scene.frames.map((frame) => _jsxs("option", { value: frame.id, children: [scene.name, " / ", frame.frameCode] }, frame.id))) })] }), _jsxs("div", { className: "toolbar", children: [_jsxs("button", { disabled: !activeFrameId || generate.isPending, onClick: () => generate.mutate("draft"), children: [_jsx(Play, { size: 16 }), " Draft"] }), _jsxs("button", { disabled: !activeFrameId || blocked || generate.isPending, onClick: () => generate.mutate("production"), children: [_jsx(Play, { size: 16 }), " Production"] })] }), preview.data?.warnings.map((warning) => _jsx("p", { className: warning.severity === "blocking" ? "warning blocking" : "warning", children: warning.message }, `${warning.code}-${warning.entityId}`)), generate.error ? _jsx("p", { className: "warning", children: generate.error.message }) : null] });
}
