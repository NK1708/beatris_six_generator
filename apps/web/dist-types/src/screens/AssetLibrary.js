import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Brush, ImagePlus, Loader2, Map, Save, Trash2, User } from "lucide-react";
import { api } from "../api.js";
import { useUiStore } from "../state.js";
import { ReferenceSlots, characterSlots, outfitSlots, locationSlots } from "../components/References.js";
function emptyCharacterDraft() {
    return {
        name: "",
        description: "",
        age: "",
        height: "",
        bodyDescription: "",
        faceDescription: "",
        hairDescription: "",
        distinctiveFeatures: "",
        immutableFeatures: ""
    };
}
function characterToDraft(character) {
    return {
        name: character.name,
        description: character.description,
        age: character.age,
        height: character.height,
        bodyDescription: character.bodyDescription,
        faceDescription: character.faceDescription,
        hairDescription: character.hairDescription,
        distinctiveFeatures: character.distinctiveFeatures,
        immutableFeatures: character.immutableFeatures
    };
}
function OutfitEditor({ project, outfit, onChanged }) {
    const [draft, setDraft] = React.useState(outfitToDraft(outfit));
    React.useEffect(() => setDraft(outfitToDraft(outfit)), [outfit.id, outfit.name, outfit.description, outfit.immutableFeatures]);
    const updateOutfit = useMutation({
        mutationFn: () => api.put(`/api/outfits/${outfit.id}`, draft),
        onSuccess: onChanged
    });
    const changed = JSON.stringify(draft) !== JSON.stringify(outfitToDraft(outfit));
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: outfit.name }), _jsxs("button", { disabled: !changed || !draft.name.trim() || updateOutfit.isPending, onClick: () => updateOutfit.mutate(), children: [updateOutfit.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0440\u0430\u0437"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043E\u0434\u0435\u0436\u0434\u044B", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0438\u0437\u043C\u0435\u043D\u044F\u0435\u043C\u044B\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B", _jsx("textarea", { value: draft.immutableFeatures, onChange: (event) => setDraft({ ...draft, immutableFeatures: event.target.value }) })] })] }), updateOutfit.error ? _jsx("p", { className: "warning", children: updateOutfit.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "outfit", ownerId: outfit.id, references: outfit.references, slots: outfitSlots, onChanged: onChanged })] }));
}
function outfitToDraft(outfit) {
    return {
        name: outfit.name,
        description: outfit.description,
        immutableFeatures: outfit.immutableFeatures
    };
}
function emptyStyleDraft() {
    return {
        name: "",
        description: "",
        lighting: "",
        colorPalette: "",
        linework: "",
        anatomy: "",
        faces: "",
        shading: "",
        backgroundDetail: "",
        cameraLanguage: "",
        negativeRules: ""
    };
}
function styleToDraft(style) {
    return {
        name: style.name,
        description: style.description,
        lighting: style.lighting,
        colorPalette: style.colorPalette,
        linework: style.linework,
        anatomy: style.anatomy,
        faces: style.faces,
        shading: style.shading,
        backgroundDetail: style.backgroundDetail,
        cameraLanguage: style.cameraLanguage,
        negativeRules: style.negativeRules
    };
}
export function emptySceneDraft(project) {
    return {
        name: "",
        description: "",
        locationId: project.locations[0]?.id ?? null,
        styleProfileId: project.styleProfiles[0]?.id ?? null,
        timeDescription: "",
        characterIds: []
    };
}
export function sceneToDraft(scene) {
    return {
        name: scene.name,
        description: scene.description,
        locationId: scene.locationId,
        styleProfileId: scene.styleProfileId,
        timeDescription: scene.timeDescription,
        characterIds: scene.characterIds
    };
}
export function emptyFrameDraft() {
    return {
        description: "",
        action: "",
        camera: "",
        composition: "",
        lighting: "",
        expressionNotes: "",
        continuityNotes: "",
        generationStrategy: "NEW_COMPOSITION",
        continuityEditContract: { changes: [], forbidden: [], allowedChanges: [] },
        characterIds: [],
        characterCastMode: "EXPLICIT",
        additionalCharacterReferenceIds: {},
        locationId: null,
        locationAngleId: null,
        styleProfileId: null,
        targetWidth: "1200",
        targetHeight: "675"
    };
}
export function frameToDraft(frame) {
    return {
        description: frame.description,
        action: frame.action,
        camera: frame.camera,
        composition: frame.composition,
        lighting: frame.lighting,
        expressionNotes: frame.expressionNotes,
        continuityNotes: frame.continuityNotes,
        generationStrategy: frame.generationStrategy,
        continuityEditContract: frame.continuityEditContract,
        characterIds: frame.characterIds,
        characterCastMode: frame.characterCastSource === "EXPLICIT" ? "EXPLICIT" : !frame.characterCastSource || frame.characterCastSource === "LEGACY_UNKNOWN" ? "LEGACY" : "INHERIT",
        additionalCharacterReferenceIds: frame.additionalCharacterReferenceIds,
        locationId: frame.locationId,
        locationAngleId: frame.locationAngleId,
        styleProfileId: frame.styleProfileId,
        targetWidth: frame.targetWidth ? String(frame.targetWidth) : "",
        targetHeight: frame.targetHeight ? String(frame.targetHeight) : ""
    };
}
function LocationAngleEditor({ project, angle, onChanged }) {
    const [draft, setDraft] = React.useState(locationAngleToDraft(angle));
    React.useEffect(() => setDraft(locationAngleToDraft(angle)), [angle.id, angle.name, angle.cameraPositionDescription]);
    const updateAngle = useMutation({
        mutationFn: () => api.put(`/api/location-angles/${angle.id}`, draft),
        onSuccess: onChanged
    });
    const changed = JSON.stringify(draft) !== JSON.stringify(locationAngleToDraft(angle));
    return (_jsxs("div", { className: "versionBlock", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: angle.name }), _jsxs("button", { disabled: !changed || !draft.name.trim() || updateAngle.isPending, onClick: () => updateAngle.mutate(), children: [updateAngle.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u043A\u0443\u0440\u0441\u0430", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0430\u043C\u0435\u0440\u044B", _jsx("textarea", { value: draft.cameraDescription, onChange: (event) => setDraft({ ...draft, cameraDescription: event.target.value }) })] })] }), updateAngle.error ? _jsx("p", { className: "warning", children: updateAngle.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "locationAngle", ownerId: angle.id, references: angle.references, slots: ["VIEW"], onChanged: onChanged })] }));
}
function locationAngleToDraft(angle) {
    return {
        name: angle.name,
        cameraDescription: angle.cameraPositionDescription
    };
}
export function DeleteProjectPanel({ project }) {
    const queryClient = useQueryClient();
    const clearProject = useUiStore((state) => state.clearProject);
    const [deleteFiles, setDeleteFiles] = React.useState(false);
    const [confirmationName, setConfirmationName] = React.useState("");
    const mutation = useMutation({
        mutationFn: () => api.delete(`/api/projects/${project.id}`, {
            projectId: project.id,
            deleteFiles,
            confirmationName: deleteFiles ? confirmationName : undefined
        }),
        onSuccess: () => {
            clearProject();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.removeQueries({ queryKey: ["project", project.id] });
        }
    });
    const canDelete = !deleteFiles || confirmationName === project.name;
    const submit = () => {
        const message = deleteFiles
            ? `Удалить проект "${project.name}" из списка и стереть папку проекта с диска?`
            : `Удалить проект "${project.name}" только из списка приложения? Папка проекта останется на диске.`;
        if (window.confirm(message)) {
            mutation.mutate();
        }
    };
    return (_jsxs("div", { className: "dangerZone", children: [_jsxs("div", { children: [_jsx("h3", { children: "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }), _jsx("p", { className: "muted", children: "\u0411\u0435\u0437 \u0433\u0430\u043B\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442 \u0443\u0434\u0430\u043B\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430. \u041F\u0430\u043F\u043A\u0443 \u043C\u043E\u0436\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0441\u043D\u043E\u0432\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E \u043F\u0443\u0442\u0438." })] }), _jsxs("label", { className: "checkline", children: [_jsx("input", { type: "checkbox", checked: deleteFiles, onChange: (event) => setDeleteFiles(event.target.checked) }), " \u0422\u0430\u043A\u0436\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430"] }), deleteFiles ? _jsxs("label", { children: ["\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", _jsx("input", { value: confirmationName, onChange: (event) => setConfirmationName(event.target.value), placeholder: project.name })] }) : null, mutation.error ? _jsx("p", { className: "warning", children: mutation.error.message }) : null, _jsxs("button", { className: "dangerButton", disabled: !canDelete || mutation.isPending, onClick: submit, children: [mutation.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Trash2, { size: 16 }), " \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442"] })] }));
}
export function CharactersScreen({ project, outfitsOnly = false }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedCharacterId);
    const selectCharacter = useUiStore((state) => state.selectCharacter);
    const selected = project.characters.find((character) => character.id === selectedId) ?? project.characters[0];
    const [draft, setDraft] = React.useState(emptyCharacterDraft());
    const [edit, setEdit] = React.useState(emptyCharacterDraft());
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createCharacter = useMutation({
        mutationFn: () => api.post("/api/characters", { projectId: project.id, ...draft }),
        onSuccess: (character) => {
            selectCharacter(character.id);
            setDraft(emptyCharacterDraft());
            void refresh();
        }
    });
    const updateCharacter = useMutation({
        mutationFn: () => api.put(`/api/characters/${selected?.id}`, edit),
        onSuccess: () => refresh()
    });
    const createOutfit = useMutation({
        mutationFn: (name) => api.post(`/api/characters/${selected?.id}/outfits`, { name, description: "", immutableFeatures: "" }),
        onSuccess: refresh
    });
    React.useEffect(() => {
        if (selected)
            setEdit(characterToDraft(selected));
    }, [selected?.id]);
    const hasCharacterChanges = selected ? JSON.stringify(edit) !== JSON.stringify(characterToDraft(selected)) : false;
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0438" }), project.characters.map((character) => (_jsxs("button", { className: character.id === selected?.id ? "active listButton" : "listButton", onClick: () => { selectCharacter(character.id); if (outfitsOnly)
                            useUiStore.getState().setSection("outfits"); }, children: [_jsx(User, { size: 15 }), " ", character.name] }, character.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u0418\u043C\u044F", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u0437\u0440\u0430\u0441\u0442", _jsx("input", { value: draft.age, onChange: (event) => setDraft({ ...draft, age: event.target.value }) })] }), _jsxs("label", { children: ["\u0420\u043E\u0441\u0442", _jsx("input", { value: draft.height, onChange: (event) => setDraft({ ...draft, height: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createCharacter.mutate(), children: [_jsx(User, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [outfitsOnly ? _jsxs("div", { className: "fieldStack", children: [_jsxs("h2", { children: ["\u041E\u0431\u0440\u0430\u0437\u044B \u00B7 ", selected.name] }), _jsx("p", { className: "muted", children: "\u041E\u0431\u0440\u0430\u0437\u044B \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0430\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0443. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0441\u043B\u0435\u0432\u0430 \u0434\u043B\u044F \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u0435\u0433\u043E \u043E\u0431\u0440\u0430\u0437\u0430\u043C\u0438." })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: selected.name }), _jsxs("button", { disabled: !hasCharacterChanges || !edit.name.trim() || updateCharacter.isPending, onClick: () => updateCharacter.mutate(), children: [updateCharacter.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u0418\u043C\u044F", _jsx("input", { value: edit.name, onChange: (event) => setEdit({ ...edit, name: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u0437\u0440\u0430\u0441\u0442", _jsx("input", { value: edit.age, onChange: (event) => setEdit({ ...edit, age: event.target.value }) })] }), _jsxs("label", { children: ["\u0420\u043E\u0441\u0442", _jsx("input", { value: edit.height, onChange: (event) => setEdit({ ...edit, height: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: edit.description, onChange: (event) => setEdit({ ...edit, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0422\u0435\u043B\u043E", _jsx("textarea", { value: edit.bodyDescription, onChange: (event) => setEdit({ ...edit, bodyDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u0446\u043E", _jsx("textarea", { value: edit.faceDescription, onChange: (event) => setEdit({ ...edit, faceDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u0412\u043E\u043B\u043E\u0441\u044B", _jsx("textarea", { value: edit.hairDescription, onChange: (event) => setEdit({ ...edit, hairDescription: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u0442\u043B\u0438\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438", _jsx("textarea", { value: edit.distinctiveFeatures, onChange: (event) => setEdit({ ...edit, distinctiveFeatures: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0438\u0437\u043C\u0435\u043D\u044F\u0435\u043C\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438", _jsx("textarea", { value: edit.immutableFeatures, onChange: (event) => setEdit({ ...edit, immutableFeatures: event.target.value }) })] })] }), updateCharacter.error ? _jsx("p", { className: "warning", children: updateCharacter.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "character", ownerId: selected.id, references: selected.references, slots: characterSlots, onChanged: refresh })] }), _jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u041E\u0431\u0440\u0430\u0437\u044B" }), _jsxs("button", { onClick: () => createOutfit.mutate(`Образ ${selected.outfits.length + 1}`), children: [_jsx(Box, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u043E\u0431\u0440\u0430\u0437"] })] }), selected.outfits.map((outfit) => (_jsx(OutfitEditor, { project: project, outfit: outfit, onChanged: refresh }, outfit.id)))] })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430." }) })] }));
}
export function LocationsScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedLocationId);
    const selectLocation = useUiStore((state) => state.selectLocation);
    const selected = project.locations.find((location) => location.id === selectedId) ?? project.locations[0];
    const [draft, setDraft] = React.useState({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createLocation = useMutation({
        mutationFn: () => api.post("/api/locations", { projectId: project.id, ...draft }),
        onSuccess: (location) => {
            selectLocation(location.id);
            setDraft({ name: "", description: "", architectureDescription: "", immutableFeatures: "" });
            void refresh();
        }
    });
    const createAngle = useMutation({
        mutationFn: (name) => api.post(`/api/locations/${selected?.id}/angles`, { name, description: "", cameraPositionDescription: "" }),
        onSuccess: refresh
    });
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u041B\u043E\u043A\u0430\u0446\u0438\u0438" }), project.locations.map((location) => (_jsxs("button", { className: location.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectLocation(location.id), children: [_jsx(Map, { size: 15 }), " ", location.name] }, location.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0410\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u0430", _jsx("textarea", { value: draft.architectureDescription, onChange: (event) => setDraft({ ...draft, architectureDescription: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createLocation.mutate(), children: [_jsx(Map, { size: 16 }), " \u041D\u043E\u0432\u0430\u044F \u043B\u043E\u043A\u0430\u0446\u0438\u044F"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsx("h2", { children: selected.name }), _jsx("p", { className: "muted", children: selected.architectureDescription || selected.description }), _jsx(ReferenceSlots, { project: project, ownerType: "location", ownerId: selected.id, references: selected.references, slots: locationSlots, onChanged: refresh }), _jsxs("section", { className: "sideSection", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h3", { children: "\u0420\u0430\u043A\u0443\u0440\u0441\u044B" }), _jsxs("button", { onClick: () => createAngle.mutate(`Ракурс ${selected.angles.length + 1}`), children: [_jsx(ImagePlus, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u0440\u0430\u043A\u0443\u0440\u0441"] })] }), selected.angles.map((angle) => (_jsx(LocationAngleEditor, { project: project, angle: angle, onChanged: refresh }, angle.id)))] })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u043B\u043E\u043A\u0430\u0446\u0438\u044E." }) })] }));
}
export function StylesScreen({ project }) {
    const queryClient = useQueryClient();
    const selectedId = useUiStore((state) => state.selectedStyleId);
    const selectStyle = useUiStore((state) => state.selectStyle);
    const selected = project.styleProfiles.find((style) => style.id === selectedId) ?? project.styleProfiles[0];
    const [draft, setDraft] = React.useState(emptyStyleDraft());
    const [edit, setEdit] = React.useState(emptyStyleDraft());
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    const createStyle = useMutation({
        mutationFn: () => api.post("/api/styles", { projectId: project.id, ...draft }),
        onSuccess: (style) => {
            selectStyle(style.id);
            setDraft(emptyStyleDraft());
            void refresh();
        }
    });
    const updateStyle = useMutation({
        mutationFn: () => api.put(`/api/styles/${selected?.id}`, edit),
        onSuccess: () => refresh()
    });
    React.useEffect(() => {
        if (selected)
            setEdit(styleToDraft(selected));
    }, [selected?.id]);
    const hasStyleChanges = selected ? JSON.stringify(edit) !== JSON.stringify(styleToDraft(selected)) : false;
    return (_jsxs("section", { className: "entityLayout", children: [_jsxs("div", { className: "entityList", children: [_jsx("h2", { children: "\u0421\u0442\u0438\u043B\u0438" }), project.styleProfiles.map((style) => (_jsxs("button", { className: style.id === selected?.id ? "active listButton" : "listButton", onClick: () => selectStyle(style.id), children: [_jsx(Brush, { size: 15 }), " ", style.name] }, style.id))), _jsxs("div", { className: "fieldStack", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: draft.description, onChange: (event) => setDraft({ ...draft, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { value: draft.lighting, onChange: (event) => setDraft({ ...draft, lighting: event.target.value }) })] }), _jsxs("button", { disabled: !draft.name.trim(), onClick: () => createStyle.mutate(), children: [_jsx(Brush, { size: 16 }), " \u041D\u043E\u0432\u044B\u0439 \u0441\u0442\u0438\u043B\u044C"] })] })] }), _jsx("div", { className: "entityDetail", children: selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: selected.name }), _jsxs("button", { disabled: !hasStyleChanges || !edit.name.trim() || updateStyle.isPending, onClick: () => updateStyle.mutate(), children: [updateStyle.isPending ? _jsx(Loader2, { className: "spin", size: 16 }) : _jsx(Save, { size: 16 }), " \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })] }), _jsxs("div", { className: "detailsGrid", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { value: edit.name, onChange: (event) => setEdit({ ...edit, name: event.target.value }) })] }), _jsxs("label", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", _jsx("textarea", { value: edit.description, onChange: (event) => setEdit({ ...edit, description: event.target.value }) })] }), _jsxs("label", { children: ["\u0421\u0432\u0435\u0442", _jsx("textarea", { value: edit.lighting, onChange: (event) => setEdit({ ...edit, lighting: event.target.value }) })] }), _jsxs("label", { children: ["\u041F\u0430\u043B\u0438\u0442\u0440\u0430", _jsx("textarea", { value: edit.colorPalette, onChange: (event) => setEdit({ ...edit, colorPalette: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u043D\u0438\u044F", _jsx("textarea", { value: edit.linework, onChange: (event) => setEdit({ ...edit, linework: event.target.value }) })] }), _jsxs("label", { children: ["\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u044F", _jsx("textarea", { value: edit.anatomy, onChange: (event) => setEdit({ ...edit, anatomy: event.target.value }) })] }), _jsxs("label", { children: ["\u041B\u0438\u0446\u0430", _jsx("textarea", { value: edit.faces, onChange: (event) => setEdit({ ...edit, faces: event.target.value }) })] }), _jsxs("label", { children: ["\u0428\u0435\u0439\u0434\u0438\u043D\u0433", _jsx("textarea", { value: edit.shading, onChange: (event) => setEdit({ ...edit, shading: event.target.value }) })] }), _jsxs("label", { children: ["\u0424\u043E\u043D\u044B", _jsx("textarea", { value: edit.backgroundDetail, onChange: (event) => setEdit({ ...edit, backgroundDetail: event.target.value }) })] }), _jsxs("label", { children: ["\u041A\u0430\u043C\u0435\u0440\u0430", _jsx("textarea", { value: edit.cameraLanguage, onChange: (event) => setEdit({ ...edit, cameraLanguage: event.target.value }) })] }), _jsxs("label", { children: ["\u041D\u0435\u0433\u0430\u0442\u0438\u0432\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430", _jsx("textarea", { value: edit.negativeRules, onChange: (event) => setEdit({ ...edit, negativeRules: event.target.value }) })] })] }), updateStyle.error ? _jsx("p", { className: "warning", children: updateStyle.error.message }) : null, _jsx(ReferenceSlots, { project: project, ownerType: "style", ownerId: selected.id, references: selected.references, slots: ["REF"], onChanged: refresh })] })) : _jsx("p", { className: "muted", children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0441\u0442\u0438\u043B\u044C." }) })] }));
}
