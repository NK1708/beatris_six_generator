import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Project } from "@prisma/client";
import { slugify } from "@bearridge/core";
import { createProjectSchema, deleteProjectSchema, openProjectSchema } from "@bearridge/shared";
import { initAppRegistrySchema, initSqliteSchema } from "./services/sqliteSchema.js";
import { config } from "./config.js";
import { AppError, NotFoundError } from "./errors.js";
import { FileService } from "./services/fileService.js";
import { logger } from "./logger.js";

export interface ProjectRegistryEntry {
  id: string;
  name: string;
  projectPath: string;
  lastOpenedAt: Date | null;
  createdAt: Date;
}

export interface ProjectContext {
  projectPath: string;
  databasePath: string;
  prisma: PrismaClient;
  project: Project;
}

export interface ProjectContextLease extends ProjectContext {
  release(): Promise<void>;
}

interface ManagedProjectContext {
  context: ProjectContext;
  active: boolean;
  leaseCount: number;
  closed: boolean;
  disconnectPromise?: Promise<void>;
}

const fileService = new FileService();

export class ProjectDatabaseManager {
  private readonly appDatabasePath = path.join(config.projectsRoot, "app.sqlite");
  private readonly appPrisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(this.appDatabasePath) } } });
  private active: ManagedProjectContext | null = null;
  private readonly contexts = new Set<ManagedProjectContext>();

  async init(): Promise<void> {
    await fs.mkdir(config.projectsRoot, { recursive: true });
    await initAppRegistrySchema(sqliteUrl(this.appDatabasePath));
  }

  async listRegistry(): Promise<ProjectRegistryEntry[]> {
    await this.init();
    const rows = await this.appPrisma.$queryRaw<ProjectRegistryEntry[]>`
      SELECT id, name, projectPath, lastOpenedAt, createdAt
      FROM ProjectRegistryEntry
      ORDER BY COALESCE(lastOpenedAt, createdAt) DESC
    `;
    return rows.map((entry) => ({ ...entry, projectPath: this.resolveRegistryPath(entry.projectPath) }));
  }

  async createProject(rawInput: unknown): Promise<ProjectContext> {
    await this.init();
    const input = createProjectSchema.parse(rawInput);
    const slug = slugify(input.name);
    const projectPath = path.resolve(input.rootPath ?? path.join(config.projectsRoot, slug));
    const databasePath = path.join(projectPath, "project.sqlite");

    await fileService.createProjectFolders(projectPath);
    await initSqliteSchema(sqliteUrl(databasePath));

    const prisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(databasePath) } } });
    const project = await prisma.project.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        rootPath: projectPath,
        defaultAspectRatio: input.defaultAspectRatio,
        defaultResolution: input.defaultResolution,
        defaultDraftModel: input.defaultDraftModel,
        defaultProductionModel: input.defaultProductionModel
      }
    });

    await fileService.writeProjectManifest(projectPath, {
      id: project.id,
      name: project.name,
      slug: project.slug,
      database: "project.sqlite",
      createdAt: project.createdAt
    });
    await this.registerProject(project.id, project.name, projectPath);
    await this.setActive({ projectPath, databasePath, prisma, project });
    return this.getActiveProject();
  }

  async openProject(rawInput: unknown): Promise<ProjectContext> {
    await this.init();
    const input = openProjectSchema.parse(rawInput);
    const projectPath = path.resolve(input.projectPath);
    const manifestPath = path.join(projectPath, "project.json");
    const databasePath = path.join(projectPath, "project.sqlite");

    await assertFileExists(manifestPath, "project.json not found in selected folder.");
    await assertFileExists(databasePath, "project.sqlite not found in selected folder.");

    const manifest = await readProjectManifest(manifestPath);
    const databaseProjectId = await readProjectIdReadOnly(databasePath);
    if (manifest.id !== databaseProjectId) {
      throw new AppError("project.json does not belong to this project.sqlite.", 409, "PROJECT_ID_MISMATCH");
    }

    await initSqliteSchema(sqliteUrl(databasePath));

    const prisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(databasePath) } } });
    const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
    if (!project) {
      await prisma.$disconnect();
      throw new NotFoundError("Project metadata not found in project.sqlite.");
    }

    await this.registerProject(project.id, project.name, projectPath);
    await this.setActive({ projectPath, databasePath, prisma, project });
    return this.getActiveProject();
  }

  async openRegisteredProject(id: string): Promise<ProjectContext> {
    await this.init();
    const rows = await this.appPrisma.$queryRaw<ProjectRegistryEntry[]>`
      SELECT id, name, projectPath, lastOpenedAt, createdAt
      FROM ProjectRegistryEntry
      WHERE id = ${id}
      LIMIT 1
    `;
    const entry = rows[0];
    if (!entry) {
      throw new NotFoundError("Registered project not found.");
    }
    let projectPath = this.resolveRegistryPath(entry.projectPath);
    if (!await projectFolderExists(projectPath)) {
      projectPath = await this.recoverRegisteredProjectPath(entry.id, projectPath);
    }
    return this.openProject({ projectPath });
  }

  async deleteProject(rawInput: unknown): Promise<{ id: string; projectPath: string; deletedFiles: boolean }> {
    await this.init();
    const input = deleteProjectSchema.parse(rawInput);
    const rows = await this.appPrisma.$queryRaw<ProjectRegistryEntry[]>`
      SELECT id, name, projectPath, lastOpenedAt, createdAt
      FROM ProjectRegistryEntry
      WHERE id = ${input.projectId}
      LIMIT 1
    `;
    const entry = rows[0];
    if (!entry) {
      throw new NotFoundError("Registered project not found.");
    }
    const projectPath = this.resolveRegistryPath(entry.projectPath);

    if (input.deleteFiles) {
      if (input.confirmationName !== entry.name) {
        throw new AppError("Project folder deletion requires exact project name confirmation.", 400, "PROJECT_DELETE_CONFIRMATION_REQUIRED");
      }
      await assertDeletableProjectFolder(projectPath);
    }

    if (this.active?.context.project.id === input.projectId) {
      await this.closeProject();
    }

    await this.appPrisma.$executeRaw`
      DELETE FROM ProjectRegistryEntry WHERE id = ${input.projectId}
    `;

    if (input.deleteFiles) {
      await fs.rm(projectPath, { recursive: true, force: false });
    }

    return { id: input.projectId, projectPath, deletedFiles: input.deleteFiles };
  }

  async closeProject(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.active = false;
    await this.disconnectIfUnused(active);
  }

  getActiveProject(): ProjectContext {
    if (!this.active || this.active.closed) {
      throw new AppError("No active project is open.", 409, "NO_ACTIVE_PROJECT");
    }
    return this.active.context;
  }

  acquireActiveProject(): ProjectContextLease {
    const managed = this.active;
    if (!managed || managed.closed) {
      throw new AppError("No active project is open.", 409, "NO_ACTIVE_PROJECT");
    }
    managed.leaseCount += 1;
    let released = false;
    return {
      ...managed.context,
      release: async () => {
        if (released) return;
        released = true;
        if (managed.leaseCount <= 0) {
          logger.error({ projectPath: managed.context.projectPath }, "project context lease counter underflow prevented");
          return;
        }
        managed.leaseCount -= 1;
        await this.disconnectIfUnused(managed);
      }
    };
  }

  getContextLifecycleSnapshot(): Array<{ projectPath: string; active: boolean; leaseCount: number; closed: boolean }> {
    return [...this.contexts].map((managed) => ({
      projectPath: managed.context.projectPath,
      active: managed.active,
      leaseCount: managed.leaseCount,
      closed: managed.closed
    }));
  }

  private async setActive(context: ProjectContext): Promise<void> {
    const previous = this.active;
    if (previous) previous.active = false;
    const managed: ManagedProjectContext = { context, active: true, leaseCount: 0, closed: false };
    this.contexts.add(managed);
    this.active = managed;
    if (previous) await this.disconnectIfUnused(previous);
    await this.appPrisma.$executeRaw`
      UPDATE ProjectRegistryEntry SET lastOpenedAt = CURRENT_TIMESTAMP WHERE id = ${context.project.id}
    `;
  }

  private async disconnectIfUnused(managed: ManagedProjectContext): Promise<void> {
    if (managed.active || managed.leaseCount > 0 || managed.closed) {
      if (managed.disconnectPromise) await managed.disconnectPromise;
      return;
    }
    managed.closed = true;
    managed.disconnectPromise = managed.context.prisma.$disconnect()
      .catch((error: unknown) => {
        logger.error({ error, projectPath: managed.context.projectPath }, "failed to disconnect project database");
      })
      .finally(() => {
        this.contexts.delete(managed);
      });
    await managed.disconnectPromise;
  }

  private async registerProject(id: string, name: string, projectPath: string): Promise<void> {
    const storedPath = this.registryPathForStorage(projectPath);
    await this.appPrisma.$executeRaw`
      DELETE FROM ProjectRegistryEntry
      WHERE id = ${id} OR projectPath = ${storedPath}
    `;
    await this.appPrisma.$executeRaw`
      INSERT INTO ProjectRegistryEntry (id, name, projectPath, lastOpenedAt, createdAt)
      VALUES (${id}, ${name}, ${storedPath}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
  }

  private registryPathForStorage(projectPath: string): string {
    const relative = path.relative(config.projectsRoot, path.resolve(projectPath));
    if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
      return `./${relative.replaceAll("\\", "/")}`;
    }
    return path.resolve(projectPath);
  }

  private resolveRegistryPath(storedPath: string): string {
    return path.isAbsolute(storedPath) || path.win32.isAbsolute(storedPath)
      ? path.resolve(storedPath)
      : path.resolve(config.projectsRoot, storedPath);
  }

  private async recoverRegisteredProjectPath(projectId: string, stalePath: string): Promise<string> {
    const entries = await fs.readdir(config.projectsRoot, { withFileTypes: true });
    const matches: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(config.projectsRoot, entry.name);
      try {
        const manifest = await readProjectManifest(path.join(candidate, "project.json"));
        if (manifest.id === projectId && await projectFolderExists(candidate)) matches.push(candidate);
      } catch {
        // Unrelated or incomplete directories are not project candidates.
      }
    }
    if (matches.length === 1) {
      await this.appPrisma.$executeRaw`UPDATE ProjectRegistryEntry SET projectPath = ${this.registryPathForStorage(matches[0]!)} WHERE id = ${projectId}`;
      return matches[0]!;
    }
    if (matches.length > 1) {
      throw new AppError("Multiple project folders have the same project ID. Open the intended folder explicitly.", 409, "PROJECT_PATH_AMBIGUOUS");
    }
    throw new AppError(`Registered project folder is unavailable: ${stalePath}. Select the moved project folder with Open Project.`, 404, "PROJECT_PATH_STALE");
  }
}

async function assertDeletableProjectFolder(projectPath: string): Promise<void> {
  const resolved = path.resolve(projectPath);
  if (resolved === path.parse(resolved).root) {
    throw new AppError("Refusing to delete filesystem root.", 400, "UNSAFE_PROJECT_PATH");
  }
  await assertFileExists(path.join(resolved, "project.json"), "project.json not found in selected folder.");
  await assertFileExists(path.join(resolved, "project.sqlite"), "project.sqlite not found in selected folder.");
}

async function assertFileExists(filePath: string, message: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new NotFoundError(message);
  }
}

export function sqliteUrl(databasePath: string): string {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

async function projectFolderExists(projectPath: string): Promise<boolean> {
  try {
    await Promise.all([fs.access(path.join(projectPath, "project.json")), fs.access(path.join(projectPath, "project.sqlite"))]);
    return true;
  } catch { return false; }
}

async function readProjectManifest(manifestPath: string): Promise<{ id: string }> {
  let parsed: unknown;
  try { parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")); }
  catch { throw new AppError("project.json is missing, unreadable, or invalid JSON.", 400, "PROJECT_MANIFEST_INVALID"); }
  if (!parsed || typeof parsed !== "object" || !("id" in parsed) || typeof parsed.id !== "string" || !parsed.id.trim()) {
    throw new AppError("project.json does not contain a valid project ID.", 400, "PROJECT_MANIFEST_INVALID");
  }
  return { id: parsed.id };
}

async function readProjectIdReadOnly(databasePath: string): Promise<string> {
  const prisma = new PrismaClient({ datasources: { db: { url: `${sqliteUrl(databasePath)}?mode=ro&immutable=1` } } });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Project" LIMIT 1`);
    if (!rows[0]?.id) throw new AppError("Project metadata not found in project.sqlite.", 404, "PROJECT_METADATA_MISSING");
    return rows[0].id;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("project.sqlite is unavailable or unreadable.", 400, "PROJECT_DATABASE_UNREADABLE");
  } finally { await prisma.$disconnect(); }
}

export const projectDbManager = new ProjectDatabaseManager();
