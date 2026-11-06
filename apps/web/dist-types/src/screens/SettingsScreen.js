import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings } from "lucide-react";
import { api } from "../api.js";
export function SettingsScreen({ project }) {
    const queryClient = useQueryClient();
    const health = useQuery({ queryKey: ["health"], queryFn: () => api.get("/api/health") });
    const [draft, setDraft] = React.useState({
        defaultAspectRatio: project.defaultAspectRatio,
        defaultResolution: project.defaultResolution,
        defaultDraftModel: project.defaultDraftModel,
        defaultProductionModel: project.defaultProductionModel
    });
    React.useEffect(() => {
        setDraft({
            defaultAspectRatio: project.defaultAspectRatio,
            defaultResolution: project.defaultResolution,
            defaultDraftModel: project.defaultDraftModel,
            defaultProductionModel: project.defaultProductionModel
        });
    }, [project.id, project.defaultAspectRatio, project.defaultResolution, project.defaultDraftModel, project.defaultProductionModel]);
    const save = useMutation({
        mutationFn: () => api.put(`/api/projects/${project.id}/settings`, { projectId: project.id, ...draft }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    return (_jsxs("section", { className: "fieldStack settingsForm", "aria-label": "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" }), _jsxs("button", { onClick: () => save.mutate(), children: [_jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "refRow", children: [_jsx(Settings, { size: 15 }), _jsx("span", { children: "API" }), _jsx("small", { children: health.data?.ok ? `готов / ${health.data.provider}` : "проверка..." })] }), _jsxs("label", { children: ["Fallback aspect ratio", _jsx("input", { value: draft.defaultAspectRatio, onChange: (event) => setDraft({ ...draft, defaultAspectRatio: event.target.value }) })] }), _jsxs("label", { children: ["Fallback resolution", _jsx("input", { value: draft.defaultResolution, onChange: (event) => setDraft({ ...draft, defaultResolution: event.target.value }) })] }), _jsxs("label", { children: ["Draft-\u043C\u043E\u0434\u0435\u043B\u044C", _jsx("input", { value: draft.defaultDraftModel, onChange: (event) => setDraft({ ...draft, defaultDraftModel: event.target.value }) })] }), _jsxs("label", { children: ["Production-\u043C\u043E\u0434\u0435\u043B\u044C", _jsx("input", { value: draft.defaultProductionModel, onChange: (event) => setDraft({ ...draft, defaultProductionModel: event.target.value }) })] })] }));
}
