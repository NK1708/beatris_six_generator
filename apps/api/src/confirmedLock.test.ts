import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { afterEach, expect, it } from "vitest";
import { createFrameSchema } from "@bearridge/shared";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { lockFrameWithConfirmation, selectGenerationForFrame } from "./services/generationReviewService.js";
import { FrameStoryStateService } from "./services/frameStoryStateService.js";
import { createFrameWithTargetStoryState } from "./services/frameCreationService.js";

const roots: string[] = [], clients: PrismaClient[] = [];
afterEach(async () => { for (const c of clients.splice(0)) await c.$disconnect(); await projectDbManager.closeProject(); for (const entry of (await projectDbManager.listRegistry()).filter(e => e.name.startsWith("Confirmed Lock "))) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false }); await Promise.all(roots.splice(0).map(r => fs.rm(r, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-confirmed-lock-")); roots.push(root);
  const context = await projectDbManager.createProject({ name: `Confirmed Lock ${path.basename(root)}`, rootPath: root });
  const { prisma } = context;
  const scene = await prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  const frame = await prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status: "REVIEW" } });
  const document = { sceneId: scene.id, time: { description: "day" }, environment: {}, characters: {}, props: {}, storyFacts: ["historical"] };
  await prisma.frameStoryState.create({ data: { frameId: frame.id, document: JSON.stringify(document), originType: "EXPLICIT" } });
  await fs.writeFile(path.join(root, "fixture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"));
  const a = await prisma.generation.create({ data: { frameId: frame.id, provider: "mock", model: "fixture", prompt: "historical prompt", status: "SUCCESS", outputFilePath: "fixture.png", resolution: "1x1", aspectRatio: "1:1", storyStateSnapshot: JSON.stringify(document), frameSnapshot: JSON.stringify({ characterCastRevision: 0 }), rawMetadata: "{}" } });
  const b = await prisma.generation.create({ data: { frameId: frame.id, provider: "mock", model: "fixture", prompt: "second historical prompt", status: "SUCCESS", outputFilePath: "fixture.png", resolution: "1x1", aspectRatio: "1:1", storyStateSnapshot: a.storyStateSnapshot, frameSnapshot: a.frameSnapshot, rawMetadata: "{}" } });
  await prisma.frame.update({ where: { id: frame.id }, data: { selectedGenerationId: a.id } });
  const expected = { expectedGenerationId: a.id, expectedTargetRevision: 1 };
  const other = new PrismaClient({ datasources: { db: { url: `file:${context.databasePath.replaceAll("\\", "/")}` } } }); clients.push(other);
  return { ...context, root, scene, frame, document, a, b, expected, other };
}
async function server() { const s = http.createServer(createApp()); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const address = s.address(); if (!address || typeof address === "string") throw Error("No port"); return { async post(url: string, body?: unknown) { const r = await fetch(`http://127.0.0.1:${address.port}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() as Record<string, unknown> }; }, close: () => new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())) }; }
const histories = (p: PrismaClient, id: string) => p.generation.findMany({ where: { frameId: id }, include: { references: true }, orderBy: { id: "asc" } });

it("locks exact expected values over HTTP, preserving snapshots/provenance and next-frame continuity", async () => {
  const f = await fixture(), api = await server(), before = await histories(f.prisma, f.frame.id);
  try { expect(await api.post(`/api/frames/${f.frame.id}/lock-confirmed`, f.expected)).toMatchObject({ status: 200, body: { status: "LOCKED", selectedGenerationId: f.a.id } });
    expect(await api.post(`/api/frames/${f.frame.id}/lock-confirmed`, f.expected)).toMatchObject({ status: 409 });
    const next = await createFrameWithTargetStoryState(f.prisma, createFrameSchema.parse({ sceneId: f.scene.id }));
    expect(next.target).toMatchObject({ document: f.document, provenance: { origin: "INHERITED_LOCKED_GENERATION", sourceGenerationId: f.a.id } });
    expect(await histories(f.prisma, f.frame.id)).toEqual(before);
  } finally { await api.close(); }
});
it("rejects A when B is selected before server preflight, despite identical snapshots", async () => {
  const f = await fixture(), api = await server(); await selectGenerationForFrame(f.other, f.frame.id, f.b.id);
  try { expect(await api.post(`/api/frames/${f.frame.id}/lock-confirmed`, f.expected)).toMatchObject({ status: 409, body: { code: "FRAME_LOCK_READINESS_STALE" } }); expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "REVIEW", selectedGenerationId: f.b.id }); } finally { await api.close(); }
});
it("rejects an old revision even when Target changes back to an identical document", async () => {
  const f = await fixture(); const service = new FrameStoryStateService(f.other);
  await service.updateFrameTargetStoryState(f.frame.id, { ...f.document, time: { description: "night" } }, 1);
  await service.updateFrameTargetStoryState(f.frame.id, f.document, 2);
  await expect(lockFrameWithConfirmation(f.prisma, f.root, f.frame.id, f.expected)).rejects.toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
});
it.each(["FAILED", "NO_SELECTION", "GENERATING", "MISSING_FILE"])("keeps existing integrity guards for %s", async kind => {
  const f = await fixture();
  if (kind === "FAILED") await f.prisma.generation.update({ where: { id: f.a.id }, data: { status: "FAILED" } });
  if (kind === "NO_SELECTION") await f.prisma.frame.update({ where: { id: f.frame.id }, data: { selectedGenerationId: null } });
  if (kind === "GENERATING") await f.prisma.frame.update({ where: { id: f.frame.id }, data: { status: "GENERATING" } });
  if (kind === "MISSING_FILE") await fs.unlink(path.join(f.root, "fixture.png"));
  await expect(lockFrameWithConfirmation(f.prisma, f.root, f.frame.id, f.expected)).rejects.toMatchObject({ statusCode: 409 });
  expect((await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).status).not.toBe("LOCKED");
});
it("rejects invalid/missing strict request fields with 400 and keeps legacy clients working", async () => {
  const f = await fixture(), api = await server();
  try { for (const body of [undefined, {}, { expectedGenerationId: "" }, { ...f.expected, expectedGenerationId: "  " }, { ...f.expected, expectedTargetRevision: 0 }, { ...f.expected, expectedTargetRevision: 1.5 }, { ...f.expected, expectedTargetRevision: "1" }, { ...f.expected, frameId: "other" }]) expect(await api.post(`/api/frames/${f.frame.id}/lock-confirmed`, body)).toMatchObject({ status: 400 });
    expect(await api.post(`/api/frames/${f.frame.id}/lock`, {})).toMatchObject({ status: 200, body: { status: "LOCKED" } });
  } finally { await api.close(); }
});
it("allows exactly one of two overlapping Locks on independent SQLite/Prisma connections", async () => {
  const f = await fixture(); const results = await Promise.allSettled([lockFrameWithConfirmation(f.prisma, f.root, f.frame.id, f.expected), lockFrameWithConfirmation(f.other, f.root, f.frame.id, f.expected)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected").map(r => r.reason)).toEqual([expect.objectContaining({ statusCode: 409 })]);
  expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "LOCKED", selectedGenerationId: f.a.id });
});

// The Lock operation is already running, then a second real Prisma connection
// commits before its write transaction starts. Barriers avoid timing sleeps.
function pauseTransaction(prisma: PrismaClient) {
  let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
  const client = new Proxy(prisma, { get(target, prop) { if (prop === "$transaction") return async (...args: Parameters<PrismaClient["$transaction"]>) => { enter(); await gate; return Reflect.apply(target.$transaction, target, args); }; const value: unknown = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } });
  return { client, entered, release };
}
it.each(["selection", "revision"])("rejects a concurrent %s commit after Lock preflight on real SQLite", async kind => {
  const f = await fixture(), pause = pauseTransaction(f.prisma);
  const lock = lockFrameWithConfirmation(pause.client, f.root, f.frame.id, f.expected);
  const rejected = expect(lock).rejects.toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
  await pause.entered;
  try { if (kind === "selection") await selectGenerationForFrame(f.other, f.frame.id, f.b.id); else await new FrameStoryStateService(f.other).updateFrameTargetStoryState(f.frame.id, { ...f.document, time: { description: "new" } }, 1); } finally { pause.release(); }
  await rejected; expect((await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).status).toBe("REVIEW");
});

// Inject a write immediately before the conditional UPDATE in the same actual
// SQLite transaction: proves statement predicates, not a separate-client race.
function interceptWrite(prisma: PrismaClient, mutate: (tx: PrismaClient) => Promise<unknown>) {
  return new Proxy(prisma, { get(target, prop) {
    if (prop === "$transaction") return (fn: (tx: PrismaClient) => Promise<unknown>) => target.$transaction(async tx => fn(new Proxy(tx, { get(inner, key) {
      if (key === "$executeRawUnsafe") return async (sql: string, ...params: unknown[]) => { await mutate(tx as unknown as PrismaClient); return inner.$executeRawUnsafe(sql, ...params); };
      const value: unknown = Reflect.get(inner, key); return typeof value === "function" ? value.bind(inner) : value;
    } }) as unknown as PrismaClient));
    const value: unknown = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
  } });
}
it.each(["selection", "revision", "status"])("conditional SQL fences %s and rolls back the whole SQLite transaction", async kind => {
  const f = await fixture(); const client = interceptWrite(f.prisma, async tx => {
    if (kind === "revision") return tx.frameStoryState.update({ where: { frameId: f.frame.id }, data: { revision: { increment: 1 } } });
    return tx.frame.update({ where: { id: f.frame.id }, data: kind === "selection" ? { selectedGenerationId: f.b.id } : { status: "GENERATING" } });
  });
  await expect(lockFrameWithConfirmation(client, f.root, f.frame.id, f.expected)).rejects.toMatchObject({ code: "FRAME_LOCK_READINESS_STALE" });
  expect(await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).toMatchObject({ status: "REVIEW", selectedGenerationId: f.a.id });
  expect((await f.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: f.frame.id } })).revision).toBe(1);
});
it("rolls back on transaction failure without changing history", async () => {
  const f = await fixture(), before = await histories(f.prisma, f.frame.id);
  const client = interceptWrite(f.prisma, async () => { throw new Error("Injected transaction failure"); });
  await expect(lockFrameWithConfirmation(client, f.root, f.frame.id, f.expected)).rejects.toThrow("Injected transaction failure");
  expect((await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id } })).status).toBe("REVIEW"); expect(await histories(f.prisma, f.frame.id)).toEqual(before);
});

function writeBarrier(prisma: PrismaClient, method: "$executeRawUnsafe" | "$executeRaw", wait: boolean) {
  let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
  const wrap = <T extends object>(target: T): T => new Proxy(target, { get(inner, prop) {
    if (prop === method) return async (...args: unknown[]) => { enter(); if (wait) await gate; return Reflect.apply(Reflect.get(inner, prop) as (...values: unknown[]) => unknown, inner, args); };
    if (prop === "$transaction") return (fn: (tx: object) => Promise<unknown>) => prisma.$transaction(tx => fn(wrap(tx)));
    const value: unknown = Reflect.get(inner, prop); return typeof value === "function" ? value.bind(inner) : value;
  } });
  return { client: wrap(prisma), entered, release };
}
it.each(["selection", "revision"])("overlaps an actual second-connection %s write with the Lock transaction write", async kind => {
  const f = await fixture(), lockGate = writeBarrier(f.prisma, "$executeRawUnsafe", true);
  const lock = lockFrameWithConfirmation(lockGate.client, f.root, f.frame.id, f.expected);
  await lockGate.entered; // transaction has already read the facts
  const writer = writeBarrier(f.other, kind === "selection" ? "$executeRawUnsafe" : "$executeRaw", false);
  const changing = kind === "selection" ? selectGenerationForFrame(writer.client, f.frame.id, f.b.id) : new FrameStoryStateService(writer.client).updateFrameTargetStoryState(f.frame.id, { ...f.document, time: { description: "concurrent night" } }, 1);
  const settled = Promise.allSettled([lock, changing]); // attach rejection handlers before releasing either writer
  await writer.entered; lockGate.release(); await settled;
  const actual = await f.prisma.frame.findUniqueOrThrow({ where: { id: f.frame.id }, include: { targetStoryState: true } });
  if (actual.status === "LOCKED") { expect(actual.selectedGenerationId).toBe(f.a.id); expect(actual.targetStoryState!.revision).toBe(1); }
  else { expect(actual.status).toBe("REVIEW"); expect(actual.selectedGenerationId !== f.a.id || actual.targetStoryState!.revision !== 1).toBe(true); }
}, 15_000);
