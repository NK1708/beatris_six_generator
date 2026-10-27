import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";

const directories: string[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter(entry => entry.name.startsWith("Lock Integrity "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

describe("Review/Lock integrity HTTP API", () => {
  it("reports READY, locks the exact selection, and rejects selection and repeated lock afterward", async () => {
    const fixture = await setup();
    const api = await startApi();
    try {
      expect(await api.request("GET", `/api/frames/${fixture.frameId}/lock-readiness`)).toMatchObject({ status: 200, body: { status: "READY", selectedGenerationId: fixture.generationId } });
      expect(await api.request("POST", `/api/frames/${fixture.frameId}/lock`, {})).toMatchObject({ status: 200, body: { status: "LOCKED", selectedGenerationId: fixture.generationId } });
      expect(await api.request("PUT", `/api/frames/${fixture.frameId}/selected-generation`, { generationId: fixture.otherGenerationId })).toMatchObject({ status: 409, body: { code: "FRAME_SELECTION_BLOCKED" } });
      expect(await api.request("POST", `/api/frames/${fixture.frameId}/lock`, {})).toMatchObject({ status: 409, body: { code: "FRAME_LOCK_BLOCKED", reasons: ["FRAME_ALREADY_LOCKED"] } });
    } finally { await api.close(); }
  });

  it("blocks stale target, unavailable output, legacy REVIEW target absence, and GENERATING selection", async () => {
    const stale = await setup();
    await stale.prisma.frameStoryState.update({ where: { frameId: stale.frameId }, data: { document: JSON.stringify(state(stale.sceneId, "changed")), revision: { increment: 1 } } });
    const api = await startApi();
    try {
      expect(await api.request("POST", `/api/frames/${stale.frameId}/lock`, {})).toMatchObject({ status: 409, body: { reasons: expect.arrayContaining(["TARGET_SNAPSHOT_MISMATCH"]) } });
      await stale.prisma.frameStoryState.update({ where: { frameId: stale.frameId }, data: { document: JSON.stringify(state(stale.sceneId, "original")) } });
      await fs.rm(path.join(stale.projectPath, stale.outputFilePath));
      expect(await api.request("GET", `/api/frames/${stale.frameId}/lock-readiness`)).toMatchObject({ status: 200, body: { reasons: expect.arrayContaining(["OUTPUT_FILE_MISSING"]) } });
      const legacy = await stale.prisma.frame.create({ data: { sceneId: stale.sceneId, sequence: 2, frameCode: "S001_F002", status: "REVIEW" } });
      expect(await api.request("GET", `/api/frames/${legacy.id}/lock-readiness`)).toMatchObject({ status: 200, body: { reasons: expect.arrayContaining(["TARGET_NOT_INITIALIZED"]) } });
      await stale.prisma.frame.update({ where: { id: stale.frameId }, data: { status: "GENERATING" } });
      expect(await api.request("PUT", `/api/frames/${stale.frameId}/selected-generation`, { generationId: stale.otherGenerationId })).toMatchObject({ status: 409, body: { code: "FRAME_SELECTION_BLOCKED" } });
    } finally { await api.close(); }
  });

  it("linearizes two lock requests and keeps concurrent selections within the unlocked lifecycle", async () => {
    const fixture = await setup();
    await Promise.all([
      selectGenerationForFrame(fixture.prisma, fixture.frameId, fixture.generationId),
      selectGenerationForFrame(fixture.prisma, fixture.frameId, fixture.otherGenerationId)
    ]);
    const selected = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: fixture.frameId } });
    expect([fixture.generationId, fixture.otherGenerationId]).toContain(selected.selectedGenerationId);
    const locks = await Promise.allSettled([
      lockFrameWithSelectedGeneration(fixture.prisma, fixture.projectPath, fixture.frameId),
      lockFrameWithSelectedGeneration(fixture.prisma, fixture.projectPath, fixture.frameId)
    ]);
    expect(locks.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await fixture.prisma.frame.findUniqueOrThrow({ where: { id: fixture.frameId } })).status).toBe("LOCKED");
  });
});

async function setup() {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-lock-integrity-")); directories.push(projectPath);
  const context = await projectDbManager.createProject({ name: `Lock Integrity ${path.basename(projectPath)}`, rootPath: projectPath });
  const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  const frame = await context.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status: "REVIEW" } });
  const document = state(scene.id, "original");
  await context.prisma.frameStoryState.create({ data: { frameId: frame.id, document: JSON.stringify(document), originType: "EXPLICIT" } });
  const outputFilePath = "generations/selected.png";
  await fs.mkdir(path.join(projectPath, "generations"), { recursive: true });
  await Promise.all([fs.writeFile(path.join(projectPath, outputFilePath), png), fs.writeFile(path.join(projectPath, "generations/other.png"), png)]);
  const data = { frameId: frame.id, provider: "test", model: "test", prompt: "prompt", status: "SUCCESS", resolution: "1x1", aspectRatio: "1:1", storyStateSnapshot: JSON.stringify(document), frameSnapshot: "{}" };
  const generation = await context.prisma.generation.create({ data: { ...data, outputFilePath } });
  const other = await context.prisma.generation.create({ data: { ...data, outputFilePath: "generations/other.png" } });
  await context.prisma.frame.update({ where: { id: frame.id }, data: { selectedGenerationId: generation.id } });
  return { ...context, projectPath, sceneId: scene.id, frameId: frame.id, generationId: generation.id, otherGenerationId: other.id, outputFilePath };
}

async function startApi() {
  const server = http.createServer(createApp()); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test server address.");
  return { async request(method: "GET" | "POST" | "PUT", route: string, body?: unknown) { const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() as Record<string, unknown> }; }, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

function state(sceneId: string, marker: string) { return { sceneId, time: { description: "day" }, environment: { marker }, characters: {}, props: {}, storyFacts: [] }; }
