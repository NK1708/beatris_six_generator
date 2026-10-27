export function projectFileUrl(project, relativePath) {
    const encodedPath = relativePath.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/");
    return `/api/projects/${encodeURIComponent(project.id)}/files/${encodedPath}`;
}
export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}
export function environmentLabel(key) {
    const labels = {
        mainLight: "Основной свет",
        curtains: "Шторы",
        window: "Окно",
        door: "Дверь"
    };
    return labels[key] ?? key;
}
export function referenceKindLabel(kind) {
    const labels = {
        character: "персонаж",
        outfit: "образ",
        location: "локация",
        "location-angle": "ракурс локации",
        style: "стиль",
        prop: "реквизит",
        "previous-frame": "предыдущий кадр"
    };
    return labels[kind] ?? kind;
}
export function emptyState(sceneId) {
    return {
        sceneId,
        time: { description: "" },
        environment: {},
        characters: {},
        props: {},
        storyFacts: []
    };
}
export function splitList(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}
export function splitLines(value) {
    return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}
export function toPositiveNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}
export function parseRatio(value) {
    const [width, height] = value.split(":").map(Number);
    return width && height ? width / height : 16 / 9;
}
