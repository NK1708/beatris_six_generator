import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { resolveFrameGenerationReadiness } from "@bearridge/core";
import { initSqliteSchema } from "./services/sqliteSchema.js";
import { resolveFrameGenerationReadinessForProject } from "./services/frameGenerationReadinessService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Frame generation readiness server adapter", () => {
  it("returns READY for NEW_COMPOSITION without requiring predecessor or visual base", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture, 1, "NEW_COMPOSITION");
      await createTarget(fixture.prisma, frame.id, 4);
      const result = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      expect(result).toMatchObject({ status: "READY", mode: "NEW_COMPOSITION", targetRevision: 4 });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns READY for CONTINUE with the selected LOCKED Generation snapshot and readable image", async () => {
    const fixture = await createFixture();
    try {
      const { frame, selected } = await createValidContinuation(fixture);
      const result = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      expect(result).toMatchObject({
        status: "READY",
        mode: "CONTINUE_PREVIOUS_FRAME",
        selectedPredecessorGenerationId: selected.id,
        continuityBaseline: { generationId: selected.id }
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("blocks a missing physical visual base", async () => {
    const fixture = await createFixture();
    try {
      const { frame } = await createValidContinuation(fixture, false);
      const result = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      expect(result).toMatchObject({ status: "BLOCKED", reasons: ["VISUAL_BASE_FILE_UNAVAILABLE"] });
      expect(JSON.stringify(result)).not.toContain(fixture.directory);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("does not fall back to the latest SUCCESS Generation when selection is absent", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture, 1, "NEW_COMPOSITION", null, "LOCKED");
      await createGeneration(fixture.prisma, predecessor.id, "latest.png");
      const frame = await createFrame(fixture, 2, "CONTINUE_PREVIOUS_FRAME", predecessor.id);
      await createTarget(fixture.prisma, frame.id);
      const result = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      expect(result).toMatchObject({ status: "BLOCKED", reasons: ["PREDECESSOR_SELECTION_MISSING"] });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("does not initialize or mutate persisted target and Generation snapshot", async () => {
    const fixture = await createFixture();
    try {
      const legacy = await createFrame(fixture, 1, "NEW_COMPOSITION");
      const missing = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, legacy.id);
      expect(missing).toMatchObject({ status: "BLOCKED", reasons: ["TARGET_NOT_INITIALIZED"] });
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);

      const { frame, selected } = await createValidContinuation(fixture, true, 2);
      const targetBefore = await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } });
      const generationBefore = await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } });
      await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).toEqual(targetBefore);
      expect(await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } })).toEqual(generationBefore);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("agrees with the pure resolver for the same assembled facts", async () => {
    const fixture = await createFixture();
    try {
      const { frame, predecessor, selected } = await createValidContinuation(fixture);
      const adapterResult = await resolveFrameGenerationReadinessForProject(fixture.prisma, fixture.directory, frame.id);
      const pureResult = resolveFrameGenerationReadiness({
        mode: "CONTINUE_PREVIOUS_FRAME",
        frame: { id: frame.id, status: "DRAFT", previousFrameId: predecessor.id },
        target: { status: "AVAILABLE", document: state(fixture.sceneId), revision: 1, provenance: { origin: "EXPLICIT" } },
        predecessorExists: true,
        continuityBaseline: {
          status: "AVAILABLE",
          frameId: predecessor.id,
          generationId: selected.id,
          storyState: state(fixture.sceneId),
          visualBase: { generationId: selected.id, filePath: selected.outputFilePath }
        },
        physicalVisualBase: { status: "AVAILABLE", generationId: selected.id }
      });
      expect(adapterResult).toEqual(pureResult);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });
});

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-readiness-"));
  temporaryDirectories.push(directory);
  await fs.mkdir(path.join(directory, "generations"), { recursive: true });
  const databaseUrl = `file:${path.join(directory, "project.sqlite").replaceAll("\\", "/")}`;
  await initSqliteSchema(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const project = await prisma.project.create({ data: { name: "Readiness", slug: "readiness", rootPath: directory } });
  const scene = await prisma.scene.create({ data: { projectId: project.id, sequence: 1, name: "Scene" } });
  await prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id)) } });
  return { prisma, directory, sceneId: scene.id };
}

async function createFrame(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  sequence: number,
  generationStrategy: "NEW_COMPOSITION" | "CONTINUE_PREVIOUS_FRAME",
  previousFrameId: string | null = null,
  status = "DRAFT"
) {
  return fixture.prisma.frame.create({
    data: { sceneId: fixture.sceneId, sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`, generationStrategy, previousFrameId, status }
  });
}

async function createTarget(prisma: PrismaClient, frameId: string, revision = 1) {
  const frame = await prisma.frame.findUniqueOrThrow({ where: { id: frameId }, select: { sceneId: true } });
  return prisma.frameStoryState.create({
    data: { frameId, document: JSON.stringify(state(frame.sceneId)), originType: "EXPLICIT", revision }
  });
}

async function createGeneration(prisma: PrismaClient, frameId: string, outputFilePath: string, status = "SUCCESS") {
  const frame = await prisma.frame.findUniqueOrThrow({ where: { id: frameId }, select: { sceneId: true } });
  return prisma.generation.create({
    data: {
      frameId, provider: "test", model: "test", prompt: "test", status, outputFilePath,
      resolution: "1K", aspectRatio: "16:9", storyStateSnapshot: JSON.stringify(state(frame.sceneId)), frameSnapshot: "{}"
    }
  });
}

async function createValidContinuation(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  writeImage = true,
  firstSequence = 1
) {
  const predecessor = await createFrame(fixture, firstSequence, "NEW_COMPOSITION", null, "LOCKED");
  const outputFilePath = `generations/base-${firstSequence}.png`;
  const selected = await createGeneration(fixture.prisma, predecessor.id, outputFilePath);
  await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
  if (writeImage) {
    await fs.writeFile(path.join(fixture.directory, outputFilePath), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  const frame = await createFrame(fixture, firstSequence + 1, "CONTINUE_PREVIOUS_FRAME", predecessor.id);
  await createTarget(fixture.prisma, frame.id);
  return { frame, predecessor, selected };
}

function state(sceneId: string) {
  return { sceneId, time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: [] };
}
