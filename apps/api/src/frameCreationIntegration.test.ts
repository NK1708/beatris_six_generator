import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createFrameSchema } from "@bearridge/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { createFrameWithTargetStoryState } from "./services/frameCreationService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Frame create "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("atomic Frame creation with target Story State", () => {
  it("creates the first DRAFT Frame and an independent SCENE_INITIAL target atomically", async () => {
    const fixture = await createFixture("scene-initial");
    const created = await create(fixture);
    expect(created.frame).toMatchObject({ sequence: 1, frameCode: "S001_F001", status: "DRAFT", previousFrameId: null });
    expect(created.target).toMatchObject({
      frameId: created.frame.id, revision: 1, document: state(fixture.sceneId, "scene-initial"),
      provenance: { origin: "SCENE_INITIAL" }
    });
    await fixture.prisma.storyState.update({
      where: { sceneId: fixture.sceneId }, data: { document: JSON.stringify(state(fixture.sceneId, "scene-changed")) }
    });
    expect(JSON.parse((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: created.frame.id } })).document))
      .toEqual(state(fixture.sceneId, "scene-initial"));
  });

  it("uses resolver EMPTY_DEFAULT semantics when the first Scene has no Story State", async () => {
    const fixture = await createFixture("scene", false);
    const created = await create(fixture);
    expect(created.target.provenance).toEqual({ origin: "EMPTY_DEFAULT" });
    expect(created.target.document.sceneId).toBe(fixture.sceneId);
    expect(created.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_SCENE_STORY_STATE" })]));
  });

  it("rolls back Frame creation when Scene Story State is corrupt", async () => {
    const fixture = await createFixture();
    await fixture.prisma.storyState.update({ where: { sceneId: fixture.sceneId }, data: { document: "not-json" } });
    await expect(create(fixture)).rejects.toMatchObject({ code: "INITIALIZATION_BLOCKED" });
    expect(await fixture.prisma.frame.count()).toBe(0);
    expect(await fixture.prisma.frameStoryState.count()).toBe(0);
  });

  it("inherits only the selected SUCCESS snapshot after a LOCKED predecessor", async () => {
    const fixture = await createFixture();
    const predecessor = await legacyFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    await generation(fixture.prisma, predecessor.id, "latest", state(fixture.sceneId, "latest"));
    const selected = await generation(fixture.prisma, predecessor.id, "selected", state(fixture.sceneId, "selected"));
    await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
    const snapshotBefore = selected.storyStateSnapshot;
    const created = await create(fixture);
    expect(created.target).toMatchObject({
      document: state(fixture.sceneId, "selected"),
      provenance: { origin: "INHERITED_LOCKED_GENERATION", sourceFrameId: predecessor.id, sourceGenerationId: selected.id }
    });
    expect(created.target.document).not.toEqual(state(fixture.sceneId, "latest"));
    expect((await fixture.prisma.generation.findUniqueOrThrow({ where: { id: selected.id } })).storyStateSnapshot).toBe(snapshotBefore);
  });

  it.each([
    ["missing selection", null, null, "NO_SELECTION"],
    ["missing selected Generation", "missing", null, "GENERATION_NOT_FOUND"],
    ["corrupt selected snapshot", "selected", "not-json", "INVALID_SNAPSHOT"]
  ])("blocks after LOCKED predecessor with %s and rolls back", async (_label, selectedId, snapshot, diagnosticCode) => {
    const fixture = await createFixture();
    const predecessor = await legacyFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    if (selectedId === "selected") {
      const selected = await generation(fixture.prisma, predecessor.id, selectedId, snapshot);
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
    } else if (selectedId) {
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selectedId } });
    }
    await expect(create(fixture)).rejects.toMatchObject({ code: "PREDECESSOR_INVALID", diagnostics: [{ code: diagnosticCode }] });
    expect(await fixture.prisma.frame.count()).toBe(1);
    expect(await fixture.prisma.frameStoryState.count()).toBe(0);
  });

  it.each(["REVIEW", "DRAFT"])("inherits an unconfirmed independent target after a %s predecessor", async (status) => {
    const fixture = await createFixture();
    const predecessor = await legacyFrame(fixture.prisma, fixture.sceneId, 1, status);
    await target(fixture.prisma, predecessor.id, state(fixture.sceneId, "predecessor-target"));
    const created = await create(fixture);
    expect(created.target).toMatchObject({
      document: state(fixture.sceneId, "predecessor-target"),
      provenance: { origin: "INHERITED_UNCONFIRMED_FRAME_TARGET", sourceFrameId: predecessor.id }
    });
    expect(created.diagnostics).toEqual([expect.objectContaining({ code: "UNCONFIRMED_PREDECESSOR_TARGET" })]);
    await fixture.prisma.frameStoryState.update({
      where: { frameId: predecessor.id }, data: { document: JSON.stringify(state(fixture.sceneId, "changed-after-copy")) }
    });
    expect(JSON.parse((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: created.frame.id } })).document))
      .toEqual(state(fixture.sceneId, "predecessor-target"));
  });

  it.each(["REVIEW", "DRAFT"])("blocks after legacy %s predecessor without target", async (status) => {
    const fixture = await createFixture();
    await legacyFrame(fixture.prisma, fixture.sceneId, 1, status);
    await expect(create(fixture)).rejects.toMatchObject({ code: "PREDECESSOR_INVALID" });
    expect(await fixture.prisma.frame.count()).toBe(1);
  });

  it("blocks and rolls back after a corrupt predecessor target", async () => {
    const fixture = await createFixture();
    const predecessor = await legacyFrame(fixture.prisma, fixture.sceneId, 1, "REVIEW");
    await fixture.prisma.frameStoryState.create({ data: { frameId: predecessor.id, document: "not-json", originType: "EXPLICIT" } });
    await expect(create(fixture)).rejects.toMatchObject({ code: "PREDECESSOR_INVALID" });
    expect(await fixture.prisma.frame.count()).toBe(1);
    expect(await fixture.prisma.frameStoryState.count()).toBe(1);
  });

  it("supports explicit sequence gaps and resolves predecessor by sequence", async () => {
    const fixture = await createFixture();
    const first = await legacyFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    const selected = await generation(fixture.prisma, first.id, "selected", state(fixture.sceneId, "selected"));
    await fixture.prisma.frame.update({ where: { id: first.id }, data: { selectedGenerationId: selected.id } });
    const third = await legacyFrame(fixture.prisma, fixture.sceneId, 3, "REVIEW");
    await target(fixture.prisma, third.id, state(fixture.sceneId, "third"));
    const created = await create(fixture, { sequence: 2, previousFrameId: first.id });
    expect(created.frame).toMatchObject({ sequence: 2, frameCode: "S001_F002", previousFrameId: first.id });
    expect(await fixture.prisma.frame.count()).toBe(3);
  });

  it("appends after the highest sequence when the client omits sequence", async () => {
    const fixture = await createFixture();
    const third = await legacyFrame(fixture.prisma, fixture.sceneId, 3, "REVIEW");
    await target(fixture.prisma, third.id, state(fixture.sceneId, "third"));
    const created = await create(fixture);
    expect(created.frame).toMatchObject({ sequence: 4, previousFrameId: third.id });
  });

  it("inherits SceneCharacter for the first Frame and predecessor FrameCharacter thereafter", async () => {
    const fixture = await createFixture();
    const birdman = await character(fixture, "Birdman");
    const webster = await character(fixture, "Webster");
    await fixture.prisma.sceneCharacter.createMany({ data: [
      { sceneId: fixture.sceneId, characterId: birdman.id, order: 1 },
      { sceneId: fixture.sceneId, characterId: webster.id, order: 2 }
    ] });
    const first = await create(fixture);
    expect(first.frame.characterCastSource).toBe("INHERITED_SCENE");
    expect(first.frame.characters.map((item) => item.characterId)).toEqual([birdman.id, webster.id]);
    await fixture.prisma.frameCharacter.deleteMany({ where: { frameId: first.frame.id } });
    await fixture.prisma.frameCharacter.create({ data: { frameId: first.frame.id, characterId: webster.id, order: 1 } });
    const second = await create(fixture);
    expect(second.frame.characterCastSource).toBe("INHERITED_PREVIOUS");
    expect(second.frame.characters.map((item) => item.characterId)).toEqual([webster.id]);
  });

  it("preserves explicit empty and rejects unavailable or duplicate character IDs", async () => {
    const fixture = await createFixture();
    const local = await character(fixture, "Local");
    const otherProject = await fixture.prisma.project.create({ data: { name: "Other", slug: `other-${fixture.project.id}`, rootPath: fixture.directory } });
    const foreign = await fixture.prisma.character.create({ data: { projectId: otherProject.id, name: "Foreign", slug: "foreign" } });
    await fixture.prisma.sceneCharacter.create({ data: { sceneId: fixture.sceneId, characterId: local.id, order: 1 } });
    const empty = await create(fixture, { characterIds: [] });
    expect(empty.frame).toMatchObject({ characterCastSource: "EXPLICIT", characters: [] });
    await expect(create(fixture, { sequence: 2, characterIds: [local.id, foreign.id] })).rejects.toMatchObject({ code: "INVALID_FRAME_CHARACTER_SELECTION" });
    await expect(create(fixture, { sequence: 2, characterIds: [local.id, local.id] })).rejects.toMatchObject({ code: "INVALID_FRAME_CHARACTER_SELECTION" });
  });

  it("does not copy Generation, review, selection or lock metadata", async () => {
    const fixture = await createFixture();
    const predecessor = await legacyFrame(fixture.prisma, fixture.sceneId, 1, "REVIEW");
    await target(fixture.prisma, predecessor.id, state(fixture.sceneId, "review"));
    await generation(fixture.prisma, predecessor.id, "candidate", state(fixture.sceneId, "candidate"));
    const created = await create(fixture, { generationStrategy: "CONTINUE_PREVIOUS_FRAME" });
    expect(created.frame).toMatchObject({ status: "DRAFT", selectedGenerationId: null, generationStrategy: "CONTINUE_PREVIOUS_FRAME" });
    expect(await fixture.prisma.generation.count({ where: { frameId: created.frame.id } })).toBe(0);
  });

  it("rolls back Frame and characters when target insertion fails", async () => {
    const fixture = await createFixture();
    const person = await character(fixture, "Person");
    await fixture.prisma.sceneCharacter.create({ data: { sceneId: fixture.sceneId, characterId: person.id, order: 1 } });
    await expect(createFrameWithTargetStoryState(fixture.prisma, input(fixture.sceneId), {
      initializeTarget: vi.fn().mockRejectedValue(new Error("synthetic target insert failure"))
    })).rejects.toThrow("synthetic target insert failure");
    expect(await fixture.prisma.frame.count()).toBe(0);
    expect(await fixture.prisma.frameCharacter.count()).toBe(0);
    expect(await fixture.prisma.frameStoryState.count()).toBe(0);
  });

  it("serializes two concurrent creates without duplicate sequence or missing targets", async () => {
    const fixture = await createFixture();
    const results = await Promise.allSettled([create(fixture), create(fixture)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const frames = await fixture.prisma.frame.findMany({ orderBy: { sequence: "asc" }, include: { targetStoryState: true } });
    expect(frames.map((frame) => frame.sequence)).toEqual([1, 2]);
    expect(frames.every((frame) => frame.targetStoryState !== null)).toBe(true);
  });

  it("returns Frame, target provenance and diagnostics from the existing POST endpoint", async () => {
    const fixture = await createFixture();
    const api = await startApi();
    try {
      const response = await fetch(`${api.url}/api/frames`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sceneId: fixture.sceneId })
      });
      expect(response.status).toBe(201);
      const body = await response.json() as { frame: { id: string; sequence: number; status: string }; target: { frameId: string; originType: string }; diagnostics: unknown[] };
      expect(body).toMatchObject({ frame: { sequence: 1, status: "DRAFT" }, target: { originType: "SCENE_INITIAL" }, diagnostics: [] });
      expect(body.target.frameId).toBe(body.frame.id);
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: body.frame.id } })).toBe(1);
    } finally { await api.close(); }
  });

  it("routes Benchmark seed Frame creation through the same atomic target lifecycle", async () => {
    const fixture = await createFixture();
    const benchmarkCharacter = await character(fixture, "Benchmark Character");
    const outfit = await fixture.prisma.outfit.create({ data: { characterId: benchmarkCharacter.id, name: "Benchmark Outfit", slug: "benchmark-outfit" } });
    const location = await fixture.prisma.location.create({ data: { projectId: fixture.project.id, name: "Benchmark Location", slug: "benchmark-location" } });
    const style = await fixture.prisma.styleProfile.create({ data: { projectId: fixture.project.id, name: "Benchmark Style", slug: "benchmark-style" } });
    const api = await startApi();
    try {
      const response = await fetch(`${api.url}/api/projects/${fixture.project.id}/benchmark/seed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: benchmarkCharacter.id, outfitId: outfit.id, locationId: location.id, styleProfileId: style.id })
      });
      expect(response.status).toBe(201);
      const responseBody = await response.json() as { sceneId: string };
      const activePrisma = projectDbManager.getActiveProject().prisma;
      const benchmarkFrames = await activePrisma.frame.findMany({
        where: { sceneId: responseBody.sceneId },
        include: { targetStoryState: true }
      });
      expect(benchmarkFrames).toHaveLength(20);
      expect(benchmarkFrames.every((frame) => frame.targetStoryState !== null)).toBe(true);
    } finally { await api.close(); }
  });

  it("cannot persist an ambiguous duplicate sequence because the existing unique constraint rejects it", async () => {
    const fixture = await createFixture();
    await legacyFrame(fixture.prisma, fixture.sceneId, 1, "DRAFT");
    await expect(legacyFrame(fixture.prisma, fixture.sceneId, 1, "DRAFT")).rejects.toBeTruthy();
    expect(await fixture.prisma.frame.count()).toBe(1);
  });
});

async function createFixture(marker = "scene", withStoryState = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-frame-create-"));
  temporaryDirectories.push(directory);
  const context = await projectDbManager.createProject({ name: `Frame create ${path.basename(directory)}`, rootPath: directory });
  const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  if (withStoryState) {
    await context.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id, marker)) } });
  }
  return { ...context, directory, sceneId: scene.id };
}

function input(sceneId: string, overrides: Record<string, unknown> = {}) {
  return createFrameSchema.parse({ sceneId, ...overrides });
}

function create(fixture: Awaited<ReturnType<typeof createFixture>>, overrides: Record<string, unknown> = {}) {
  return createFrameWithTargetStoryState(fixture.prisma, input(fixture.sceneId, overrides));
}

async function legacyFrame(prisma: PrismaClient, sceneId: string, sequence: number, status: string) {
  return prisma.frame.create({ data: { sceneId, sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`, status } });
}

async function target(prisma: PrismaClient, frameId: string, document: ReturnType<typeof state>) {
  return prisma.frameStoryState.create({ data: { frameId, document: JSON.stringify(document), originType: "EXPLICIT" } });
}

async function generation(prisma: PrismaClient, frameId: string, suffix: string, snapshot: unknown) {
  return prisma.generation.create({ data: {
    frameId, provider: "test", model: "test", prompt: suffix, status: "SUCCESS", outputFilePath: `generations/${suffix}.png`,
    resolution: "1536x864", aspectRatio: "16:9",
    storyStateSnapshot: typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot), frameSnapshot: "{}"
  } });
}

async function character(fixture: Awaited<ReturnType<typeof createFixture>>, name: string) {
  return fixture.prisma.character.create({ data: { projectId: fixture.project.id, name, slug: `${name.toLowerCase()}-${fixture.project.id}` } });
}

async function startApi() {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function state(sceneId: string, marker: string) {
  return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [marker] };
}
