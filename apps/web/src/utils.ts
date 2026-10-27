import type { StoryStateDocument } from "@bearridge/shared";
import type { Project } from "./model.js";
export function projectFileUrl(project: Project, relativePath: string): string {
  const encodedPath = relativePath.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/");
  return `/api/projects/${encodeURIComponent(project.id)}/files/${encodedPath}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function environmentLabel(key: string): string {
  const labels: Record<string, string> = {
    mainLight: "Основной свет",
    curtains: "Шторы",
    window: "Окно",
    door: "Дверь"
  };
  return labels[key] ?? key;
}

export function referenceKindLabel(kind: string): string {
  const labels: Record<string, string> = {
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

export function emptyState(sceneId: string): StoryStateDocument {
  return {
    sceneId,
    time: { description: "" },
    environment: {},
    characters: {},
    props: {},
    storyFacts: []
  };
}

export function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

export function toPositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

export function parseRatio(value: string): number {
  const [width, height] = value.split(":").map(Number);
  return width && height ? width / height : 16 / 9;
}
