import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { updateFrame } from "./services/frameUpdateService.js";
import { lockFrameWithSelectedGeneration } from "./services/generationReviewService.js";
import { loadFrameContext } from "./services/contextService.js";

const roots: string[] = [];
afterEach(async () => {
  await projectDbManager.closeProject();
  for (const entry of await projectDbManager.listRegistry()) {
    if (roots.includes(entry.projectPath)) await projectDbManager.deleteProject({ projectId: entry.id });
  }
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("ordinary Frame mutation lifecycle", () => {
  it.each(["DRAFT", "REVIEW"])("keeps %s editing available", async status => {
    const f = await fixture(status);
    const api = await server();
    try {
      expect(await api.put(`/api/frames/${f.frame.id}`, { camera: "wide shot", targetWidth: 1200, targetHeight: 500 })).toMatchObject({ status: 200, body: { camera: "wide shot", status, targetAspectRatio: 2.4 } });
    } finally { await api.close(); }
  });

  it("rejects full, partial, and alternative-context LOCKED writes without changing history or continuity", async () => {
    const f = await fixture("REVIEW");
    await lockFrameWithSelectedGeneration(f.prisma, f.projectPath, f.frame.id);
    const next = await f.prisma.frame.create({ data: { sceneId: f.scene.id, sequence: 2, frameCode: "S001_F002", previousFrameId: f.frame.id } });
    const before = await snapshot(f);
    const baseline = (await loadFrameContext(next.id, f)).continuityBaseline;
    expect(baseline.status).toBe("AVAILABLE");
    const api = await server();
    try {
      for (const body of [
        { description: "changed", action: "changed", camera: "wide", composition: "changed", lighting: "night", expressionNotes: "changed", continuityNotes: "changed", generationStrategy: "CONTINUE_PREVIOUS_FRAME", continuityEditContract: { changes: ["changed"], forbidden: [], allowedChanges: [] }, locationId: null, locationAngleId: null, styleProfileId: null, targetWidth: 10, targetHeight: 20, targetAspectRatio: 0.5, additionalCharacterReferenceIds: {} },
        { camera: "changed" },
        { additionalCharacterReferenceIds: {} }
      ]) expect(await api.put(`/api/frames/${f.frame.id}`, body)).toMatchObject({ status: 409, body: { code: "FRAME_LOCKED" } });
      for (const body of [{ locationId: null }, { styleProfileId: null }, { locationAngleId: null }, { additionalCharacterReferenceIds: {} }]) {
        expect(await api.put(`/api/frames/${f.frame.id}/context`, body)).toMatchObject({ status: 409, body: { code: "FRAME_LOCKED" } });
      }
      expect(await api.put(`/api/frames/${f.frame.id}/context`, { characterIds: [] })).toMatchObject({ status: 409, body: { code: "FRAME_CAST_MUTATION_FORBIDDEN" } });
      expect(await snapshot(f)).toEqual(before);
      expect((await loadFrameContext(next.id, f)).continuityBaseline).toEqual(baseline);
    } finally { await api.close(); }
  });

  it("rolls back staging fields when context validation fails", async () => {
    const f = await fixture("DRAFT");
    const before = await snapshot(f);
    const api = await server();
    try {
      expect(await api.put(`/api/frames/${f.frame.id}`, { camera: "should roll back", characterIds: ["missing-character"] })).toMatchObject({ status: 400 });
      expect(await snapshot(f)).toEqual(before);
      expect(await api.put(`/api/frames/${f.frame.id}`, { camera: "should roll back", characterIds: [], expectedCharacterCastRevision: 99 })).toMatchObject({ status: 409, body: { code: "FRAME_CAST_REVISION_CONFLICT" } });
      expect(await snapshot(f)).toEqual(before);
    } finally { await api.close(); }
  });

  it("rejects a stale PUT when Lock completes before the conditional write", async () => {
    const f = await fixture("REVIEW");
    const pause = pausedTransaction(f.prisma);
    const updating = updateFrame(pause.client, { frameId: f.frame.id, camera: "stale" });
    await pause.entered;
    try { await lockFrameWithSelectedGeneration(f.prisma, f.projectPath, f.frame.id); }
    finally { pause.release(); }
    await expect(updating).rejects.toMatchObject({ statusCode: 409, code: "FRAME_LOCKED" });
    expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "LOCKED", camera: "original" });
  });

  it("Lock rechecks current facts when PUT commits after Lock preflight but before its transaction", async () => {
    const f = await fixture("REVIEW");
    const pause = pausedTransaction(f.prisma);
    const locking = lockFrameWithSelectedGeneration(pause.client, f.projectPath, f.frame.id);
    await pause.entered;
    try { await updateFrame(f.prisma, { frameId: f.frame.id, camera: "new staging" }); }
    finally { pause.release(); }
    await locking;
    expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "LOCKED", camera: "new staging" });
  });

  it("does not Lock a stale cast after PUT changes it during Lock preflight", async () => {
    const f = await fixture("REVIEW");
    const pause = pausedTransaction(f.prisma);
    const locking = lockFrameWithSelectedGeneration(pause.client, f.projectPath, f.frame.id);
    await pause.entered;
    try { await updateFrame(f.prisma, { frameId: f.frame.id, camera: "new staging", characterIds: [], expectedCharacterCastRevision: 0 }); }
    finally { pause.release(); }
    await expect(locking).rejects.toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
    expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "REVIEW", characterCastRevision: 1 });
  });
});

async function fixture(status: string) {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-mutation-")); roots.push(projectPath);
  const context = await projectDbManager.createProject({ name: `Mutation ${path.basename(projectPath)}`, rootPath: projectPath });
  const { prisma } = context;
  const scene = await prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Isolated scene" } });
  const character = await prisma.character.create({ data: { projectId: context.project.id, name: "Fixture", slug: "fixture" } });
  const frame = await prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status, camera: "original", characters: { create: { characterId: character.id, order: 1 } } } });
  const document = { sceneId: scene.id, time: { description: "day" }, environment: { door: "closed" }, characters: {}, props: {}, storyFacts: ["historical"] };
  await prisma.frameStoryState.create({ data: { frameId: frame.id, document: JSON.stringify(document), originType: "SCENE_INITIAL" } });
  const outputFilePath = "generations/selected.png";
  await fs.writeFile(path.join(projectPath, outputFilePath), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const generation = await prisma.generation.create({ data: { frameId: frame.id, provider: "fixture", model: "fixture", prompt: "historical", status: "SUCCESS", outputFilePath, resolution: "1x1", aspectRatio: "1:1", storyStateSnapshot: JSON.stringify(document), frameSnapshot: JSON.stringify({ characterCastRevision: 0 }) } });
  await prisma.frame.update({ where: { id: frame.id }, data: { selectedGenerationId: generation.id } });
  return { ...context, projectPath, scene, frame };
}

async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id }, include: { targetStoryState: true, characters: { include: { additionalReferences: true } }, generations: { include: { references: true } } } });
}

// Pause at the transaction boundary, not with timing-dependent sleeps.
function pausedTransaction(prisma: PrismaClient) {
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = new Proxy(prisma, { get(target, property, receiver) {
    if (property === "$transaction") return async (...args: Parameters<PrismaClient["$transaction"]>) => {
      enter(); await gate;
      return Reflect.apply(target.$transaction, target, args);
    };
    return Reflect.get(target, property, receiver);
  } });
  return { client, entered, release };
}

async function server() {
  const api = http.createServer(createApp());
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const address = api.address(); if (!address || typeof address === "string") throw new Error("Missing test port");
  return {
    async put(route: string, body: unknown) { const r = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as Record<string, unknown> }; },
    close: () => new Promise<void>((resolve, reject) => api.close(error => error ? reject(error) : resolve()))
  };
}
