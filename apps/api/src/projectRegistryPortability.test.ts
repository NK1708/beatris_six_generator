import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "./config.js";
import { projectDbManager } from "./db.js";

const roots: string[] = [];

afterEach(async () => {
  await projectDbManager.closeProject();
  const entries = (await projectDbManager.listRegistry()).filter((entry) => entry.name.startsWith("Portable registry "));
  for (const entry of entries) await projectDbManager.deleteProject({ projectId: entry.id, deleteFiles: false });
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

describe("portable project registry", () => {
  it("recovers a moved project under PROJECTS_ROOT by manifest project ID", async () => {
    const original = path.join(config.projectsRoot, `portable-original-${process.pid}-${Date.now()}`);
    const moved = path.join(config.projectsRoot, `portable-moved-${process.pid}-${Date.now()}`);
    roots.push(original, moved);
    const created = await projectDbManager.createProject({ name: `Portable registry ${Date.now()}`, rootPath: original });
    await projectDbManager.closeProject();
    await fs.rename(original, moved);

    const reopened = await projectDbManager.openRegisteredProject(created.project.id);
    expect(reopened.projectPath).toBe(moved);
    expect(reopened.project.id).toBe(created.project.id);
    expect((await projectDbManager.listRegistry()).find((entry) => entry.id === created.project.id)?.projectPath).toBe(moved);
  });

  it("does not bind projects by name and rejects a mismatched manifest/database pair", async () => {
    const firstRoot = path.join(config.projectsRoot, `portable-a-${process.pid}-${Date.now()}`);
    const secondRoot = path.join(config.projectsRoot, `portable-b-${process.pid}-${Date.now()}`);
    roots.push(firstRoot, secondRoot);
    const first = await projectDbManager.createProject({ name: `Portable registry Same`, rootPath: firstRoot });
    await projectDbManager.closeProject();
    const second = await projectDbManager.createProject({ name: `Portable registry Same`, rootPath: secondRoot });
    await projectDbManager.closeProject();
    expect(first.project.id).not.toBe(second.project.id);

    const secondManifest = await fs.readFile(path.join(secondRoot, "project.json"), "utf8");
    await fs.writeFile(path.join(firstRoot, "project.json"), secondManifest, "utf8");
    await expect(projectDbManager.openProject({ projectPath: firstRoot })).rejects.toMatchObject({ code: "PROJECT_ID_MISMATCH" });
  });

  it("reports a stale external path instead of opening another project", async () => {
    const externalRoot = await fs.mkdtemp(path.join(path.dirname(config.projectsRoot), "bearridge-portable-external-"));
    roots.push(externalRoot);
    const created = await projectDbManager.createProject({ name: `Portable registry ${Date.now()}`, rootPath: externalRoot });
    await projectDbManager.closeProject();
    await fs.rm(externalRoot, { recursive: true, force: true });
    await expect(projectDbManager.openRegisteredProject(created.project.id)).rejects.toMatchObject({ code: "PROJECT_PATH_STALE" });
  });
});
