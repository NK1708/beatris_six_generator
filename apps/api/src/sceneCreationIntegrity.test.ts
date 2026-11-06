import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";

const roots: string[] = [];
afterEach(async () => { await projectDbManager.closeProject(); for (const p of (await projectDbManager.listRegistry()).filter(p => p.name.startsWith("Scene Creation "))) await projectDbManager.deleteProject({ projectId: p.id, deleteFiles: false }); await Promise.all(roots.splice(0).map(r => fs.rm(r, { recursive: true, force: true }))); });
it("persists all four Scene context combinations, validates IDs, keeps update null and initializes the first Frame", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-create-scene-")); roots.push(root);
  const f = await projectDbManager.createProject({ name: `Scene Creation ${path.basename(root)}`, rootPath: root });
  const location = await f.prisma.location.create({ data: { projectId: f.project.id, name: "Lounge", slug: "lounge" } });
  const style = await f.prisma.styleProfile.create({ data: { projectId: f.project.id, name: "Minimal", slug: "minimal" } });
  const s = http.createServer(createApp()); await new Promise<void>(r => s.listen(0, "127.0.0.1", r)); const address = s.address(); if (!address || typeof address === "string") throw Error("No port");
  const request = async (method: string, url: string, body?: unknown) => { const r = await fetch(`http://127.0.0.1:${address.port}${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() as Record<string, unknown> }; };
  try {
    let firstId = "";
    const variants = [{}, { locationId: location.id }, { styleProfileId: style.id }, { locationId: location.id, styleProfileId: style.id }];
    for (let i = 0; i < variants.length; i++) {
      const result = await request("POST", "/api/scenes", { projectId: f.project.id, sequence: i + 1, name: `Scene ${i}`, ...variants[i] });
      expect(result.status).toBe(201); const id = String(result.body.id); if (!i) firstId = id;
      expect(await f.prisma.scene.findUniqueOrThrow({ where: { id } })).toMatchObject({ locationId: variants[i]!.locationId ?? null, styleProfileId: variants[i]!.styleProfileId ?? null });
      expect(await f.prisma.storyState.findUnique({ where: { sceneId: id } })).not.toBeNull();
    }
    for (const bad of [{ locationId: "missing" }, { styleProfileId: "missing" }, { locationId: "" }, { styleProfileId: "" }, { locationId: null }, { styleProfileId: null }]) expect(await request("POST", "/api/scenes", { projectId: f.project.id, sequence: 5, name: "Invalid", ...bad })).toMatchObject({ status: 400 });
    expect(await f.prisma.scene.count()).toBe(4);
    const last = await f.prisma.scene.findFirstOrThrow({ where: { sequence: 4 } });
    const beforeState = await f.prisma.storyState.findUniqueOrThrow({ where: { sceneId: last.id } });
    expect(await request("PUT", `/api/scenes/${last.id}`, { name: "Cleared", characterIds: [], locationId: null, styleProfileId: null })).toMatchObject({ status: 200, body: { locationId: null, styleProfileId: null } });
    expect(await f.prisma.storyState.findUniqueOrThrow({ where: { sceneId: last.id } })).toEqual(beforeState);
    expect(await request("POST", "/api/frames", { sceneId: firstId })).toMatchObject({ status: 201, body: { target: { status: "AVAILABLE" } } });
    await projectDbManager.closeProject(); const reopened = await projectDbManager.openProject({ projectPath: root });
    expect(await reopened.prisma.scene.count()).toBe(4); expect(await reopened.prisma.frame.count()).toBe(1);
  } finally { await new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())); }
});
