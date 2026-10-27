import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { initSqliteSchema } from "./services/sqliteSchema.js";
import {
  FrameStoryStateService,
  FrameStoryStateServiceError,
  type FrameStoryStateServiceErrorCode
} from "./services/frameStoryStateService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("FrameStoryStateService", () => {
  it("reads an existing target with revision and provenance", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "persisted"), {
        originType: "INHERITED_LOCKED_GENERATION",
        sourceFrameId: "source-frame",
        sourceGenerationId: "source-generation"
      });

      await expect(fixture.service.getFrameTargetStoryState(frame.id)).resolves.toMatchObject({
        status: "AVAILABLE",
        frameId: frame.id,
        revision: 1,
        document: state(fixture.sceneId, "persisted"),
        provenance: {
          origin: "INHERITED_LOCKED_GENERATION",
          sourceFrameId: "source-frame",
          sourceGenerationId: "source-generation"
        }
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns an explicit legacy MISSING result without creating a target", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await expect(fixture.service.getFrameTargetStoryState(frame.id)).resolves.toEqual({
        status: "MISSING",
        frameId: frame.id,
        legacy: true
      });
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it.each([
    ["not-json", "TARGET_INVALID"],
    [JSON.stringify({ sceneId: "scene-only" }), "TARGET_INVALID"]
  ])("rejects corrupt persisted target %s", async (document, code) => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await fixture.prisma.frameStoryState.create({
        data: { frameId: frame.id, document, originType: "EXPLICIT" }
      });
      await expectCode(fixture.service.getFrameTargetStoryState(frame.id), code as FrameStoryStateServiceErrorCode);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("initializes the first Frame from Scene Story State", async () => {
    const fixture = await createFixture(state("placeholder", "scene initial"));
    try {
      await fixture.prisma.storyState.update({
        where: { sceneId: fixture.sceneId },
        data: { document: JSON.stringify(state(fixture.sceneId, "scene initial")) }
      });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await expect(fixture.service.initializeFrameTargetStoryState(frame.id)).resolves.toMatchObject({
        document: state(fixture.sceneId, "scene initial"),
        revision: 1,
        provenance: { origin: "SCENE_INITIAL" },
        diagnostics: []
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("initializes from only the selected successful Generation of a LOCKED predecessor", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      await createGeneration(fixture.prisma, predecessor.id, "latest", state(fixture.sceneId, "latest"));
      const selected = await createGeneration(fixture.prisma, predecessor.id, "selected", state(fixture.sceneId, "selected"));
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);

      await expect(fixture.service.initializeFrameTargetStoryState(frame.id)).resolves.toMatchObject({
        document: state(fixture.sceneId, "selected"),
        provenance: {
          origin: "INHERITED_LOCKED_GENERATION",
          sourceFrameId: predecessor.id,
          sourceGenerationId: selected.id
        }
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("initializes from an unconfirmed persisted target of a REVIEW predecessor", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "REVIEW");
      await createTarget(fixture.prisma, predecessor.id, state(fixture.sceneId, "review target"));
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);

      await expect(fixture.service.initializeFrameTargetStoryState(frame.id)).resolves.toMatchObject({
        document: state(fixture.sceneId, "review target"),
        provenance: { origin: "INHERITED_UNCONFIRMED_FRAME_TARGET", sourceFrameId: predecessor.id },
        diagnostics: [{ code: "UNCONFIRMED_PREDECESSOR_TARGET" }]
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it.each([
    ["missing selection", null, state("scene", "snapshot"), "NO_SELECTION"],
    ["missing selected Generation", "absent", null, "GENERATION_NOT_FOUND"],
    ["invalid selected snapshot", "selected", "not-json", "INVALID_SNAPSHOT"]
  ])("blocks LOCKED predecessor with %s", async (_label, selectedId, snapshot, diagnosticCode) => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      if (selectedId && snapshot !== null) {
        const generation = await createGeneration(fixture.prisma, predecessor.id, selectedId, snapshot);
        await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: generation.id } });
      } else if (selectedId) {
        await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selectedId } });
      }
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
      const error = await rejectedError(fixture.service.initializeFrameTargetStoryState(frame.id));
      expect(error).toMatchObject({ code: "PREDECESSOR_INVALID", diagnostics: [{ code: diagnosticCode }] });
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: frame.id } })).toBe(0);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("blocks an invalid persisted predecessor target without falling back to Scene Story State", async () => {
    const fixture = await createFixture();
    try {
      const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "DRAFT");
      await fixture.prisma.frameStoryState.create({
        data: { frameId: predecessor.id, document: "not-json", originType: "EXPLICIT" }
      });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
      await expectCode(fixture.service.initializeFrameTargetStoryState(frame.id), "PREDECESSOR_INVALID");
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns INITIALIZATION_BLOCKED for an invalid first-Frame Scene Story State", async () => {
    const fixture = await createFixture();
    try {
      await fixture.prisma.storyState.update({
        where: { sceneId: fixture.sceneId },
        data: { document: "not-json" }
      });
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const error = await rejectedError(fixture.service.initializeFrameTargetStoryState(frame.id));
      expect(error).toMatchObject({ code: "INITIALIZATION_BLOCKED", diagnostics: [{ code: "INVALID_SCENE_STORY_STATE" }] });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("is idempotent and does not recalculate an existing target", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const first = await fixture.service.initializeFrameTargetStoryState(frame.id);
      await fixture.prisma.storyState.update({
        where: { sceneId: fixture.sceneId },
        data: { document: JSON.stringify(state(fixture.sceneId, "changed scene")) }
      });
      const second = await fixture.service.initializeFrameTargetStoryState(frame.id);
      expect(second).toMatchObject({ id: first.id, revision: first.revision, document: first.document });
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: frame.id } })).toBe(1);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("does not initialize a legacy LOCKED Frame", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      await expectCode(fixture.service.initializeFrameTargetStoryState(frame.id), "FRAME_LOCKED");
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("updates document atomically, increments revision, preserves provenance and Generation snapshots", async () => {
    const fixture = await createFixture();
    try {
      const source = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
      const generation = await createGeneration(fixture.prisma, source.id, "selected", state(fixture.sceneId, "historical"));
      const historicalSnapshot = generation.storyStateSnapshot;
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
      await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"), {
        originType: "INHERITED_LOCKED_GENERATION",
        sourceFrameId: source.id,
        sourceGenerationId: generation.id
      });

      const updated = await fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "after"), 1);
      expect(updated).toMatchObject({
        revision: 2,
        document: state(fixture.sceneId, "after"),
        provenance: {
          origin: "INHERITED_LOCKED_GENERATION",
          sourceFrameId: source.id,
          sourceGenerationId: generation.id
        }
      });
      expect(updated.explicitlyEditedAt).toBeInstanceOf(Date);
      expect((await fixture.prisma.generation.findUniqueOrThrow({ where: { id: generation.id } })).storyStateSnapshot).toBe(historicalSnapshot);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns a true no-op only after checking expectedRevision", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      const target = await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "same"));
      const noOp = await fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "same"), 1);
      expect(noOp).toMatchObject({ revision: 1, explicitlyEditedAt: null, updatedAt: target.updatedAt });
      await expectCode(fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "same"), 0), "REVISION_CONFLICT");
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rejects every target mutation while the Frame is GENERATING without side effects", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1, "GENERATING");
      const target = await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"), {
        originType: "INHERITED_FRAME_TARGET",
        sourceFrameId: "source-frame"
      });
      const sceneState = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });

      await expectCode(fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "after"), 1), "FRAME_GENERATING");
      await expectCode(fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "before"), 1), "FRAME_GENERATING");

      expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } })).toMatchObject({ status: "GENERATING" });
      expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).toEqual(target);
      expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneState);
      expect(await fixture.prisma.generation.count({ where: { frameId: frame.id } })).toBe(0);
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it.each(["REVIEW", "REJECTED"])("preserves target editing policy for %s Frames", async (status) => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1, status);
      await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
      await expect(fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "after"), 1)).resolves.toMatchObject({
        revision: 2,
        document: state(fixture.sceneId, "after")
      });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("allows only one of two concurrent updates with the same revision", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
      const results = await Promise.allSettled([
        fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "first"), 1),
        fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "second"), 1)
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejected?.reason).toMatchObject({ code: "REVISION_CONFLICT" });
      expect((await fixture.service.getFrameTargetStoryState(frame.id))).toMatchObject({ revision: 2 });
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("rejects update after Frame is LOCKED and safely linearizes a lock/update race", async () => {
    const fixture = await createFixture();
    try {
      const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
      await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
      await fixture.prisma.frame.update({ where: { id: frame.id }, data: { status: "LOCKED" } });
      await expectCode(fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "after"), 1), "FRAME_LOCKED");

      await fixture.prisma.frame.update({ where: { id: frame.id }, data: { status: "REVIEW" } });
      const race = await Promise.allSettled([
        fixture.service.updateFrameTargetStoryState(frame.id, state(fixture.sceneId, "race"), 1),
        fixture.prisma.frame.update({ where: { id: frame.id }, data: { status: "LOCKED" } })
      ]);
      const persistedFrame = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: frame.id } });
      const persistedTarget = await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } });
      expect(persistedFrame.status).toBe("LOCKED");
      expect([1, 2]).toContain(persistedTarget.revision);
      if (persistedTarget.revision === 1) {
        expect(race[0]).toMatchObject({ status: "rejected", reason: { code: "FRAME_LOCKED" } });
      }
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it.each([
    ["missing Frame", "missing", state("scene", "x"), "FRAME_NOT_FOUND"],
    ["missing target", "existing", state("scene", "x"), "TARGET_NOT_INITIALIZED"],
    ["invalid document", "target", {}, "TARGET_INVALID"]
  ])("returns typed error for %s", async (_label, setup, document, code) => {
    const fixture = await createFixture();
    try {
      let frameId = "missing-frame";
      if (setup !== "missing") {
        const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
        frameId = frame.id;
        if (setup === "target") await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
      }
      await expectCode(
        fixture.service.updateFrameTargetStoryState(frameId, document, 1),
        code as FrameStoryStateServiceErrorCode
      );
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("returns FRAME_NOT_FOUND for read and initialize", async () => {
    const fixture = await createFixture();
    try {
      await expectCode(fixture.service.getFrameTargetStoryState("missing"), "FRAME_NOT_FOUND");
      await expectCode(fixture.service.initializeFrameTargetStoryState("missing"), "FRAME_NOT_FOUND");
    } finally {
      await fixture.prisma.$disconnect();
    }
  });

  it("wraps Prisma failures as DATABASE_ERROR", async () => {
    const fixture = await createFixture();
    try {
      await fixture.prisma.$executeRawUnsafe(`DROP TABLE "Frame"`);
      await expectCode(fixture.service.getFrameTargetStoryState("frame"), "DATABASE_ERROR");
    } finally {
      await fixture.prisma.$disconnect();
    }
  });
});

async function createFixture(initialState = state("placeholder", "scene")) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-story-service-"));
  temporaryDirectories.push(directory);
  const databaseUrl = `file:${path.join(directory, "project.sqlite").replaceAll("\\", "/")}`;
  await initSqliteSchema(databaseUrl);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const project = await prisma.project.create({ data: { name: "Service", slug: "service", rootPath: directory } });
  const scene = await prisma.scene.create({ data: { projectId: project.id, sequence: 1, name: "Scene" } });
  await prisma.storyState.create({
    data: { sceneId: scene.id, document: JSON.stringify({ ...initialState, sceneId: scene.id }) }
  });
  return { prisma, service: new FrameStoryStateService(prisma), sceneId: scene.id };
}

async function createFrame(prisma: PrismaClient, sceneId: string, sequence: number, status = "DRAFT") {
  return prisma.frame.create({
    data: { sceneId, sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`, status }
  });
}

async function createTarget(
  prisma: PrismaClient,
  frameId: string,
  document: ReturnType<typeof state>,
  provenance: { originType: string; sourceFrameId?: string; sourceGenerationId?: string } = { originType: "EXPLICIT" }
) {
  return prisma.frameStoryState.create({
    data: {
      frameId,
      document: JSON.stringify(document),
      originType: provenance.originType,
      sourceFrameId: provenance.sourceFrameId ?? null,
      sourceGenerationId: provenance.sourceGenerationId ?? null
    }
  });
}

async function createGeneration(
  prisma: PrismaClient,
  frameId: string,
  suffix: string,
  snapshot: unknown
) {
  return prisma.generation.create({
    data: {
      frameId,
      provider: "test",
      model: "test",
      prompt: suffix,
      status: "SUCCESS",
      outputFilePath: `generations/${suffix}.png`,
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

async function expectCode(promise: Promise<unknown>, code: FrameStoryStateServiceErrorCode) {
  const error = await rejectedError(promise);
  expect(error).toBeInstanceOf(FrameStoryStateServiceError);
  expect(error).toMatchObject({ code });
}

async function rejectedError(promise: Promise<unknown>): Promise<FrameStoryStateServiceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FrameStoryStateServiceError) return error;
    throw error;
  }
  throw new Error("Expected operation to reject.");
}
