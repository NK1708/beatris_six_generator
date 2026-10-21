import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Project } from "@prisma/client";
import { slugify } from "@bearridge/core";
import { createProjectSchema, deleteProjectSchema, openProjectSchema } from "@bearridge/shared";
import { initAppRegistrySchema, initSqliteSchema } from "./services/sqliteSchema.js";
import { config } from "./config.js";
import { AppError, NotFoundError } from "./errors.js";
import { FileService } from "./services/fileService.js";

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

const fileService = new FileService();

export class ProjectDatabaseManager {
  private readonly appDatabasePath = path.join(config.projectsRoot, "app.sqlite");
  private readonly appPrisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(this.appDatabasePath) } } });
  private active: ProjectContext | null = null;

  async init(): Promise<void> {
    await fs.mkdir(config.projectsRoot, { recursive: true });
    await initAppRegistrySchema(sqliteUrl(this.appDatabasePath));
  }

  async listRegistry(): Promise<ProjectRegistryEntry[]> {
    await this.init();
    return this.appPrisma.$queryRaw<ProjectRegistryEntry[]>`
      SELECT id, name, projectPath, lastOpenedAt, createdAt
      FROM ProjectRegistryEntry
      ORDER BY COALESCE(lastOpenedAt, createdAt) DESC
    `;
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
    return this.openProject({ projectPath: entry.projectPath });
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

    if (input.deleteFiles) {
      if (input.confirmationName !== entry.name) {
        throw new AppError("Project folder deletion requires exact project name confirmation.", 400, "PROJECT_DELETE_CONFIRMATION_REQUIRED");
      }
      await assertDeletableProjectFolder(entry.projectPath);
    }

    if (this.active?.project.id === input.projectId) {
      await this.closeProject();
    }

    await this.appPrisma.$executeRaw`
      DELETE FROM ProjectRegistryEntry WHERE id = ${input.projectId}
    `;

    if (input.deleteFiles) {
      await fs.rm(entry.projectPath, { recursive: true, force: false });
    }

    return { id: input.projectId, projectPath: entry.projectPath, deletedFiles: input.deleteFiles };
  }

  async closeProject(): Promise<void> {
    if (this.active) {
      await this.active.prisma.$disconnect();
      this.active = null;
    }
  }

  getActiveProject(): ProjectContext {
    if (!this.active) {
      throw new AppError("No active project is open.", 409, "NO_ACTIVE_PROJECT");
    }
    return this.active;
  }

  private async setActive(context: ProjectContext): Promise<void> {
    await this.closeProject();
    this.active = context;
    await this.appPrisma.$executeRaw`
      UPDATE ProjectRegistryEntry SET lastOpenedAt = CURRENT_TIMESTAMP WHERE id = ${context.project.id}
    `;
  }

  private async registerProject(id: string, name: string, projectPath: string): Promise<void> {
    await this.appPrisma.$executeRaw`
      DELETE FROM ProjectRegistryEntry
      WHERE id = ${id} OR projectPath = ${projectPath}
    `;
    await this.appPrisma.$executeRaw`
      INSERT INTO ProjectRegistryEntry (id, name, projectPath, lastOpenedAt, createdAt)
      VALUES (${id}, ${name}, ${projectPath}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
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

export const projectDbManager = new ProjectDatabaseManager();
