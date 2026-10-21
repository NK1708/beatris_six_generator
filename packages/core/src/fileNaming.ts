import type { GenerationType } from "@bearridge/shared";

export function frameCode(sceneSequence: number, frameSequence: number): string {
  return `S${sceneSequence.toString().padStart(3, "0")}_F${frameSequence.toString().padStart(3, "0")}`;
}

export function generationFileName(code: string, generationSequence: number, generationType: GenerationType, extension = "png"): string {
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase();
  const suffix = generationType === "EDIT" || generationType === "REPAIR" ? "_EDIT" : "";
  return `${code}${suffix}_G${generationSequence.toString().padStart(3, "0")}.${normalizedExtension}`;
}

export function lockedFrameFileName(code: string, extension = "png"): string {
  return `${code}_LOCKED.${extension.replace(/^\./, "").toLowerCase()}`;
}

export function referenceVersionCode(prefix: string, slug: string, version: number): string {
  return `${prefix}_${slug.toUpperCase().replace(/-/g, "_")}_V${version}`;
}
