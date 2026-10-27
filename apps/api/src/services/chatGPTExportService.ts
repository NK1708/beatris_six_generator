import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { ContinuityEditContract, FrameGenerationReadiness, FrameGenerationReadinessDiagnostic, FrameGenerationReadinessReason, FrameGenerationStrategy, ReferenceAsset } from "@bearridge/shared";
import type { FrameContext } from "@bearridge/core";
import { projectDbManager, type ProjectContext } from "../db.js";
import { AppError } from "../errors.js";
import { loadFrameContext } from "./contextService.js";
import { previewFrameContext } from "./generationService.js";
import { resolveFrameGenerationReadinessForProject } from "./frameGenerationReadinessService.js";
import { prepareProductionGenerationContext, type PreparedProductionGenerationContext } from "./productionGenerationContext.js";
import { ProductionGenerationGate, ProductionGenerationReadinessError } from "./productionGenerationGate.js";
import { resolveProjectDirectoryForWrite, resolveProjectFileForRead, resolveProjectFileForWrite } from "./projectPathResolver.js";

export interface ChatGPTExportResult {
  exportId: string;
  fileName: string;
  buffer: Buffer;
  manifest: ChatGPTExportManifest;
  prompt: string;
}

type Ready = Extract<FrameGenerationReadiness, { status: "READY" }>;
type PreparedPreview = Awaited<ReturnType<typeof previewFrameContext>>;

export interface ChatGPTExportPreparation {
  preview: PreparedPreview;
  readiness: Ready;
  target: PreparedProductionGenerationContext;
  revalidate(): Promise<void>;
}

export interface ChatGPTExportDependencies {
  prepare(frameId: string, projectContext?: ProjectContext): Promise<ChatGPTExportPreparation>;
}

export class ManualChatGPTExportReadinessError extends AppError {
  constructor(
    code: "CHATGPT_EXPORT_BLOCKED" | "CHATGPT_EXPORT_READINESS_STALE",
    readonly reasons: [FrameGenerationReadinessReason, ...FrameGenerationReadinessReason[]],
    readonly diagnostics: [FrameGenerationReadinessDiagnostic, ...FrameGenerationReadinessDiagnostic[]]
  ) {
    super(code === "CHATGPT_EXPORT_READINESS_STALE"
      ? "ChatGPT export readiness changed while the package was being prepared."
      : "ChatGPT export is blocked by Frame readiness requirements.", 409, code);
    this.name = "ManualChatGPTExportReadinessError";
  }
}

interface ExportReference {
  order: number;
  filename: string;
  id: string;
  code: string;
  kind: ReferenceAsset["kind"];
  label?: string;
  role?: string;
  priority: number;
}

interface PortableAttachment {
  fileName: string;
  role: "AUTHORITATIVE_BASE" | "IDENTITY_REFERENCE" | "CHARACTER_REFERENCE" | "OUTFIT_REFERENCE" | "LOCATION_REFERENCE" | "LOCATION_ANGLE_REFERENCE" | "STYLE_REFERENCE" | "PROP_REFERENCE";
  assetId: string;
  subjectId?: string;
  subjectName?: string;
}

interface ChatGPTExportManifest {
  schemaVersion: 1;
  exportId: string;
  project: { id: string; name: string };
  frame: { id: string; code: string };
  exportType: "CHATGPT_IMAGE_PACKAGE";
  packageType: "CHATGPT_PORTABLE_RENDER";
  packageVersion: 1;
  uploadMode: "INDIVIDUAL_ATTACHMENTS";
  requiresConversationContext: false;
  consumer: "chatgpt-manual";
  requestedAction: "render";
  renderProtocol: RenderProtocol;
  createdAt: string;
  strategy: FrameGenerationStrategy;
  exportPolicy?: "CHATGPT_CONTINUATION_V2";
  continuityEditContract?: ContinuityEditContract;
  productionReferenceIds?: string[];
  visualReferencesActuallyExported?: string[];
  canonicalConstraints?: CanonicalConstraints;
  base?: {
    frameId: string;
    generationId: string;
    frameCode: string;
    filename: string;
  };
  geometry: {
    targetWidth: number | null;
    targetHeight: number | null;
    targetAspectRatio: number;
    requestAspectRatio: string;
    requestResolution: string;
    requiresCrop: boolean;
    cropStrategy: "NONE" | "CENTER" | "MANUAL";
  };
  references: ExportReference[];
  attachments: PortableAttachment[];
}

interface RenderProtocol {
  version: 1;
  promptPolicy: "verbatim";
  basePolicy: "authoritative" | "none";
  referencePolicy: "identity-only" | "canonical-visual-guidance";
  allowPromptRewrite: false;
  allowSceneReinterpretation: false;
}

interface CanonicalConstraints {
  characters: Array<{
    id: string;
    name: string;
    description: string;
    body: string;
    face: string;
    hair: string;
    immutableFeatures: string;
    outfit: { name: string; description: string; immutableFeatures: string } | null;
  }>;
  location: { name: string; architecture: string; immutableFeatures: string } | null;
  style: { name: string; description: string; linework: string; anatomy: string; faces: string; shading: string; negativeRules: string } | null;
}

export async function createChatGPTExport(
  frameId: string,
  createdAt = new Date(),
  dependencies: ChatGPTExportDependencies = defaultChatGPTExportDependencies
): Promise<ChatGPTExportResult> {
  const lease = projectDbManager.acquireActiveProject();
  try {
    return await createChatGPTExportInProject(lease, frameId, createdAt, dependencies);
  } finally {
    await lease.release();
  }
}

async function createChatGPTExportInProject(
  activeProject: ProjectContext,
  frameId: string,
  createdAt: Date,
  dependencies: ChatGPTExportDependencies
): Promise<ChatGPTExportResult> {
  const preparation = await dependencies.prepare(frameId, activeProject);
  const prepared = preparation.preview;
  const blockingWarnings = prepared.warnings.filter((warning) => warning.severity === "blocking");
  if (blockingWarnings.length) {
    throw new AppError(`ChatGPT export blocked: ${blockingWarnings.map((warning) => warning.message).join(" ")}`, 400, "PRODUCTION_CONTEXT_INCOMPLETE");
  }

  const { projectPath } = activeProject;
  const legacyPathOptions = activeProject.project?.rootPath ? { legacyRootPath: activeProject.project.rootPath } : {};
  const exportId = randomUUID();
  const rootName = `${prepared.context.frame.frameCode}_CHATGPT`;
  const continuation = prepared.strategy === "CONTINUE_PREVIOUS_FRAME";
  const renderProtocol = createRenderProtocol(prepared.strategy);
  const canonicalConstraints = continuation ? buildCanonicalConstraints(prepared.context) : undefined;
  const visualReferences = continuation ? selectContinuationVisualReferences(prepared.references) : prepared.references;
  if (continuation && (!prepared.baseReference || !prepared.context.previousLockedFrame)) {
    throw new AppError("ChatGPT continuation export requires a selected successful Generation from the previous locked Frame.", 400, "INVALID_CONTINUATION_BASE");
  }
  const baseFileName = continuation
    ? `02_AUTHORITATIVE_BASE_${sanitizeName(prepared.context.previousLockedFrame!.frameCode)}${safeExtension(prepared.baseReference!.filePath)}`
    : undefined;
  const exportReferences = await Promise.all(visualReferences.map(async (reference, index) => ({
    source: await resolveProjectFileForRead(projectPath, reference.filePath, legacyPathOptions),
    manifest: toExportReference(reference, index, continuation ? 3 : 2, continuation)
  })));
  const attachments: PortableAttachment[] = [
    ...(continuation ? [{
      fileName: baseFileName!,
      role: "AUTHORITATIVE_BASE" as const,
      assetId: prepared.context.previousLockedFrame!.generationId
    }] : []),
    ...exportReferences.map(({ manifest: reference }) => toPortableAttachment(reference, prepared.context, continuation))
  ];
  const manifest: ChatGPTExportManifest = {
    schemaVersion: 1,
    exportId,
    project: {
      id: prepared.context.project.id,
      name: prepared.context.project.name
    },
    frame: {
      id: prepared.context.frame.id,
      code: prepared.context.frame.frameCode
    },
    exportType: "CHATGPT_IMAGE_PACKAGE",
    packageType: "CHATGPT_PORTABLE_RENDER",
    packageVersion: 1,
    uploadMode: "INDIVIDUAL_ATTACHMENTS",
    requiresConversationContext: false,
    consumer: "chatgpt-manual",
    requestedAction: "render",
    renderProtocol,
    createdAt: createdAt.toISOString(),
    strategy: prepared.strategy,
    ...(continuation ? {
      exportPolicy: "CHATGPT_CONTINUATION_V2" as const,
      productionReferenceIds: prepared.references.map((reference) => reference.id),
      visualReferencesActuallyExported: visualReferences.map((reference) => reference.id),
      canonicalConstraints: canonicalConstraints!
    } : {}),
    ...(prepared.strategy === "CONTINUE_PREVIOUS_FRAME" ? { continuityEditContract: prepared.context.frame.continuityEditContract } : {}),
    ...(prepared.baseReference && prepared.context.previousLockedFrame ? {
      base: {
        frameId: prepared.context.previousLockedFrame.id,
        generationId: prepared.context.previousLockedFrame.generationId,
        frameCode: prepared.context.previousLockedFrame.frameCode,
        filename: baseFileName!
      }
    } : {}),
    geometry: {
      targetWidth: prepared.context.frame.targetWidth,
      targetHeight: prepared.context.frame.targetHeight,
      targetAspectRatio: prepared.geometry.targetAspectRatio,
      requestAspectRatio: prepared.geometry.requestedAspectRatio,
      requestResolution: prepared.geometry.requestedResolution,
      requiresCrop: prepared.geometry.requiresCrop,
      cropStrategy: prepared.geometry.cropStrategy
    },
    references: exportReferences.map((reference) => reference.manifest),
    attachments
  };
  const prompt = continuation
    ? buildChatGPTContinuationPrompt(manifest, prepared.context.frame.continuityEditContract, prepared.allowedContinuityChanges, canonicalConstraints!)
    : buildChatGPTNewCompositionPrompt(prepared.prompt, manifest);
  const zipEntries: Record<string, Uint8Array> = {
    [`${rootName}/00_README.txt`]: strToU8(buildPortableReadme()),
    [`${rootName}/01_CHATGPT_PROMPT.txt`]: strToU8(prompt),
    [`${rootName}/CHATGPT_INSTRUCTIONS.md`]: strToU8(buildChatGPTInstructions(prepared.strategy)),
    [`${rootName}/manifest.json`]: strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  };

  for (const reference of exportReferences) {
    zipEntries[`${rootName}/${reference.manifest.filename}`] = await fs.readFile(reference.source);
  }
  if (manifest.base && prepared.baseReference) {
    zipEntries[`${rootName}/${manifest.base.filename}`] = await fs.readFile(await resolveProjectFileForRead(projectPath, prepared.baseReference.filePath, legacyPathOptions));
  }

  const receipt = {
    exportId,
    createdAt: createdAt.toISOString(),
    renderProtocol,
    manifest,
    fullTargetPrompt: prepared.prompt,
    deltaInstructions: prepared.deltaInstructions ?? null,
    frameSnapshot: prepared.context.frame,
    storyStateSnapshot: preparation.target.targetStoryState,
    bearridgeMetadata: {
      targetStoryState: {
        revision: preparation.target.targetRevision,
        fingerprint: preparation.target.targetFingerprint,
        provenance: preparation.target.targetProvenance
      },
      selectedPredecessorGenerationId: preparation.target.selectedPredecessorGenerationId ?? null
    },
    supportingReferences: prepared.references.map((reference) => ({
      id: reference.id,
      code: reference.code,
      kind: reference.kind,
      filePath: reference.filePath,
      priority: reference.priority,
      role: reference.role ?? null
    })),
    visualReferencesActuallyExported: visualReferences.map((reference) => reference.id)
  };
  await preparation.revalidate();
  const buffer = await savePortableChatGPTPackage(projectPath, rootName, exportId, receipt, zipEntries);

  return {
    exportId,
    fileName: `${rootName}.zip`,
    buffer,
    manifest,
    prompt
  };
}

export async function savePortableChatGPTPackage(
  projectPath: string,
  rootName: string,
  exportId: string,
  receipt: object,
  zipEntries: Record<string, Uint8Array>
): Promise<Buffer> {
  zipEntries[`${rootName}/receipt.json`] = strToU8(`${JSON.stringify(receipt, null, 2)}\n`);
  const buffer = Buffer.from(zipSync(zipEntries, { level: 0 }));
  const receiptDirectory = await resolveProjectDirectoryForWrite(projectPath, "exports/chatgpt");
  await fs.mkdir(receiptDirectory, { recursive: true });
  const receiptPath = await resolveProjectFileForWrite(projectPath, `exports/chatgpt/${exportId}.json`);
  const temporaryPath = await resolveProjectFileForWrite(projectPath, `exports/chatgpt/${exportId}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(receipt, null, 2), "utf8");
    await fs.rename(temporaryPath, receiptPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  return buffer;
}

const defaultChatGPTExportDependencies: ChatGPTExportDependencies = {
  prepare: prepareManualChatGPTExport
};

export async function prepareManualChatGPTExport(
  frameId: string,
  active: ProjectContext = projectDbManager.getActiveProject()
): Promise<ChatGPTExportPreparation> {
  const gate = new ProductionGenerationGate(() => resolveFrameGenerationReadinessForProject(
    active.prisma,
    active.projectPath,
    frameId
  ));
  let readiness: Ready;
  try {
    readiness = await gate.open();
  } catch (error) {
    throw mapExportReadinessError(error);
  }
  const target = prepareProductionGenerationContext(await loadFrameContext(frameId, active), readiness);
  const preview = await previewFrameContext(target.context, active);
  return {
    preview,
    readiness,
    target,
    async revalidate() {
      try {
        await gate.revalidate(readiness);
      } catch (error) {
        throw mapExportReadinessError(error);
      }
    }
  };
}

function mapExportReadinessError(error: unknown): Error {
  if (!(error instanceof ProductionGenerationReadinessError)) return error instanceof Error ? error : new Error("Unknown export readiness error.");
  return new ManualChatGPTExportReadinessError(
    error.code === "GENERATION_READINESS_STALE" ? "CHATGPT_EXPORT_READINESS_STALE" : "CHATGPT_EXPORT_BLOCKED",
    error.reasons,
    error.diagnostics
  );
}

function toExportReference(reference: ReferenceAsset, index: number, firstNumber: number, continuation: boolean): ExportReference {
  const extension = safeExtension(reference.filePath);
  const number = String(index + firstNumber).padStart(2, "0");
  const humanName = sanitizeName(humanReadableName(reference));
  const role = continuation ? "IDENTITY_REFERENCE" : portableRoleFor(reference.kind);
  return {
    order: index + 1,
    filename: `${number}_${role}_${humanName}${extension}`,
    id: reference.id,
    code: reference.code,
    kind: reference.kind,
    ...(reference.label ? { label: reference.label } : {}),
    ...(reference.role ? { role: reference.role } : {}),
    priority: reference.priority
  };
}

function humanReadableName(reference: ReferenceAsset): string {
  if (!reference.label) return reference.code;
  const withoutCode = reference.label.replace(reference.code, "");
  const withoutKindPrefix = withoutCode.replace(/^(Character|Outfit|Location Angle|Location|Style|Previous Frame):\s*/iu, "");
  return withoutKindPrefix.replace(/[\s/]+$/u, "") || reference.code;
}

function portableRoleFor(kind: ReferenceAsset["kind"]): PortableAttachment["role"] {
  if (kind === "character") return "CHARACTER_REFERENCE";
  if (kind === "outfit") return "OUTFIT_REFERENCE";
  if (kind === "location") return "LOCATION_REFERENCE";
  if (kind === "location-angle") return "LOCATION_ANGLE_REFERENCE";
  if (kind === "style") return "STYLE_REFERENCE";
  return "PROP_REFERENCE";
}

function toPortableAttachment(reference: ExportReference, context: FrameContext, continuation: boolean): PortableAttachment {
  const character = reference.kind === "character"
    ? context.characters?.find((candidate) => candidate.references?.some((item) => item.id === reference.id))
    : undefined;
  return {
    fileName: reference.filename,
    role: continuation ? "IDENTITY_REFERENCE" : portableRoleFor(reference.kind),
    assetId: reference.id,
    ...(character ? { subjectId: character.id, subjectName: character.name } : {})
  };
}

function buildChatGPTNewCompositionPrompt(originalPrompt: string, manifest: ChatGPTExportManifest): string {
  const referenceList = manifest.references.flatMap((reference) => [
    `${reference.order}. ${reference.filename}`,
    `   Kind: ${reference.kind}`,
    `   Role: ${reference.role ?? "Visual reference."}`,
    ""
  ]);
  const target = manifest.geometry.targetWidth && manifest.geometry.targetHeight
    ? `Canonical frame target: ${manifest.geometry.targetWidth}x${manifest.geometry.targetHeight}.`
    : "";
  const specification = [
    "# ORIGINAL BEARRIDGE PRODUCTION PROMPT",
    "",
    originalPrompt
  ];
  return [
    portableBootstrap(manifest),
    "",
    renderProtocolHeader("NEW_COMPOSITION"),
    "",
    "# Bearridge - ChatGPT Image Generation Package",
    "",
    "Generate one image using the production specification below.",
    "",
    "The attached images are canonical references. Treat them according to their semantic roles.",
    "",
    `Target output aspect ratio: ${manifest.geometry.requestAspectRatio}. Exact pixel dimensions are not guaranteed.`,
    target,
    "",
    "## Reference order",
    "",
    ...referenceList,
    "## Instructions",
    "",
    "- Follow the production specification below.",
    "- Character references define canonical identity.",
    "- Outfit references define canonical clothing.",
    "- Location references define canonical architecture and furniture.",
    "- Location-angle references define viewpoint and spatial arrangement.",
    "- Style references define visual style only and must not be treated as sources of characters, props, architecture, or scene content.",
    "- Do not redesign canonical assets unless explicitly instructed by the production specification.",
    "- Generate a single image.",
    "- Do not explain the result in text.",
    "",
    "---",
    "",
    ...specification
  ].join("\n");
}

function buildChatGPTContinuationPrompt(
  manifest: ChatGPTExportManifest,
  contract: ContinuityEditContract,
  allowedChanges: string[],
  constraints: CanonicalConstraints
): string {
  const referenceList = manifest.references.flatMap((reference) => [
    `${reference.order}. ${reference.filename}`,
    `   Role: ${reference.role ?? "Character identity constraint."}`,
    ""
  ]);
  const characterConstraints = constraints.characters.flatMap((character) => [
    `- Preserve ${character.name}'s canonical identity using the supplied character reference.`,
    ...canonicalFacts(character),
    ...(character.outfit ? [
      `- Preserve the currently established ${character.outfit.name} visible in the base image.`,
      ...prefixedFacts("Outfit", [character.outfit.description, character.outfit.immutableFeatures])
    ] : [])
  ]);
  const canonicalRules = [
    ...characterConstraints,
    ...(constraints.location ? [
      `- Preserve the ${constraints.location.name} geometry, furniture, camera, composition and environment visible in the base image.`,
      ...prefixedFacts("Location", [constraints.location.architecture, constraints.location.immutableFeatures])
    ] : []),
    ...(constraints.style ? [
      `- Preserve exactly the ${constraints.style.name} rendering style and abstraction level visible in the base image.`,
      ...prefixedFacts("Style", [constraints.style.description, constraints.style.linework, constraints.style.anatomy, constraints.style.faces, constraints.style.shading]),
      ...prefixedFacts("Style negative rule", [constraints.style.negativeRules])
    ] : [])
  ];
  return [
    portableBootstrap(manifest),
    "",
    renderProtocolHeader("CONTINUE_PREVIOUS_FRAME"),
    "",
    "# CONTINUATION EDIT",
    "",
    "EDIT THE PROVIDED BASE IMAGE.",
    "",
    "The base image is authoritative. Do not recreate, reinterpret or redesign the scene.",
    "",
    "## BASE IMAGE",
    manifest.base?.filename ?? "Missing base image",
    "",
    "## VISUAL IDENTITY REFERENCES",
    ...referenceList,
    "## CHANGE ONLY",
    ...listOrNone(contract.changes),
    "",
    "## ALLOWED CHANGE CATEGORIES",
    ...listOrNone(allowedChanges),
    "",
    "## CANONICAL CONSTRAINTS",
    ...(canonicalRules.length ? canonicalRules : ["- None specified."]),
    "",
    "## EVERYTHING ELSE MUST REMAIN VISUALLY UNCHANGED",
    "- Character positions, poses and expressions unless explicitly changed.",
    "- Camera and framing.",
    "- Room geometry, architecture and furniture.",
    "- Unchanged props.",
    "- Lighting, shadows and palette.",
    "- Rendering style and abstraction level.",
    "",
    "MATCH THE BASE IMAGE'S ABSTRACTION LEVEL.",
    "Do not increase facial, anatomy, clothing, line, shading or environmental detail.",
    "Do not make the image brighter, darker, more saturated, more realistic, or more dimensional unless explicitly allowed.",
    "",
    "## FORBIDDEN",
    ...listOrNone(contract.forbidden),
    "",
    "Everything not explicitly listed under CHANGE ONLY must remain visually unchanged.",
    "Do not add, remove or reposition anything outside the explicitly requested changes.",
    "Generate a single edited image and do not explain the result in text."
  ].join("\n");
}

function portableBootstrap(manifest: ChatGPTExportManifest): string {
  const continuation = manifest.strategy === "CONTINUE_PREVIOUS_FRAME";
  const attachmentRoles = manifest.attachments.flatMap((attachment) => [
    attachment.fileName,
    `ROLE: ${attachment.role}`,
    ...(attachment.subjectName ? [`SUBJECT: ${attachment.subjectName}`] : []),
    ""
  ]);
  const modeRules = continuation ? [
    `The attached file named ${manifest.base!.filename} is the image to modify.`,
    "Files whose names contain IDENTITY_REFERENCE are visual identity references only.",
    "",
    `Perform an image edit of ${manifest.base!.filename}.`,
    "Do not create a new composition from scratch.",
    "Do not redesign or reinterpret unchanged parts of the base image.",
    "Do not use the identity references as composition references.",
    "Preserve everything in the AUTHORITATIVE_BASE image unless the RENDER INSTRUCTION explicitly requests that it change."
  ] : [
    "Create a new image composition from the Bearridge render instruction below.",
    "The attached reference images are canonical visual guidance only according to their listed roles.",
    "Do not invent scene content beyond the RENDER INSTRUCTION.",
    "Do not use unrelated conversation context."
  ];
  return [
    "BEARRIDGE PORTABLE RENDER REQUEST",
    "",
    `MODE: ${manifest.strategy}`,
    "REQUIRES_CONVERSATION_CONTEXT: FALSE",
    "",
    ...modeRules,
    "",
    "ATTACHMENT ROLES",
    "",
    ...attachmentRoles,
    "RENDER INSTRUCTION"
  ].join("\n");
}

function buildPortableReadme(): string {
  return [
    "BEARRIDGE CHATGPT MANUAL RENDER",
    "",
    "1. Open a NEW ChatGPT conversation.",
    "2. Upload every image file from this package individually.",
    "3. Do NOT upload the ZIP itself.",
    "4. Open 01_CHATGPT_PROMPT.txt.",
    "5. Copy its entire contents into ChatGPT without modification.",
    "6. Send the message.",
    "7. Import the resulting image back into Bearridge.",
    "",
    "manifest.json and receipt.json do not need to be uploaded to ChatGPT."
  ].join("\n");
}

function createRenderProtocol(strategy: FrameGenerationStrategy): RenderProtocol {
  return {
    version: 1,
    promptPolicy: "verbatim",
    basePolicy: strategy === "CONTINUE_PREVIOUS_FRAME" ? "authoritative" : "none",
    referencePolicy: strategy === "CONTINUE_PREVIOUS_FRAME" ? "identity-only" : "canonical-visual-guidance",
    allowPromptRewrite: false,
    allowSceneReinterpretation: false
  };
}

function renderProtocolHeader(strategy: FrameGenerationStrategy): string {
  const protocol = createRenderProtocol(strategy);
  return [
    "BEARRIDGE_RENDER_REQUEST",
    `MODE: ${strategy}`,
    "PROMPT_POLICY: VERBATIM",
    `BASE_POLICY: ${protocol.basePolicy.toUpperCase()}`,
    `REFERENCE_POLICY: ${protocol.referencePolicy.replaceAll("-", "_").toUpperCase()}`,
    "ALLOW_PROMPT_REWRITE: FALSE",
    "ALLOW_SCENE_REINTERPRETATION: FALSE"
  ].join("\n");
}

function buildChatGPTInstructions(strategy: FrameGenerationStrategy): string {
  const modeRules = strategy === "CONTINUE_PREVIOUS_FRAME" ? [
    "## CONTINUATION MODE",
    "",
    "- The image whose filename contains AUTHORITATIVE_BASE is the AUTHORITATIVE VISUAL BASE.",
    "- Preserve the base image's environment, geometry, camera, composition, palette, lighting and rendering style.",
    "- Images whose filenames contain IDENTITY_REFERENCE are supporting identity constraints only.",
    "- Reference images must not replace or reinterpret the composition or environment of the base image.",
    "- Apply exactly the changes specified under CHANGE ONLY.",
    "- Respect every rule under FORBIDDEN.",
    "- Everything not explicitly requested to change must remain visually unchanged."
  ] : [
    "## NEW COMPOSITION MODE",
    "",
    "- This package has no authoritative base image.",
    "- Exported image attachments are canonical visual guidance according to their roles in 01_CHATGPT_PROMPT.txt.",
    "- Do not invent or add scene content beyond 01_CHATGPT_PROMPT.txt.",
    "- Do not use unrelated conversation context to alter the requested composition."
  ];
  return [
    "# BEARRIDGE CHATGPT RENDER PROTOCOL",
    "",
    "This package is an executable image-generation specification.",
    "",
    "## REQUIRED BEHAVIOR",
    "",
    "- Use 01_CHATGPT_PROMPT.txt as the renderer instruction.",
    "- Do not rewrite, summarize, improve, expand or reinterpret it.",
    "- Do not invent scene details.",
    "- Do not add objects, furniture, decorations, characters, architecture or lighting unless explicitly requested by 01_CHATGPT_PROMPT.txt.",
    "- Do not use unrelated conversation context to redesign the image.",
    "- Use only the visual inputs and instructions provided by this package for the render.",
    "",
    ...modeRules,
    "",
    "## PROMPT POLICY",
    "",
    "01_CHATGPT_PROMPT.txt MUST BE USED AS WRITTEN.",
    "",
    "Do not create an alternative renderer prompt from its contents.",
    "Do not embellish the scene.",
    "",
    ...(strategy === "CONTINUE_PREVIOUS_FRAME" ? [
      "If an explicit CHANGE ONLY instruction requires a difference from the base image, apply that change while preserving everything else."
    ] : [])
  ].join("\n");
}

function selectContinuationVisualReferences(references: ReferenceAsset[]): ReferenceAsset[] {
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  return references.filter((reference) => {
    if (reference.kind !== "character") return false;
    const fileIdentity = path.normalize(reference.filePath).toLowerCase();
    if (seenIds.has(reference.id) || seenFiles.has(fileIdentity)) return false;
    seenIds.add(reference.id);
    seenFiles.add(fileIdentity);
    return true;
  });
}

function buildCanonicalConstraints(context: FrameContext): CanonicalConstraints {
  const selectedIds = new Set(context.frame.effectiveCharacterIds ?? context.frame.characterIds);
  const characters = context.characters.filter((character) => selectedIds.has(character.id)).map((character) => {
    const outfit = character.outfits.find((candidate) => candidate.id === context.storyState.characters[character.id]?.outfitId);
    return {
      id: character.id,
      name: character.name,
      description: character.description,
      body: character.bodyDescription,
      face: character.faceDescription,
      hair: character.hairDescription,
      immutableFeatures: character.immutableFeatures,
      outfit: outfit ? { name: outfit.name, description: outfit.description, immutableFeatures: outfit.immutableFeatures } : null
    };
  });
  return {
    characters,
    location: context.location ? {
      name: context.location.name,
      architecture: context.location.architectureDescription,
      immutableFeatures: context.location.immutableFeatures
    } : null,
    style: context.styleProfile ? {
      name: context.styleProfile.name,
      description: context.styleProfile.description,
      linework: context.styleProfile.linework,
      anatomy: context.styleProfile.anatomy,
      faces: context.styleProfile.faces,
      shading: context.styleProfile.shading,
      negativeRules: context.styleProfile.negativeRules
    } : null
  };
}

function canonicalFacts(character: CanonicalConstraints["characters"][number]): string[] {
  return prefixedFacts("Canonical", [character.description, character.body, character.face, character.hair, character.immutableFeatures]);
}

function prefixedFacts(prefix: string, values: string[]): string[] {
  return values.filter((value) => value.trim()).map((value) => `- ${prefix}: ${value.trim()}`);
}

function listOrNone(values: string[] | undefined): string[] {
  return values?.length ? values.map((value) => `- ${value}`) : ["- None specified."];
}

function sanitizeName(value: string): string {
  const sanitized = value.normalize("NFKD").toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "");
  return (sanitized || "REFERENCE").slice(0, 96);
}

function safeExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return /^\.(png|jpe?g|webp)$/u.test(extension) ? extension : ".img";
}
