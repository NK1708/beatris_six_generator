import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { initSqliteSchema } from "./services/sqliteSchema.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("FrameStoryState persistence migration", () => {
  it("keeps the optional relation empty without changing existing records or Generation snapshots", async () => {
    const fixture = await createLegacyFixture();
    try {
      const before = await legacyFingerprint(fixture.prisma);
      expect(await tableExists(fixture.prisma, "FrameStoryState")).toBe(true);
      await initSqliteSchema(fixture.databaseUrl);

      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
      expect(await legacyFingerprint(fixture.prisma)).toEqual(before);
      expect(await fixture.prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")).toEqual([]);
      await expect(fixture.prisma.frame.findUnique({
        where: { id: fixture.legacyFrameId },
        include: { targetStoryState: true }
      })).resolves.toMatchObject({ id: fixture.legacyFrameId, targetStoryState: null });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("enforces one-to-one, foreign-key, defaults, nullable provenance, and one-way cascade semantics", async () => {
    const fixture = await createLegacyFixture();
    try {
      const testFrame = await fixture.prisma.frame.create({
        data: { sceneId: fixture.sceneId, sequence: 2, frameCode: "S001_F002" }
      });
      const created = await fixture.prisma.frameStoryState.create({
        data: {
          frameId: testFrame.id,
          document: JSON.stringify({ sceneId: fixture.sceneId }),
          originType: "EXPLICIT",
          sourceFrameId: null,
          sourceGenerationId: null
        }
      });
      expect(created).toMatchObject({ revision: 1, sourceFrameId: null, sourceGenerationId: null, explicitlyEditedAt: null });

      await expect(fixture.prisma.frameStoryState.create({
        data: { frameId: testFrame.id, document: "{}", originType: "EXPLICIT" }
      })).rejects.toMatchObject({ code: "P2002" });
      await expect(fixture.prisma.frameStoryState.create({
        data: { frameId: "missing-frame", document: "{}", originType: "EXPLICIT" }
      })).rejects.toMatchObject({ code: "P2003" });

      await fixture.prisma.frameStoryState.delete({ where: { id: created.id } });
      await expect(fixture.prisma.frame.findUnique({ where: { id: testFrame.id } })).resolves.not.toBeNull();
      await fixture.prisma.frameStoryState.create({ data: { frameId: testFrame.id, document: "{}", originType: "EXPLICIT" } });
      await fixture.prisma.frame.delete({ where: { id: testFrame.id } });
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: testFrame.id } })).toBe(0);
      expect(await fixture.prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });
});

async function createLegacyFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-story-state-"));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, "legacy.sqlite");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  await initSqliteSchema(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  const project = await prisma.project.create({
    data: { name: "Legacy", slug: "legacy", rootPath: directory }
  });
  const scene = await prisma.scene.create({
    data: { projectId: project.id, sequence: 1, name: "Legacy Scene" }
  });
  await prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify({ sceneId: scene.id }) } });
  const frame = await prisma.frame.create({
    data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status: "LOCKED" }
  });
  const snapshot = JSON.stringify({ sceneId: scene.id, characters: { hero: { present: true } } });
  const generation = await prisma.generation.create({
    data: {
      frameId: frame.id,
      provider: "legacy",
      model: "legacy",
      prompt: "legacy prompt",
      status: "SUCCESS",
      outputFilePath: "generations/legacy.png",
      resolution: "1K",
      aspectRatio: "16:9",
      storyStateSnapshot: snapshot,
      frameSnapshot: JSON.stringify({ id: frame.id })
    }
  });
  await prisma.frame.update({ where: { id: frame.id }, data: { selectedGenerationId: generation.id } });
  return { prisma, databaseUrl, sceneId: scene.id, legacyFrameId: frame.id };
}

async function legacyFingerprint(prisma: PrismaClient) {
  const frames = await prisma.frame.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, selectedGenerationId: true } });
  const generations = await prisma.generation.findMany({ orderBy: { id: "asc" }, select: { id: true, storyStateSnapshot: true } });
  return {
    frameCount: frames.length,
    generationCount: generations.length,
    storyStateCount: await prisma.storyState.count(),
    frames,
    snapshotHashes: generations.map((generation) => ({
      id: generation.id,
      sha256: createHash("sha256").update(generation.storyStateSnapshot).digest("hex")
    })),
    foreignKeyViolations: await prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")
  };
}

async function tableExists(prisma: PrismaClient, tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return rows.length === 1;
}
