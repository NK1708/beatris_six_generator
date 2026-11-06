import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { DeleteProjectPanel } from "./AssetLibrary.js";
import { ApiGenerationTools } from "./ApiGenerationTools.js";
export function AdvancedToolsScreen({ project }) {
    const queryClient = useQueryClient();
    const firstCharacter = project.characters[0];
    const [characterId, setCharacterId] = React.useState(firstCharacter?.id ?? "");
    const character = project.characters.find((item) => item.id === characterId) ?? firstCharacter;
    const [outfitId, setOutfitId] = React.useState(character?.outfits[0]?.id ?? "");
    const [locationId, setLocationId] = React.useState(project.locations[0]?.id ?? "");
    const location = project.locations.find((item) => item.id === locationId) ?? project.locations[0];
    const [locationAngleId, setLocationAngleId] = React.useState("");
    const [styleProfileId, setStyleProfileId] = React.useState(project.styleProfiles[0]?.id ?? "");
    React.useEffect(() => {
        if (character && !character.outfits.some((outfit) => outfit.id === outfitId)) {
            setOutfitId(character.outfits[0]?.id ?? "");
        }
    }, [character?.id, outfitId]);
    React.useEffect(() => {
        if (location && !location.angles.some((angle) => angle.id === locationAngleId)) {
            setLocationAngleId("");
        }
    }, [location?.id, locationAngleId]);
    const seedBenchmark = useMutation({
        mutationFn: () => api.post(`/api/projects/${project.id}/benchmark/seed`, {
            projectId: project.id,
            characterId,
            outfitId,
            locationId,
            styleProfileId,
            locationAngleId: locationAngleId || undefined
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.id] })
    });
    const benchmarkReady = Boolean(characterId && outfitId && locationId && styleProfileId);
    return (_jsxs("section", { className: "frameEditor", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "Developer Tools" }), _jsxs("button", { disabled: !benchmarkReady || seedBenchmark.isPending, onClick: () => seedBenchmark.mutate(), children: [seedBenchmark.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Clapperboard, { size: 16 }), " \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C benchmark"] })] }), _jsxs("div", { className: "versionBlock", children: [_jsx("h3", { children: "Benchmark 20 \u043A\u0430\u0434\u0440\u043E\u0432" }), _jsxs("div", { className: "switchGrid", children: [_jsxs("label", { children: ["\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436", _jsx("select", { value: characterId, onChange: (event) => setCharacterId(event.target.value), children: project.characters.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041E\u0431\u0440\u0430\u0437", _jsx("select", { value: outfitId, onChange: (event) => setOutfitId(event.target.value), children: character?.outfits.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u041B\u043E\u043A\u0430\u0446\u0438\u044F", _jsx("select", { value: locationId, onChange: (event) => setLocationId(event.target.value), children: project.locations.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), _jsxs("label", { children: ["\u0420\u0430\u043A\u0443\u0440\u0441", _jsxs("select", { value: locationAngleId, onChange: (event) => setLocationAngleId(event.target.value), children: [_jsx("option", { value: "", children: "\u0411\u0435\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u0430\u043A\u0443\u0440\u0441\u0430" }), location?.angles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] })] }), _jsxs("label", { children: ["\u0421\u0442\u0438\u043B\u044C", _jsx("select", { value: styleProfileId, onChange: (event) => setStyleProfileId(event.target.value), children: project.styleProfiles.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] })] }), !benchmarkReady ? _jsx("p", { className: "warning", children: "\u0414\u043B\u044F benchmark \u043D\u0443\u0436\u043D\u044B \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436, \u043E\u0431\u0440\u0430\u0437, \u043B\u043E\u043A\u0430\u0446\u0438\u044F \u0438 \u0441\u0442\u0438\u043B\u044C." }) : null] }), seedBenchmark.data ? _jsxs("p", { className: "muted", children: ["Benchmark-\u0441\u0446\u0435\u043D\u0430 \u0433\u043E\u0442\u043E\u0432\u0430: ", seedBenchmark.data.totalFrames, " \u043A\u0430\u0434\u0440\u043E\u0432, \u043D\u043E\u0432\u044B\u0445 \u0441\u043E\u0437\u0434\u0430\u043D\u043E ", seedBenchmark.data.createdCount, "."] }) : null, _jsx(ApiGenerationTools, { project: project })] }));
}
export function ProjectOverview({ project }) {
    return _jsxs("section", { className: "projectOverview", children: [_jsx("h2", { children: "\u0421\u0432\u043E\u0434\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }), _jsxs("div", { className: "summaryGrid", children: [_jsx(Metric, { label: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438", value: project.characters.length }), _jsx(Metric, { label: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438", value: project.locations.length }), _jsx(Metric, { label: "\u0421\u0442\u0438\u043B\u0438", value: project.styleProfiles.length }), _jsx(Metric, { label: "\u0421\u0446\u0435\u043D\u044B", value: project.scenes.length })] }), _jsx("p", { className: "muted", children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 \u0435\u0433\u043E \u043F\u0430\u043F\u043A\u0435." }), _jsxs("details", { className: "projectDangerDisclosure", children: [_jsx("summary", { children: "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }), _jsx(DeleteProjectPanel, { project: project })] })] });
}
function Metric({ label, value }) {
    return _jsxs("div", { className: "metric", children: [_jsx("strong", { children: value }), _jsx("span", { children: label })] });
}
