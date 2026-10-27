import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { initSqliteSchema, ProjectMigrationError, runProjectMigrations } from "./services/sqliteSchema.js";
import { recoverFrameTargetStoryState } from "./services/frameStoryStateRecoveryService.js";

const migrationId = "20261021191000_add_frame_story_state";
const castMigrationId = "20261026120000_add_frame_character_cast";
const allMigrationRows = [{ id: migrationId }, { id: castMigrationId }];
const migrationPath = path.resolve(process.cwd(), "prisma/migrations", migrationId, "migration.sql");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("project database migration lifecycle", () => {
  it("upgrades a legacy database once and preserves existing production data", async () => {
    const fixture = await createLegacyFixture();
    const before = await productionFingerprint(fixture.prisma);

    await initSqliteSchema(fixture.databaseUrl);

    expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
    expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    expect(await productionFingerprint(fixture.prisma)).toEqual(before);
    expect(await fixture.prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")).toEqual([]);

    await initSqliteSchema(fixture.databaseUrl);
    await fixture.prisma.$disconnect();
    await initSqliteSchema(fixture.databaseUrl);
    const reopened = prismaFor(fixture.databaseUrl);
    try {
      expect(await migrationRows(reopened)).toEqual(allMigrationRows);
      expect(await reopened.frameStoryState.count()).toBe(0);
      expect(await productionFingerprint(reopened)).toEqual(before);
    } finally {
      await reopened.$disconnect();
    }
  });

  it("recovers a legacy target after migration and preserves it after reopen", async () => {
    const fixture = await createLegacyFixture();
    await initSqliteSchema(fixture.databaseUrl);
    const legacyFrame = await fixture.prisma.frame.findFirstOrThrow();
    await fixture.prisma.generation.updateMany({ where: { frameId: legacyFrame.id }, data: { storyStateSnapshot: JSON.stringify({ sceneId: legacyFrame.sceneId, time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: ["snapshot"] }) } });
    const frame = await fixture.prisma.frame.findFirstOrThrow({ include: { generations: true } });
    const source = frame.generations[0]!;
    const recovered = await recoverFrameTargetStoryState(fixture.prisma, frame.id, source.id);
    expect(recovered).toMatchObject({ revision: 1, provenance: { origin: "LEGACY_GENERATION_INPUT", sourceFrameId: frame.id, sourceGenerationId: source.id } });
    await fixture.prisma.$disconnect();
    await initSqliteSchema(fixture.databaseUrl);
    const reopened = prismaFor(fixture.databaseUrl);
    try {
      expect(await reopened.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).toMatchObject({ revision: 1, originType: "LEGACY_GENERATION_INPUT", sourceFrameId: frame.id, sourceGenerationId: source.id });
    } finally { await reopened.$disconnect(); }
  });

  it("accepts an already Prisma-migrated schema and records it without backfill", async () => {
    const fixture = await createCurrentFixture();
    try {
      await fixture.prisma.$executeRawUnsafe(`DROP TABLE "_BearridgeProjectMigration"`);

      await initSqliteSchema(fixture.databaseUrl);

      expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
      await initSqliteSchema(fixture.databaseUrl);
      expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rejects a journal entry whose schema is missing", async () => {
    const fixture = await createCurrentFixture();
    try {
      await fixture.prisma.$executeRawUnsafe(`DROP TABLE "FrameStoryState"`);
      await expect(initSqliteSchema(fixture.databaseUrl)).rejects.toMatchObject({
        code: "PROJECT_DATABASE_MIGRATION_FAILED"
      });
      expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rejects a partial unjournaled schema instead of silently accepting it", async () => {
    const fixture = await createLegacyFixture();
    try {
      await fixture.prisma.$executeRawUnsafe(`CREATE TABLE "FrameStoryState" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "frameId" TEXT NOT NULL
      )`);

      await expect(initSqliteSchema(fixture.databaseUrl)).rejects.toBeInstanceOf(ProjectMigrationError);
      expect(await migrationRows(fixture.prisma)).toEqual([]);
      const columns = await fixture.prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("FrameStoryState")`);
      expect(columns.map((column) => column.name)).toEqual(["id", "frameId"]);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rolls back schema and journal changes when migration SQL fails", async () => {
    const fixture = await createLegacyFixture();
    try {
      const validSql = await fs.readFile(migrationPath, "utf8");
      await expect(runProjectMigrations(fixture.databaseUrl, [{
        id: migrationId,
        sql: `${validSql}\nINSERT INTO "missing_table" ("id") VALUES ('fail');`
      }])).rejects.toMatchObject({ code: "PROJECT_DATABASE_MIGRATION_FAILED" });

      expect(await tableExists(fixture.prisma, "FrameStoryState")).toBe(false);
      expect(await migrationRows(fixture.prisma)).toEqual([]);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rejects a changed migration checksum", async () => {
    const fixture = await createCurrentFixture();
    try {
      await fixture.prisma.$executeRawUnsafe(
        `UPDATE "_BearridgeProjectMigration" SET "checksum" = 'wrong' WHERE "id" = ?`,
        migrationId
      );
      await expect(initSqliteSchema(fixture.databaseUrl)).rejects.toThrow("checksum does not match");
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("creates new databases with the current schema and no automatic FrameStoryState rows", async () => {
    const fixture = await createCurrentFixture();
    try {
      expect(await tableExists(fixture.prisma, "FrameStoryState")).toBe(true);
      expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
      expect(await fixture.prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("loads the migration asset when the API starts from its workspace directory", async () => {
    const originalWorkingDirectory = process.cwd();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-project-workspace-cwd-"));
    temporaryDirectories.push(directory);
    const databaseUrl = `file:${path.join(directory, "project.sqlite").replaceAll("\\", "/")}`;
    try {
      process.chdir(path.resolve(originalWorkingDirectory, "apps/api"));
      await initSqliteSchema(databaseUrl);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
    const prisma = prismaFor(databaseUrl);
    try {
      expect(await migrationRows(prisma)).toEqual(allMigrationRows);
      expect(await tableExists(prisma, "FrameStoryState")).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("serializes concurrent opens of the same legacy database", async () => {
    const fixture = await createLegacyFixture();
    try {
      await Promise.all([
        initSqliteSchema(fixture.databaseUrl),
        initSqliteSchema(fixture.databaseUrl)
      ]);
      expect(await migrationRows(fixture.prisma)).toEqual(allMigrationRows);
      expect(await tableExists(fixture.prisma, "FrameStoryState")).toBe(true);
      expect(await fixture.prisma.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });
});

async function createCurrentFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-project-migration-"));
  temporaryDirectories.push(directory);
  const databaseUrl = `file:${path.join(directory, "project.sqlite").replaceAll("\\", "/")}`;
  await initSqliteSchema(databaseUrl);
  const prisma = prismaFor(databaseUrl);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  return { prisma, databaseUrl };
}

async function createLegacyFixture() {
  const fixture = await createCurrentFixture();
  const project = await fixture.prisma.project.create({
    data: { name: "Legacy", slug: "legacy", rootPath: "legacy" }
  });
  const character = await fixture.prisma.character.create({
    data: { projectId: project.id, name: "Hero", slug: "hero" }
  });
  await fixture.prisma.characterReference.create({
    data: {
      characterId: character.id,
      type: "MASTER",
      code: "CHAR_HERO_MASTER_V1",
      filePath: "characters/hero/master.png",
      status: "LOCKED",
      isCanonical: true
    }
  });
  const scene = await fixture.prisma.scene.create({
    data: { projectId: project.id, sequence: 1, name: "Legacy Scene" }
  });
  await fixture.prisma.storyState.create({
    data: { sceneId: scene.id, document: JSON.stringify({ sceneId: scene.id, storyFacts: ["unchanged"] }) }
  });
  const frame = await fixture.prisma.frame.create({
    data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status: "LOCKED" }
  });
  const generation = await fixture.prisma.generation.create({
    data: {
      frameId: frame.id,
      provider: "legacy",
      model: "legacy",
      prompt: "legacy prompt",
      status: "SUCCESS",
      outputFilePath: "generations/legacy.png",
      resolution: "1536x864",
      aspectRatio: "16:9",
      storyStateSnapshot: JSON.stringify({ sceneId: scene.id, storyFacts: ["snapshot"] }),
      frameSnapshot: JSON.stringify({ id: frame.id })
    }
  });
  await fixture.prisma.frame.update({
    where: { id: frame.id },
    data: { selectedGenerationId: generation.id }
  });
  await fixture.prisma.$executeRawUnsafe(`ALTER TABLE "Frame" DROP COLUMN "characterCastSource"`);
  await fixture.prisma.$executeRawUnsafe(`ALTER TABLE "Frame" DROP COLUMN "characterCastRevision"`);
  await fixture.prisma.$executeRawUnsafe(`DROP TABLE "FrameStoryState"`);
  await fixture.prisma.$executeRawUnsafe(`DROP TABLE "_BearridgeProjectMigration"`);
  return fixture;
}

async function productionFingerprint(prisma: PrismaClient) {
  const frames = await prisma.frame.findMany({
    orderBy: { id: "asc" },
    select: { id: true, status: true, selectedGenerationId: true }
  });
  const generations = await prisma.generation.findMany({
    orderBy: { id: "asc" },
    select: { id: true, storyStateSnapshot: true }
  });
  const references = await prisma.characterReference.findMany({
    orderBy: { id: "asc" },
    select: { id: true, code: true, status: true, isCanonical: true, filePath: true }
  });
  return {
    frames,
    storyStates: await prisma.storyState.findMany({ orderBy: { id: "asc" }, select: { id: true, document: true } }),
    generationSnapshots: generations.map(({ id, storyStateSnapshot }) => ({
      id,
      bytes: Buffer.byteLength(storyStateSnapshot),
      sha256: createHash("sha256").update(storyStateSnapshot).digest("hex")
    })),
    references
  };
}

async function migrationRows(prisma: PrismaClient) {
  if (!await tableExists(prisma, "_BearridgeProjectMigration")) {
    return [];
  }
  return prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "_BearridgeProjectMigration" ORDER BY "id"`
  );
}

async function tableExists(prisma: PrismaClient, tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return rows.length === 1;
}

function prismaFor(databaseUrl: string) {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
