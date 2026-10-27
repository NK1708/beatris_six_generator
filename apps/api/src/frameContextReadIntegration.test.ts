import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PromptBuilder } from "@bearridge/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadFrameContextFromPrisma,
  resolveFrameContextContinuityBaseline
} from "./services/contextService.js";
import { initSqliteSchema } from "./services/sqliteSchema.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("read-only FrameContext Story State integration", () => {
  it("exposes an AVAILABLE persisted target without replacing legacy live Scene state", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const target = await fixture.prisma.frameStoryState.create({
        data: {
          frameId: frame.id,
          document: JSON.stringify(state(fixture.sceneId, "target-state")),
          originType: "EXPLICIT",
          revision: 3
        }
      });

      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);

      expect(context.frameTargetStoryState).toMatchObject({
        status: "AVAILABLE",
        document: state(fixture.sceneId, "target-state"),
        revision: 3,
        provenance: { origin: "EXPLICIT" }
      });
      expect(context.sceneCurrentStoryState).toEqual(state(fixture.sceneId, "live-scene"));
      expect(context.storyState).toEqual(state(fixture.sceneId, "live-scene"));
      expect(new PromptBuilder().build(context, [])).toContain("position: live-scene");
      expect(new PromptBuilder().build(context, [])).not.toContain("target-state");
      expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns explicit MISSING for a legacy Frame without creating or changing records", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const sceneBefore = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.frameTargetStoryState).toEqual({ status: "MISSING", frameId: frame.id, legacy: true });
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
      expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneBefore);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("represents invalid persisted JSON without falling back or mutating it", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const target = await fixture.prisma.frameStoryState.create({
        data: { frameId: frame.id, document: "not-json", originType: "EXPLICIT", revision: 4 }
      });
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.frameTargetStoryState).toMatchObject({
        status: "INVALID",
        frameId: frame.id,
        code: "TARGET_INVALID"
      });
      expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("exposes a baseline from the selected SUCCESS Generation of a LOCKED predecessor", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      const selected = await createGeneration(fixture.prisma, predecessor.id, "selected", state(fixture.sceneId, "locked-snapshot"), "generations/base.png");
      await createGeneration(fixture.prisma, predecessor.id, "latest", state(fixture.sceneId, "latest-snapshot"), "generations/latest.png");
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2, "DRAFT", predecessor.id);
      const snapshotBefore = selected.storyStateSnapshot;

      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);

      expect(context.continuityBaseline).toMatchObject({
        status: "AVAILABLE",
        frameId: predecessor.id,
        generationId: selected.id,
        storyState: state(fixture.sceneId, "locked-snapshot")
      });
      expect(context.previousLockedStoryState).toEqual(state(fixture.sceneId, "locked-snapshot"));
      expect(context.previousStoryState).toEqual(state(fixture.sceneId, "locked-snapshot"));
      expect(context.previousLockedFrame).toMatchObject({ generationId: selected.id, outputFilePath: "generations/base.png" });
      expect((await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } })).storyStateSnapshot).toBe(snapshotBefore);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("keeps REVIEW predecessor outside both locked baseline and legacy previous fields", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "REVIEW");
      await createGeneration(fixture.prisma, predecessor.id, "success", state(fixture.sceneId, "review"), "generations/review.png");
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2, "DRAFT", predecessor.id);
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.continuityBaseline).toMatchObject({ status: "UNAVAILABLE", reason: "NOT_LOCKED" });
      expect(context.previousLockedStoryState).toBeUndefined();
      expect(context.previousStoryState).toBeUndefined();
      expect(context.previousLockedFrame).toBeUndefined();
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("does not fall back to latest SUCCESS when a LOCKED predecessor has no selection", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      await createGeneration(fixture.prisma, predecessor.id, "latest", state(fixture.sceneId, "latest"), "generations/latest.png");
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2, "DRAFT", predecessor.id);
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.continuityBaseline).toMatchObject({ status: "UNAVAILABLE", reason: "NO_SELECTION" });
      expect(context.previousStoryState).toBeUndefined();
      expect(context.previousLockedFrame).toBeUndefined();
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("reports an invalid selected predecessor snapshot without changing legacy parsing behavior", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      const selected = await createGeneration(fixture.prisma, predecessor.id, "selected", "not-json", "generations/base.png");
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2, "DRAFT", predecessor.id);
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.continuityBaseline).toMatchObject({ status: "UNAVAILABLE", reason: "INVALID_SNAPSHOT" });
      expect(context.previousLockedStoryState).toBeUndefined();
      expect(context.previousStoryState).toBeUndefined();
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("keeps legacy previousStoryState while reporting a missing visual base", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      const selected = await createGeneration(fixture.prisma, predecessor.id, "selected", state(fixture.sceneId, "snapshot"), "");
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2, "DRAFT", predecessor.id);
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.continuityBaseline).toMatchObject({ status: "UNAVAILABLE", reason: "MISSING_VISUAL_BASE" });
      expect(context.previousLockedStoryState).toBeUndefined();
      expect(context.previousStoryState).toEqual(state(fixture.sceneId, "snapshot"));
      expect(context.previousLockedFrame).toBeUndefined();
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("reports visual-base Generation mismatch through the context adapter", () => {
    const baseline = resolveFrameContextContinuityBaseline({
      id: "frame-1",
      status: "LOCKED",
      selectedGenerationId: "selected",
      generations: [{ id: "selected", status: "SUCCESS", storyStateSnapshot: state("scene", "snapshot") }]
    }, {
      generationId: "other",
      filePath: "generations/other.png"
    });
    expect(baseline).toMatchObject({ status: "UNAVAILABLE", reason: "VISUAL_BASE_GENERATION_MISMATCH" });
  });

  it.each(["EXPLICIT", "INHERITED_SCENE"])("keeps a %s empty cast empty instead of applying Scene fallback", async (source) => {
    const fixture = await createFixture();
    try {
      const project = await fixture.prisma.scene.findUniqueOrThrow({ where: { id: fixture.sceneId }, select: { projectId: true } });
      const character = await fixture.prisma.character.create({ data: { projectId: project.projectId, name: "Visible only in scene", slug: `scene-${source.toLowerCase()}` } });
      await fixture.prisma.sceneCharacter.create({ data: { sceneId: fixture.sceneId, characterId: character.id, order: 1 } });
      const frame = await fixture.prisma.frame.create({ data: { sceneId: fixture.sceneId, sequence: 1, frameCode: "S001_F001", characterCastSource: source } });
      const context = await loadFrameContextFromPrisma(fixture.prisma, frame.id);
      expect(context.frame.characterIds).toEqual([]);
      expect(context.frame.effectiveCharacterIds).toEqual([]);
      expect(new PromptBuilder().build(context, [])).not.toContain("Visible only in scene:");
    } finally { await fixture.prisma.$disconnect(); }
  });
});

async function createFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-context-read-"));
  temporaryDirectories.push(directory);
  const databaseUrl = `file:${path.join(directory, "project.sqlite").replaceAll("\\", "/")}`;
  await initSqliteSchema(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const project = await prisma.project.create({ data: { name: "Context", slug: "context", rootPath: directory } });
  const scene = await prisma.scene.create({ data: { projectId: project.id, sequence: 1, name: "Scene" } });
  await prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id, "live-scene")) } });
  return { prisma, sceneId: scene.id };
}

async function createFrame(
  prisma: PrismaClient,
  sceneId: string,
  sequence: number,
  status = "DRAFT",
  previousFrameId: string | null = null
) {
  return prisma.frame.create({
    data: {
      sceneId,
      sequence,
      frameCode: `S001_F${String(sequence).padStart(3, "0")}`,
      status,
      previousFrameId
    }
  });
}

async function createGeneration(
  prisma: PrismaClient,
  frameId: string,
  suffix: string,
  snapshot: unknown,
  outputFilePath: string
) {
  return prisma.generation.create({
    data: {
      frameId,
      provider: "test",
      model: "test",
      prompt: suffix,
      status: "SUCCESS",
      outputFilePath,
      resolution: "1536x864",
      aspectRatio: "16:9",
      storyStateSnapshot: typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot),
      frameSnapshot: "{}"
    }
  });
}

function state(sceneId: string, position: string) {
  return {
    sceneId,
    time: { description: "day" },
    environment: { position },
    characters: {},
    props: {},
    storyFacts: [position]
  };
}
