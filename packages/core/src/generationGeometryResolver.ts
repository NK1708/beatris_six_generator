import type { GenerationGeometryInput, GenerationGeometryResult } from "@bearridge/shared";

interface SupportedGeometry {
  aspectRatio: string;
  ratio: number;
  resolution: string;
  imageSize: "512" | "1K" | "2K" | "4K";
}

const geminiFlashGeometry: SupportedGeometry[] = [
  { aspectRatio: "1:1", ratio: 1, resolution: "1024x1024", imageSize: "1K" },
  { aspectRatio: "1:4", ratio: 1 / 4, resolution: "512x2048", imageSize: "1K" },
  { aspectRatio: "1:8", ratio: 1 / 8, resolution: "384x3072", imageSize: "1K" },
  { aspectRatio: "2:3", ratio: 2 / 3, resolution: "848x1264", imageSize: "1K" },
  { aspectRatio: "3:2", ratio: 3 / 2, resolution: "1264x848", imageSize: "1K" },
  { aspectRatio: "3:4", ratio: 3 / 4, resolution: "896x1200", imageSize: "1K" },
  { aspectRatio: "4:1", ratio: 4, resolution: "2048x512", imageSize: "1K" },
  { aspectRatio: "4:3", ratio: 4 / 3, resolution: "1200x896", imageSize: "1K" },
  { aspectRatio: "4:5", ratio: 4 / 5, resolution: "928x1152", imageSize: "1K" },
  { aspectRatio: "5:4", ratio: 5 / 4, resolution: "1152x928", imageSize: "1K" },
  { aspectRatio: "8:1", ratio: 8, resolution: "3072x384", imageSize: "1K" },
  { aspectRatio: "9:16", ratio: 9 / 16, resolution: "768x1376", imageSize: "1K" },
  { aspectRatio: "16:9", ratio: 16 / 9, resolution: "1376x768", imageSize: "1K" },
  { aspectRatio: "21:9", ratio: 21 / 9, resolution: "1584x672", imageSize: "1K" }
];

const geminiProGeometry: SupportedGeometry[] = [
  { aspectRatio: "1:1", ratio: 1, resolution: "1024x1024", imageSize: "1K" },
  { aspectRatio: "2:3", ratio: 2 / 3, resolution: "848x1264", imageSize: "1K" },
  { aspectRatio: "3:2", ratio: 3 / 2, resolution: "1264x848", imageSize: "1K" },
  { aspectRatio: "3:4", ratio: 3 / 4, resolution: "896x1200", imageSize: "1K" },
  { aspectRatio: "4:3", ratio: 4 / 3, resolution: "1200x896", imageSize: "1K" },
  { aspectRatio: "4:5", ratio: 4 / 5, resolution: "928x1152", imageSize: "1K" },
  { aspectRatio: "5:4", ratio: 5 / 4, resolution: "1152x928", imageSize: "1K" },
  { aspectRatio: "9:16", ratio: 9 / 16, resolution: "768x1376", imageSize: "1K" },
  { aspectRatio: "16:9", ratio: 16 / 9, resolution: "1376x768", imageSize: "1K" },
  { aspectRatio: "21:9", ratio: 21 / 9, resolution: "1584x672", imageSize: "1K" }
];

const cropThreshold = 0.02;
const manualCropThreshold = 0.05;

export class GenerationGeometryResolver {
  resolve(input: GenerationGeometryInput): GenerationGeometryResult {
    const targetAspectRatio = resolveTargetAspectRatio(input);
    if (input.provider.toLowerCase() === "openai") {
      return resolveOpenAIGeometry(targetAspectRatio);
    }
    const supported = supportedGeometryFor(input.provider, input.model);
    const closest = supported.reduce((best, candidate) => {
      const bestDifference = Math.abs(best.ratio - targetAspectRatio);
      const candidateDifference = Math.abs(candidate.ratio - targetAspectRatio);
      return candidateDifference < bestDifference ? candidate : best;
    });
    const aspectRatioDifference = Math.abs(closest.ratio - targetAspectRatio);
    const requiresCrop = aspectRatioDifference > cropThreshold;

    return {
      requestedAspectRatio: closest.aspectRatio,
      requestedResolution: closest.resolution,
      requestedImageSize: closest.imageSize,
      targetAspectRatio,
      requiresCrop,
      cropStrategy: requiresCrop ? (aspectRatioDifference > manualCropThreshold ? "MANUAL" : "CENTER") : "NONE",
      aspectRatioDifference
    };
  }
}

function resolveOpenAIGeometry(targetAspectRatio: number): GenerationGeometryResult {
  const providerRatio = Math.min(3, Math.max(1 / 3, targetAspectRatio));
  const squareLike = providerRatio >= 0.9 && providerRatio <= 1.1;
  const longEdge = squareLike ? 1024 : 1536;
  const width = providerRatio >= 1
    ? longEdge
    : roundToMultiple(longEdge * providerRatio, 16);
  const height = providerRatio >= 1
    ? roundToMultiple(longEdge / providerRatio, 16)
    : longEdge;
  const actualRatio = width / height;
  const aspectRatioDifference = Math.abs(actualRatio - targetAspectRatio);
  const requiresCrop = aspectRatioDifference > cropThreshold;

  return {
    requestedAspectRatio: reducedRatio(width, height),
    requestedResolution: `${width}x${height}`,
    requestedImageSize: "1K",
    targetAspectRatio,
    requiresCrop,
    cropStrategy: requiresCrop ? (aspectRatioDifference > manualCropThreshold ? "MANUAL" : "CENTER") : "NONE",
    aspectRatioDifference
  };
}

export function buildCompositionSafeAreaInstruction(geometry: GenerationGeometryResult): string {
  if (!geometry.requiresCrop) {
    return "";
  }

  return [
    "COMPOSITION SAFE AREA:",
    "",
    `The final image will be cropped to approximately ${formatRatio(geometry.targetAspectRatio)}:1.`,
    "",
    "Keep all essential characters, faces, hands and important props safely inside the central composition area.",
    "",
    "Allow additional environmental margin near the outer edges.",
    "",
    "Do not place critical visual information close to the frame boundaries.",
    "",
    `Planned crop strategy: ${geometry.cropStrategy}.`
  ].join("\n");
}

function resolveTargetAspectRatio(input: GenerationGeometryInput): number {
  if (input.targetWidth && input.targetHeight) {
    return input.targetWidth / input.targetHeight;
  }
  if (input.targetAspectRatio) {
    return input.targetAspectRatio;
  }
  return parseAspectRatio(input.fallbackAspectRatio);
}

function supportedGeometryFor(provider: string, _model: string): SupportedGeometry[] {
  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = _model.toLowerCase();
  if (normalizedProvider === "gemini" || normalizedProvider === "google" || normalizedProvider === "mock") {
    return normalizedModel.includes("pro-image") ? geminiProGeometry : geminiFlashGeometry;
  }
  return geminiFlashGeometry;
}

function parseAspectRatio(aspectRatio: string): number {
  const [width, height] = aspectRatio.split(":").map(Number);
  if (width && height) {
    return width / height;
  }
  const parsed = Number(aspectRatio);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16 / 9;
}

function formatRatio(value: number): string {
  return value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function reducedRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
