import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
dotenv.config({ path: path.join(root, ".env") });

assertSupportedNode();
await requirePath(path.join(root, "node_modules"), "Dependencies are missing. Run `npm ci` first.");
await requirePath(path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma"), "Prisma CLI is missing. Run `npm ci`.");

await runNpm(["run", "build:packages"]);
await runNpm(["run", "prisma:generate"]);
await runNpm(["run", "build"]);

const projectsRoot = resolveProjectsRoot();
await fs.mkdir(projectsRoot, { recursive: true });
const { initAppRegistrySchema } = await import("../apps/api/dist/services/sqliteSchema.js");
await initAppRegistrySchema(`file:${path.join(projectsRoot, "app.sqlite").replaceAll("\\", "/")}`);

await runNpm(["run", "doctor"]);
console.log("\nBearridge setup completed. Start with: npm run dev");

function assertSupportedNode() {
  const major = Number(process.versions.node.split(".")[0]);
  const minor = Number(process.versions.node.split(".")[1]);
  if (major < 20 || major >= 23 || (major === 20 && minor < 18)) {
    throw new Error(`Unsupported Node.js ${process.versions.node}. Install Node.js 20.18–22.x.`);
  }
}

async function requirePath(target, message) {
  try { await fs.access(target); } catch { throw new Error(message); }
}

function runNpm(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return Promise.reject(new Error("npm CLI path is unavailable. Run setup through `npm run setup`."));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], { cwd: root, stdio: "inherit", shell: false, env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(" ")} failed with exit code ${code}.`)));
  });
}

function resolveProjectsRoot() {
  return path.resolve(root, "apps/api", process.env.PROJECTS_ROOT || "./projects");
}
