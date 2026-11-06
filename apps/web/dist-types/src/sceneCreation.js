// Creation uses optional IDs. Updates keep the original nullable SceneDraft
// contract, where null explicitly removes an existing association.
export function sceneCreateFields(draft) {
    const { locationId, styleProfileId, ...fields } = draft;
    return { ...fields, ...(locationId ? { locationId } : {}), ...(styleProfileId ? { styleProfileId } : {}) };
}
