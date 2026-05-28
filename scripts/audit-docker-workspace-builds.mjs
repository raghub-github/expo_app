#!/usr/bin/env node
/**
 * For each containerised app (backend, dashboard, partnersite), check that
 * every `@gatimitra/*` workspace package it actually imports is also
 * declared as a `--workspace=` flag in its Dockerfile's build command.
 *
 * Failure mode this catches:
 *   • Dashboard imports `@gatimitra/contracts`.
 *   • Contracts compiles to `./dist/index.js` per its package.json `main`.
 *   • Dashboard's Dockerfile only runs `npm run build --workspace=dashboard`.
 *   • Result: contracts has no dist/ in the image; webpack fails to
 *     resolve `@gatimitra/contracts` ("Module not found").
 *
 * Run from repo root:  node scripts/audit-docker-workspace-builds.mjs
 * Exits non-zero if any gap is found — wire into CI to prevent regression.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPS = ["backend", "dashboard", "partnersite"];
const SKIP_DIRS = new Set([
  "node_modules", ".next", "dist", "build", ".turbo", "out", ".git",
]);

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(?:ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function importedGatimitraPackages(srcDir) {
  const seen = new Set();
  for (const f of walk(srcDir)) {
    let code;
    try { code = readFileSync(f, "utf8"); } catch { continue; }
    const re = /\b(?:from\s+|import\s*\(\s*)["'](@gatimitra\/[a-z0-9][\w.-]*)/g;
    let m;
    while ((m = re.exec(code)) !== null) seen.add(m[1]);
  }
  return seen;
}

function dockerfileWorkspaceFlags(dockerfilePath) {
  if (!existsSync(dockerfilePath)) return new Set();
  const text = readFileSync(dockerfilePath, "utf8");
  const seen = new Set();
  const re = /--workspace=([^\s\\]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) seen.add(m[1]);
  return seen;
}

let problems = 0;

for (const app of APPS) {
  const srcDir = join(app, "src");
  if (!existsSync(srcDir)) continue;

  const imports = importedGatimitraPackages(srcDir);
  const built = dockerfileWorkspaceFlags(join(app, "Dockerfile"));

  const missing = [];
  for (const pkg of imports) {
    if (!built.has(pkg)) missing.push(pkg);
  }

  if (missing.length > 0) {
    problems += missing.length;
    console.error(`✗ ${app}: imports these @gatimitra/* but Dockerfile doesn't build them:`);
    for (const m of missing) console.error(`    --workspace=${m}`);
    console.error(`  Fix: add the --workspace= flag(s) to the RUN npm run build … line in ${app}/Dockerfile`);
  } else if (imports.size > 0) {
    console.log(`✓ ${app}: imports ${imports.size} @gatimitra package(s), all declared in Dockerfile.`);
  } else {
    console.log(`✓ ${app}: no @gatimitra imports.`);
  }
}

if (problems > 0) {
  console.error(`\n${problems} workspace package(s) missing from their Dockerfile build step.`);
  process.exit(1);
}
console.log("\nAll Docker workspace builds are consistent with @gatimitra imports.");
