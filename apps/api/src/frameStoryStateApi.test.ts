import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Target API "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Frame target Story State HTTP API", () => {
  it("GET returns an existing target with flattened provenance and timestamps without side effects", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    const target = await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "persisted"), {
      originType: "INHERITED_LOCKED_GENERATION", sourceFrameId: "source-frame", sourceGenerationId: "source-generation"
    });
    const sceneBefore = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });
    const api = await startApi();
    try {
      const result = await api.request("GET", `/api/frames/${frame.id}/target-story-state`);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        status: "AVAILABLE", frameId: frame.id, revision: 1, document: state(fixture.sceneId, "persisted"),
        originType: "INHERITED_LOCKED_GENERATION", sourceFrameId: "source-frame", sourceGenerationId: "source-generation",
        explicitlyEditedAt: null
      });
      expect(typeof result.body.createdAt).toBe("string");
      expect(await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
      expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneBefore);
    } finally { await api.close(); }
  });

  it("GET returns explicit MISSING for a legacy Frame and does not initialize it", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    const api = await startApi();
    try {
      expect(await api.request("GET", `/api/frames/${frame.id}/target-story-state`)).toEqual({
        status: 200, body: { status: "MISSING", frameId: frame.id, legacy: true }
      });
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    } finally { await api.close(); }
  });

  it("GET returns safe INVALID diagnostics without exposing corrupt JSON", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    await fixture.prisma.frameStoryState.create({ data: { frameId: frame.id, document: "secret-corrupt-json", originType: "EXPLICIT" } });
    const api = await startApi();
    try {
      const result = await api.request("GET", `/api/frames/${frame.id}/target-story-state`);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ status: "INVALID", frameId: frame.id, code: "TARGET_INVALID", diagnostics: [] });
      expect(JSON.stringify(result.body)).not.toContain("secret-corrupt-json");
    } finally { await api.close(); }
  });

  it("GET maps a missing Frame to 404", async () => {
    await createFixture();
    const api = await startApi();
    try {
      expect(await api.request("GET", "/api/frames/missing/target-story-state")).toMatchObject({
        status: 404, body: { code: "FRAME_NOT_FOUND", diagnostics: [] }
      });
    } finally { await api.close(); }
  });

  it("POST initializes the first Frame from Scene state without changing Scene state", async () => {
    const fixture = await createFixture("scene-initial");
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    const sceneBefore = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });
    const api = await startApi();
    try {
      const result = await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {});
      expect(result).toMatchObject({ status: 200, body: { status: "AVAILABLE", revision: 1, originType: "SCENE_INITIAL" } });
      expect(result.body.document).toEqual(state(fixture.sceneId, "scene-initial"));
      expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneBefore);
    } finally { await api.close(); }
  });

  it("POST initializes from the selected snapshot of a LOCKED predecessor", async () => {
    const fixture = await createFixture();
    const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    await createGeneration(fixture.prisma, predecessor.id, "latest", state(fixture.sceneId, "latest"));
    const selected = await createGeneration(fixture.prisma, predecessor.id, "selected", state(fixture.sceneId, "selected"));
    await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
    const api = await startApi();
    try {
      expect(await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {})).toMatchObject({
        status: 200,
        body: {
          document: state(fixture.sceneId, "selected"), originType: "INHERITED_LOCKED_GENERATION",
          sourceFrameId: predecessor.id, sourceGenerationId: selected.id
        }
      });
    } finally { await api.close(); }
  });

  it("POST initializes from an unconfirmed REVIEW predecessor target", async () => {
    const fixture = await createFixture();
    const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "REVIEW");
    await createTarget(fixture.prisma, predecessor.id, state(fixture.sceneId, "review"));
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
    const api = await startApi();
    try {
      expect(await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {})).toMatchObject({
        status: 200,
        body: {
          document: state(fixture.sceneId, "review"), originType: "INHERITED_UNCONFIRMED_FRAME_TARGET",
          sourceFrameId: predecessor.id, diagnostics: [{ code: "UNCONFIRMED_PREDECESSOR_TARGET" }]
        }
      });
    } finally { await api.close(); }
  });

  it("POST is idempotent and concurrent initialize creates one target", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    const api = await startApi();
    try {
      const concurrent = await Promise.all([
        api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {}),
        api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {})
      ]);
      expect(concurrent.map((result) => result.status)).toEqual([200, 200]);
      expect(concurrent[0]?.body.id).toBe(concurrent[1]?.body.id);
      const repeated = await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {});
      expect(repeated.body).toMatchObject({ id: concurrent[0]?.body.id, revision: 1 });
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: frame.id } })).toBe(1);
    } finally { await api.close(); }
  });

  it("POST refuses to initialize a legacy LOCKED Frame", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    const api = await startApi();
    try {
      expect(await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {})).toMatchObject({
        status: 409, body: { code: "FRAME_LOCKED" }
      });
      expect(await fixture.prisma.frameStoryState.count()).toBe(0);
    } finally { await api.close(); }
  });

  it.each([
    ["missing selection", null, null, "NO_SELECTION"],
    ["missing selected Generation", "missing", null, "GENERATION_NOT_FOUND"],
    ["invalid selected snapshot", "selected", "not-json", "INVALID_SNAPSHOT"]
  ])("POST blocks LOCKED predecessor with %s", async (_label, selectedId, snapshot, diagnosticCode) => {
    const fixture = await createFixture();
    const predecessor = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    if (selectedId === "selected") {
      const selected = await createGeneration(fixture.prisma, predecessor.id, selectedId, snapshot);
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selected.id } });
    } else if (selectedId) {
      await fixture.prisma.frame.update({ where: { id: predecessor.id }, data: { selectedGenerationId: selectedId } });
    }
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
    const api = await startApi();
    try {
      expect(await api.request("POST", `/api/frames/${frame.id}/target-story-state/initialize`, {})).toMatchObject({
        status: 409, body: { code: "PREDECESSOR_INVALID", diagnostics: [{ code: diagnosticCode }] }
      });
      expect(await fixture.prisma.frameStoryState.count({ where: { frameId: frame.id } })).toBe(0);
    } finally { await api.close(); }
  });

  it("PUT updates atomically, increments revision and preserves provenance and historical snapshots", async () => {
    const fixture = await createFixture();
    const source = await createFrame(fixture.prisma, fixture.sceneId, 1, "LOCKED");
    const generation = await createGeneration(fixture.prisma, source.id, "source", state(fixture.sceneId, "historical"));
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 2);
    await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"), {
      originType: "INHERITED_LOCKED_GENERATION", sourceFrameId: source.id, sourceGenerationId: generation.id
    });
    const sceneBefore = await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } });
    const snapshotBefore = generation.storyStateSnapshot;
    const api = await startApi();
    try {
      const result = await api.request("PUT", `/api/frames/${frame.id}/target-story-state`, {
        document: state(fixture.sceneId, "after"), expectedRevision: 1
      });
      expect(result).toMatchObject({
        status: 200,
        body: { revision: 2, document: state(fixture.sceneId, "after"), originType: "INHERITED_LOCKED_GENERATION", sourceGenerationId: generation.id }
      });
      expect(result.body.explicitlyEditedAt).not.toBeNull();
      expect(await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.sceneId } })).toEqual(sceneBefore);
      expect((await fixture.prisma.generation.findUniqueOrThrow({ where: { id: generation.id } })).storyStateSnapshot).toBe(snapshotBefore);
    } finally { await api.close(); }
  });

  it("PUT no-op keeps revision and timestamps unchanged", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    const target = await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "same"));
    const api = await startApi();
    try {
      const result = await api.request("PUT", `/api/frames/${frame.id}/target-story-state`, {
        document: state(fixture.sceneId, "same"), expectedRevision: 1
      });
      expect(result.body).toMatchObject({ revision: 1, explicitlyEditedAt: null, updatedAt: target.updatedAt.toISOString() });
    } finally { await api.close(); }
  });

  it("PUT rejects a stale revision", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
    const api = await startApi();
    try {
      expect(await api.request("PUT", `/api/frames/${frame.id}/target-story-state`, {
        document: state(fixture.sceneId, "after"), expectedRevision: 2
      })).toMatchObject({ status: 409, body: { code: "REVISION_CONFLICT" } });
    } finally { await api.close(); }
  });

  it.each([
    ["LOCKED Frame", "locked", "FRAME_LOCKED"],
    ["GENERATING Frame", "generating", "FRAME_GENERATING"],
    ["missing target", "missing", "TARGET_NOT_INITIALIZED"]
  ])("PUT rejects %s", async (_label, setup, code) => {
    const fixture = await createFixture();
    const status = setup === "locked" ? "LOCKED" : setup === "generating" ? "GENERATING" : "DRAFT";
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1, status);
    if (setup !== "missing") await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
    const api = await startApi();
    try {
      expect(await api.request("PUT", `/api/frames/${frame.id}/target-story-state`, {
        document: state(fixture.sceneId, "after"), expectedRevision: 1
      })).toMatchObject({ status: 409, body: { code } });
    } finally { await api.close(); }
  });

  it.each([
    ["invalid document", { document: {}, expectedRevision: 1 }],
    ["non-integer revision", { document: state("scene", "after"), expectedRevision: 1.5 }],
    ["missing revision", { document: state("scene", "after") }],
    ["client provenance override", { document: state("scene", "after"), expectedRevision: 1, originType: "EXPLICIT" }]
  ])("PUT validates %s through the shared request schema", async (_label, body) => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
    const api = await startApi();
    try {
      expect(await api.request("PUT", `/api/frames/${frame.id}/target-story-state`, body)).toMatchObject({
        status: 400, body: { code: "VALIDATION_ERROR" }
      });
      expect((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).revision).toBe(1);
    } finally { await api.close(); }
  });

  it("allows only one of two concurrent PUT requests with the same revision", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    await createTarget(fixture.prisma, frame.id, state(fixture.sceneId, "before"));
    const api = await startApi();
    try {
      const results = await Promise.all([
        api.request("PUT", `/api/frames/${frame.id}/target-story-state`, { document: state(fixture.sceneId, "first"), expectedRevision: 1 }),
        api.request("PUT", `/api/frames/${frame.id}/target-story-state`, { document: state(fixture.sceneId, "second"), expectedRevision: 1 })
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      expect(results.find((result) => result.status === 409)?.body.code).toBe("REVISION_CONFLICT");
      expect((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: frame.id } })).revision).toBe(2);
    } finally { await api.close(); }
  });

  it("isolates Frame IDs to the currently active project", async () => {
    const first = await createFixture();
    const foreignFrame = await createFrame(first.prisma, first.sceneId, 1);
    const second = await createFixture();
    const api = await startApi();
    try {
      expect(await api.request("GET", `/api/frames/${foreignFrame.id}/target-story-state`)).toMatchObject({
        status: 404, body: { code: "FRAME_NOT_FOUND" }
      });
      expect(await second.prisma.frameStoryState.count()).toBe(0);
    } finally { await api.close(); }
  });

  it("maps missing Frame consistently for initialize and update", async () => {
    await createFixture();
    const api = await startApi();
    try {
      expect(await api.request("POST", "/api/frames/missing/target-story-state/initialize", {})).toMatchObject({
        status: 404, body: { code: "FRAME_NOT_FOUND" }
      });
      expect(await api.request("PUT", "/api/frames/missing/target-story-state", {
        document: state("scene", "after"), expectedRevision: 1
      })).toMatchObject({ status: 404, body: { code: "FRAME_NOT_FOUND" } });
    } finally { await api.close(); }
  });

  it("uses the existing NO_ACTIVE_PROJECT error when no project is open", async () => {
    const fixture = await createFixture();
    const frame = await createFrame(fixture.prisma, fixture.sceneId, 1);
    await projectDbManager.closeProject();
    const api = await startApi();
    try {
      expect(await api.request("GET", `/api/frames/${frame.id}/target-story-state`)).toEqual({
        status: 409, body: { error: "No active project is open.", code: "NO_ACTIVE_PROJECT" }
      });
    } finally { await api.close(); }
  });
});

async function createFixture(marker = "scene") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-target-api-"));
  temporaryDirectories.push(directory);
  const context = await projectDbManager.createProject({ name: `Target API ${path.basename(directory)}`, rootPath: directory });
  const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  await context.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify(state(scene.id, marker)) } });
  return { ...context, directory, sceneId: scene.id };
}

async function createFrame(prisma: PrismaClient, sceneId: string, sequence: number, status = "DRAFT") {
  return prisma.frame.create({ data: { sceneId, sequence, frameCode: `S001_F${String(sequence).padStart(3, "0")}`, status } });
}

async function createTarget(
  prisma: PrismaClient,
  frameId: string,
  document: ReturnType<typeof state>,
  provenance: { originType: string; sourceFrameId?: string; sourceGenerationId?: string } = { originType: "EXPLICIT" }
) {
  return prisma.frameStoryState.create({ data: {
    frameId, document: JSON.stringify(document), originType: provenance.originType,
    sourceFrameId: provenance.sourceFrameId ?? null, sourceGenerationId: provenance.sourceGenerationId ?? null
  } });
}

async function createGeneration(prisma: PrismaClient, frameId: string, suffix: string, snapshot: unknown) {
  return prisma.generation.create({ data: {
    frameId, provider: "test", model: "test", prompt: suffix, status: "SUCCESS",
    outputFilePath: `generations/${suffix}.png`, resolution: "1536x864", aspectRatio: "16:9",
    storyStateSnapshot: typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot), frameSnapshot: "{}"
  } });
}

async function startApi() {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable.");
  return {
    async request(method: "GET" | "POST" | "PUT", route: string, body?: unknown) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      });
      return { status: response.status, body: await response.json() as Record<string, any> };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function state(sceneId: string, marker: string) {
  return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [marker] };
}
