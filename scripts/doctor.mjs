import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

const root = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: path.join(root, ".env") });
const checks = [];

check("Node.js", supportedNode(), `found ${process.versions.node}; required 20.18–22.x`, "Install the version from .nvmrc/.node-version.");
let npmVersion = "unavailable";
try {
  if (process.env.npm_execpath) npmVersion = execFileSync(process.execPath, [process.env.npm_execpath, "--version"], { encoding: "utf8", windowsHide: true }).trim();
} catch {}
check("npm", Number(npmVersion.split(".")[0]) >= 10, `found ${npmVersion}; required >=10`, "Install npm 10 or newer.");
await pathCheck("Dependencies", "node_modules", "Run `npm ci`.");
await pathCheck("Shared package JS", "packages/shared/dist/index.js", "Run `npm run setup` or `npm run build:packages`.");
await pathCheck("Shared package types", "packages/shared/dist/index.d.ts", "Run `npm run setup`.");
await pathCheck("Core package JS", "packages/core/dist/index.js", "Run `npm run setup` or `npm run build:packages`.");
await pathCheck("Core benchmark module", "packages/core/dist/benchmarkPlan.js", "Run `npm run setup`.");
await pathCheck("Prisma Client", "node_modules/.prisma/client/index.js", "Run `npm run prisma:generate`.");
await pathCheck("API build", "apps/api/dist/server.js", "Run `npm run setup` or `npm run build`.");
await pathCheck("Web build", "apps/web/dist/index.html", "Run `npm run setup` or `npm run build`.");

for (const packageName of ["@bearridge/shared", "@bearridge/core"]) {
  try { await import(packageName); check(`Package ${packageName}`, true, "resolvable", ""); }
  catch (error) { check(`Package ${packageName}`, false, error instanceof Error ? error.message : String(error), "Run `npm run setup`."); }
}

const projectsRoot = path.resolve(root, "apps/api", process.env.PROJECTS_ROOT || "./projects");
try {
  const stat = await fs.stat(projectsRoot);
  await fs.access(projectsRoot, fsConstants.R_OK | fsConstants.W_OK);
  check("Projects directory", stat.isDirectory(), projectsRoot, "Set PROJECTS_ROOT to an accessible directory.");
} catch (error) {
  check("Projects directory", false, `${projectsRoot}: ${error instanceof Error ? error.message : error}`, "Run `npm run setup` or fix PROJECTS_ROOT permissions.");
}

for (const item of checks) console.log(`${item.ok ? "OK" : "FAIL"}  ${item.name}: ${item.detail}${item.ok || !item.action ? "" : `\n      Fix: ${item.action}`}`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
else console.log("\nBearridge installation is ready.");

function supportedNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return major >= 20 && major < 23 && !(major === 20 && minor < 18);
}
function check(name, ok, detail, action) { checks.push({ name, ok, detail, action }); }
async function pathCheck(name, relative, action) {
  try { await fs.access(path.join(root, relative)); check(name, true, relative, action); }
  catch { check(name, false, `${relative} is missing`, action); }
}
