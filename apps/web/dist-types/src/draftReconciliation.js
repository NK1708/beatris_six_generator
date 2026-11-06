export function equalDrafts(a, b) {
    const ordered = (value) => {
        if (Array.isArray(value))
            return value.map(ordered);
        if (value && typeof value === "object")
            return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
        return value;
    };
    return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
// Rebase only fields acknowledged by this save. Input entered after submission
// stays local; Cast fields form one selection and must move together.
export function reconcileFrameDraft(submitted, current, saved) {
    const next = { ...saved };
    for (const key of Object.keys(current)) {
        if (JSON.stringify(current[key]) !== JSON.stringify(submitted[key]))
            Object.assign(next, { [key]: current[key] });
    }
    const castKeys = ["characterCastMode", "characterIds", "additionalCharacterReferenceIds"];
    if (castKeys.some(key => JSON.stringify(current[key]) !== JSON.stringify(submitted[key]))) {
        for (const key of castKeys)
            Object.assign(next, { [key]: current[key] });
    }
    return next;
}
