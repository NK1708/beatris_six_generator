import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { projectDbManager } from "./db.js";
import { FrameStoryStateService } from "./services/frameStoryStateService.js";
import { getFrameTargetRecoveryCandidates, recoverFrameTargetStoryState } from "./services/frameStoryStateRecoveryService.js";
import { lockFrameWithSelectedGeneration, selectGenerationForFrame } from "./services/generationReviewService.js";

const directories: string[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

afterEach(async () => {
  const entries = (await projectDbManager.listRegistry()).filter(entry => entry.name.startsWith("Recovery "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await projectDbManager.closeProject();
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

describe("Frame Target legacy recovery", () => {
  it("reports complete LOCKED candidate diagnostics without treating image availability as eligibility", async () => {
    const fixture = await setup("LOCKED");
    const selected = await generation(fixture, "selected", "SUCCESS", validState(fixture), "generations/selected.png");
    await fs.mkdir(path.join(fixture.projectPath, "generations"), { recursive: true });
    await fs.writeFile(path.join(fixture.projectPath, selected.outputFilePath), png);
    const other = await generation(fixture, "other", "SUCCESS", validState(fixture), "generations/missing.png");
    const failed = await generation(fixture, "failed", "FAILED", validState(fixture), "");
    const running = await generation(fixture, "running", "RUNNING", validState(fixture), "../outside.png");
    const invalidJson = await generation(fixture, "json", "SUCCESS", "{", "");
    const missingSnapshot = await generation(fixture, "missing-snapshot", "SUCCESS", "", "");
    const invalidSchema = await generation(fixture, "schema", "SUCCESS", { sceneId: fixture.scene.id }, "");
    const sceneMismatch = await generation(fixture, "scene", "SUCCESS", { ...validState(fixture), sceneId: "other" }, "");
    const missingReference = await generation(fixture, "reference", "SUCCESS", { ...validState(fixture), characters: { missing: { present: true } } }, "");
    await fixture.prisma.frame.update({ where: { id: fixture.frame.id }, data: { selectedGenerationId: selected.id } });

    const result = await getFrameTargetRecoveryCandidates(fixture.prisma, fixture.projectPath, fixture.frame.id);
    expect(result).toMatchObject({ frameStatus: "LOCKED", targetStatus: "MISSING" });
    expect(candidate(result, selected.id)).toMatchObject({ isSelected: true, isRecommended: true, isEligible: true, snapshotValid: true, imageAvailability: "AVAILABLE" });
    expect(candidate(result, other.id)).toMatchObject({ isEligible: false, imageAvailability: "MISSING", blockingReasons: ["LOCKED_SOURCE_NOT_SELECTED"] });
    expect(candidate(result, failed.id).blockingReasons).toContain("GENERATION_NOT_SUCCESS");
    expect(candidate(result, running.id)).toMatchObject({ imageAvailability: "INVALID_PATH" });
    expect(candidate(result, invalidJson.id).blockingReasons).toContain("SNAPSHOT_INVALID");
    expect(candidate(result, missingSnapshot.id).blockingReasons).toContain("SNAPSHOT_MISSING");
    expect(candidate(result, invalidSchema.id).blockingReasons).toContain("SNAPSHOT_INVALID");
    expect(candidate(result, sceneMismatch.id).blockingReasons).toContain("SNAPSHOT_SCENE_MISMATCH");
    expect(candidate(result, missingReference.id).blockingReasons).toContain("SNAPSHOT_REFERENCE_MISSING");
  });

  it("recovers a LOCKED Frame only from selected SUCCESS and preserves immutable history", async () => {
    const fixture = await setup("LOCKED");
    const source = await generation(fixture, "selected", "SUCCESS", validState(fixture), "generations/missing.png");
    const other = await generation(fixture, "other", "SUCCESS", { ...validState(fixture), environment: { marker: "other" } }, "");
    await fixture.prisma.frame.update({ where: { id: fixture.frame.id }, data: { selectedGenerationId: source.id } });
    const before = await immutableState(fixture);
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, other.id)).rejects.toMatchObject({ code: "LOCKED_SOURCE_NOT_SELECTED" });
    const recovered = await recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, source.id);
    expect(recovered).toMatchObject({ revision: 1, document: validState(fixture), provenance: { origin: "LEGACY_GENERATION_INPUT", sourceFrameId: fixture.frame.id, sourceGenerationId: source.id }, explicitlyEditedAt: null });
    expect(await immutableState(fixture)).toEqual(before);
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, source.id)).rejects.toMatchObject({ code: "TARGET_ALREADY_INITIALIZED" });
  });

  it.each(["REVIEW", "DRAFT"])("recovers an explicitly selected SUCCESS source for %s without changing selection", async status => {
    const fixture = await setup(status);
    const first = await generation(fixture, "first", "SUCCESS", validState(fixture), "");
    const secondState = { ...validState(fixture), environment: { marker: "second" } };
    const second = await generation(fixture, "second", "SUCCESS", secondState, "");
    const result = await getFrameTargetRecoveryCandidates(fixture.prisma, fixture.projectPath, fixture.frame.id);
    expect(candidate(result, first.id).isEligible).toBe(true);
    expect(candidate(result, second.id).isEligible).toBe(true);
    expect(result.candidates.some(item => item.isRecommended)).toBe(false);
    await recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, second.id);
    expect(await fixture.prisma.frame.findUniqueOrThrow({ where: { id: fixture.frame.id } })).toMatchObject({ status, selectedGenerationId: null });
    expect(JSON.parse((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: fixture.frame.id } })).document)).toEqual(secondState);
  });

  it("blocks GENERATING, foreign/non-success sources and invalid snapshots with typed errors", async () => {
    const fixture = await setup("REVIEW");
    const failed = await generation(fixture, "failed", "FAILED", validState(fixture), "");
    const invalid = await generation(fixture, "invalid", "SUCCESS", "{", "");
    const otherFrame = await fixture.prisma.frame.create({ data: { sceneId: fixture.scene.id, sequence: 2, frameCode: "S001_F002" } });
    const foreign = await fixture.prisma.generation.create({ data: baseGeneration(otherFrame.id, "foreign", JSON.stringify(validState(fixture))) });
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, failed.id)).rejects.toMatchObject({ code: "GENERATION_NOT_SUCCESS" });
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, invalid.id)).rejects.toMatchObject({ code: "SNAPSHOT_INVALID" });
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, foreign.id)).rejects.toMatchObject({ code: "GENERATION_OWNERSHIP_MISMATCH" });
    await fixture.prisma.frame.update({ where: { id: fixture.frame.id }, data: { status: "GENERATING" } });
    await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, failed.id)).rejects.toMatchObject({ code: "FRAME_GENERATING" });
  });

  it("never overwrites AVAILABLE or INVALID existing targets", async () => {
    for (const document of [JSON.stringify(validState(awaitableFixtureMarker)), "corrupt"]) {
      const fixture = await setup("REVIEW");
      const source = await generation(fixture, "source", "SUCCESS", validState(fixture), "");
      const persistedDocument = document.includes("awaitable") ? JSON.stringify(validState(fixture)) : document;
      await fixture.prisma.frameStoryState.create({ data: { frameId: fixture.frame.id, document: persistedDocument, originType: "EXPLICIT" } });
      const candidates = await getFrameTargetRecoveryCandidates(fixture.prisma, fixture.projectPath, fixture.frame.id);
      expect(candidates.targetStatus).toBe(persistedDocument === "corrupt" ? "INVALID" : "AVAILABLE");
      expect(candidate(candidates, source.id).blockingReasons).toContain("TARGET_ALREADY_INITIALIZED");
      await expect(recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, source.id)).rejects.toMatchObject({ code: "TARGET_ALREADY_INITIALIZED" });
      expect((await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: fixture.frame.id } })).document).toBe(persistedDocument);
      await cleanupFixture(fixture);
    }
  });

  it("makes concurrent recovery create exactly one immutable source", async () => {
    const fixture = await setup("REVIEW");
    const first = await generation(fixture, "first", "SUCCESS", validState(fixture), "");
    const second = await generation(fixture, "second", "SUCCESS", { ...validState(fixture), environment: { marker: "second" } }, "");
    const results = await Promise.allSettled([
      recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, first.id),
      recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, second.id)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toMatchObject({ code: expect.stringMatching(/TARGET_ALREADY_INITIALIZED|RECOVERY_CONFLICT/) });
    expect(await fixture.prisma.frameStoryState.count({ where: { frameId: fixture.frame.id } })).toBe(1);
    const persisted = await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: fixture.frame.id } });
    expect([first.id, second.id]).toContain(persisted.sourceGenerationId);
  });

  it("keeps recovery independent from concurrent Selection and safe against Lock/PUT", async () => {
    const fixture = await setup("REVIEW");
    const source = await generation(fixture, "source", "SUCCESS", validState(fixture), "generations/source.png");
    const other = await generation(fixture, "other", "SUCCESS", { ...validState(fixture), environment: { marker: "other" } }, "generations/other.png");
    await fs.mkdir(path.join(fixture.projectPath, "generations"), { recursive: true });
    await Promise.all([fs.writeFile(path.join(fixture.projectPath, source.outputFilePath), png), fs.writeFile(path.join(fixture.projectPath, other.outputFilePath), png)]);
    await fixture.prisma.frame.update({ where: { id: fixture.frame.id }, data: { selectedGenerationId: source.id } });

    const [recovery, selection, lock, update] = await Promise.allSettled([
      recoverFrameTargetStoryState(fixture.prisma, fixture.frame.id, source.id),
      selectGenerationForFrame(fixture.prisma, fixture.frame.id, other.id),
      lockFrameWithSelectedGeneration(fixture.prisma, fixture.projectPath, fixture.frame.id),
      new FrameStoryStateService(fixture.prisma).updateFrameTargetStoryState(fixture.frame.id, { ...validState(fixture), environment: { marker: "edited" } }, 1)
    ]);
    expect(recovery.status).toBe("fulfilled");
    const target = await fixture.prisma.frameStoryState.findUniqueOrThrow({ where: { frameId: fixture.frame.id } });
    expect(target.sourceGenerationId).toBe(source.id);
    expect(target.revision).toBeGreaterThanOrEqual(1);
    const frame = await fixture.prisma.frame.findUniqueOrThrow({ where: { id: fixture.frame.id } });
    if (frame.status === "LOCKED") expect(frame.selectedGenerationId).toBe(source.id);
    if (selection.status === "fulfilled") expect(frame.selectedGenerationId).toBe(other.id);
    if (lock.status === "rejected") expect(lock.reason).toMatchObject({ code: expect.stringMatching(/FRAME_LOCK_BLOCKED|FRAME_LOCK_READINESS_STALE/) });
    if (update.status === "rejected") expect(update.reason).toMatchObject({ code: expect.stringMatching(/TARGET_NOT_INITIALIZED|REVISION_CONFLICT|FRAME_LOCKED/) });
  });

  it("blocks ordinary initialize for a legacy Frame, including a concurrent Generation creation", async () => {
    const fixture = await setup("REVIEW");
    await generation(fixture, "legacy", "SUCCESS", validState(fixture), "");
    await expect(new FrameStoryStateService(fixture.prisma).initializeFrameTargetStoryState(fixture.frame.id)).rejects.toMatchObject({ code: "LEGACY_RECOVERY_REQUIRED" });
    expect(await fixture.prisma.frameStoryState.count()).toBe(0);

    const fresh = await fixture.prisma.frame.create({ data: { sceneId: fixture.scene.id, sequence: 2, frameCode: "S001_F002" } });
    const race = await Promise.allSettled([
      new FrameStoryStateService(fixture.prisma).initializeFrameTargetStoryState(fresh.id),
      fixture.prisma.generation.create({ data: baseGeneration(fresh.id, "race", JSON.stringify(validState(fixture))) })
    ]);
    expect(race.some(result => result.status === "fulfilled")).toBe(true);
    expect(await fixture.prisma.frameStoryState.count({ where: { frameId: fresh.id } }) + await fixture.prisma.generation.count({ where: { frameId: fresh.id } })).toBeGreaterThanOrEqual(1);
    expect(await fixture.prisma.frameStoryState.count({ where: { frameId: fresh.id } })).toBeLessThanOrEqual(1);
  });

  it("exposes typed GET/POST contracts and validates a missing source", async () => {
    const fixture = await setup("REVIEW");
    const source = await generation(fixture, "source", "SUCCESS", validState(fixture), "");
    const api = await startApi();
    try {
      expect(await api.request("GET", `/api/frames/${fixture.frame.id}/target-story-state/recovery-candidates`)).toMatchObject({ status: 200, body: { frameId: fixture.frame.id, targetStatus: "MISSING", candidates: [{ generationId: source.id, isEligible: true }] } });
      expect(await api.request("POST", `/api/frames/${fixture.frame.id}/target-story-state/recover`, {})).toMatchObject({ status: 400, body: { code: "RECOVERY_SOURCE_REQUIRED" } });
      expect(await api.request("POST", `/api/frames/${fixture.frame.id}/target-story-state/recover`, { sourceGenerationId: source.id })).toMatchObject({ status: 201, body: { status: "AVAILABLE", revision: 1, originType: "LEGACY_GENERATION_INPUT", sourceGenerationId: source.id } });
    } finally { await api.close(); }
  });
});

const awaitableFixtureMarker = { scene: { id: "awaitable" }, character: { id: "character" }, outfit: { id: "outfit" } } as const;

async function setup(status: string) {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "bearridge-recovery-")); directories.push(projectPath);
  const context = await projectDbManager.createProject({ name: `Recovery ${path.basename(projectPath)}`, rootPath: projectPath });
  const character = await context.prisma.character.create({ data: { projectId: context.project.id, name: "Hero", slug: "hero" } });
  const outfit = await context.prisma.outfit.create({ data: { characterId: character.id, name: "Default", slug: "default" } });
  const scene = await context.prisma.scene.create({ data: { projectId: context.project.id, sequence: 1, name: "Scene" } });
  await context.prisma.storyState.create({ data: { sceneId: scene.id, document: JSON.stringify({ ...validState({ scene, character, outfit }), environment: { marker: "live-scene-must-not-be-used" } }) } });
  const frame = await context.prisma.frame.create({ data: { sceneId: scene.id, sequence: 1, frameCode: "S001_F001", status } });
  return { ...context, projectPath, scene, character, outfit, frame };
}

function validState(fixture: { scene: { id: string }; character: { id: string }; outfit: { id: string } }) {
  return { sceneId: fixture.scene.id, time: { description: "day" }, environment: { marker: "snapshot" }, characters: { [fixture.character.id]: { present: true, outfitId: fixture.outfit.id } }, props: {}, storyFacts: ["historical"] };
}

async function generation(fixture: Awaited<ReturnType<typeof setup>>, suffix: string, status: string, snapshot: unknown, outputFilePath: string) {
  return fixture.prisma.generation.create({ data: { ...baseGeneration(fixture.frame.id, suffix, typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot)), status, outputFilePath } });
}

function baseGeneration(frameId: string, suffix: string, storyStateSnapshot: string) {
  return { frameId, provider: "test", model: "test", prompt: suffix, status: "SUCCESS", outputFilePath: "", resolution: "1x1", aspectRatio: "1:1", storyStateSnapshot, frameSnapshot: "{}" };
}

function candidate(result: Awaited<ReturnType<typeof getFrameTargetRecoveryCandidates>>, id: string) { return result.candidates.find(item => item.generationId === id)!; }

async function immutableState(fixture: Awaited<ReturnType<typeof setup>>) {
  return {
    frame: await fixture.prisma.frame.findUniqueOrThrow({ where: { id: fixture.frame.id }, select: { status: true, selectedGenerationId: true } }),
    generations: await fixture.prisma.generation.findMany({ where: { frameId: fixture.frame.id }, orderBy: { id: "asc" } }),
    sceneState: await fixture.prisma.storyState.findUniqueOrThrow({ where: { sceneId: fixture.scene.id } })
  };
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof setup>>) {
  await projectDbManager.closeProject();
  const index = directories.indexOf(fixture.projectPath); if (index >= 0) directories.splice(index, 1);
  await fs.rm(fixture.projectPath, { recursive: true, force: true });
}

async function startApi() {
  const server = http.createServer(createApp()); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No server address.");
  return { async request(method: "GET" | "POST", route: string, body?: unknown) { const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); return { status: response.status, body: await response.json() as Record<string, unknown> }; }, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
