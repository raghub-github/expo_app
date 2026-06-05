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

// Every workspace that produces a Docker image. Each must have a Dockerfile
// whose build step compiles every @gatimitra/* it imports.
const APPS = [
  "backend",
  "dashboard",
  "partnersite",
  "services/eta-worker",
  "services/notification-worker",
  "services/outbox-relay",
  "services/payment-worker",
  "services/ws-gateway",
];
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

function dockerfileCopiedWorkspaces(dockerfilePath) {
  if (!existsSync(dockerfilePath)) return new Set();
  const text = readFileSync(dockerfilePath, "utf8");
  const seen = new Set();
  // Match `COPY packages/<name>` and `COPY packages/<name>/package.json`.
  const re = /^\s*COPY\s+(?:--[^\s]+\s+)*packages\/([a-z0-9][\w-]*)/gim;
  let m;
  while ((m = re.exec(text)) !== null) seen.add(`@gatimitra/${m[1]}`);
  return seen;
}

/**
 * Walk every tsconfig under a workspace and return the set of @gatimitra/*
 * packages it transitively extends. Catches:
 *   "extends": "@gatimitra/shared-config/tsconfig.node.json"
 * which fails inside Docker if shared-config isn't COPYd into the image.
 */
function tsconfigExtendedWorkspaces(workspaceRoot) {
  const seen = new Set();
  function recur(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) recur(p);
      else if (/^tsconfig(?:\..+)?\.json$/.test(e.name)) {
        let cfg;
        try { cfg = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
        const ext = cfg.extends;
        if (typeof ext !== "string") continue;
        const m = ext.match(/^(@gatimitra\/[a-z0-9][\w-]*)/);
        if (m) seen.add(m[1]);
      }
    }
  }
  recur(workspaceRoot);
  return seen;
}

let problems = 0;

// Walk every workspace package that the apps build, plus the apps themselves,
// to collect all packages referenced via tsconfig "extends" — those need
// COPY into Docker context even though they have no `--workspace=` build.
function collectTsExtendsFor(builtPackages) {
  const seen = new Set();
  for (const pkg of builtPackages) {
    // Strip @gatimitra/ scope → folder name under packages/
    const dir = pkg.startsWith("@gatimitra/")
      ? join("packages", pkg.slice("@gatimitra/".length))
      : null;
    if (dir && existsSync(dir)) {
      for (const x of tsconfigExtendedWorkspaces(dir)) seen.add(x);
    }
  }
  return seen;
}

for (const app of APPS) {
  const srcDir = join(app, "src");
  if (!existsSync(srcDir)) continue;

  const imports = importedGatimitraPackages(srcDir);
  const dockerfile = join(app, "Dockerfile");
  const built = dockerfileWorkspaceFlags(dockerfile);
  const copied = dockerfileCopiedWorkspaces(dockerfile);
  // Add the app's own tsconfig-extends, plus extends from every built package.
  const tsExtends = new Set([
    ...tsconfigExtendedWorkspaces(app),
    ...collectTsExtendsFor(built),
  ]);

  const missing = [];
  for (const pkg of imports) {
    if (!built.has(pkg)) missing.push({ pkg, reason: "missing --workspace= build flag" });
  }
  for (const pkg of tsExtends) {
    if (!copied.has(pkg)) missing.push({ pkg, reason: "tsconfig extends this package but Dockerfile never COPYs it" });
  }

  if (missing.length > 0) {
    problems += missing.length;
    console.error(`✗ ${app}:`);
    for (const m of missing) console.error(`    ${m.pkg.padEnd(36)} — ${m.reason}`);
    console.error(`  Fix the ${app}/Dockerfile accordingly.`);
  } else if (imports.size > 0 || tsExtends.size > 0) {
    console.log(`✓ ${app}: imports ${imports.size}, tsconfig-extends ${tsExtends.size} @gatimitra package(s); all wired in Dockerfile.`);
  } else {
    console.log(`✓ ${app}: no @gatimitra coupling.`);
  }
}

if (problems > 0) {
  console.error(`\n${problems} workspace package(s) missing from their Dockerfile build step.`);
  process.exit(1);
}
console.log("\nAll Docker workspace builds are consistent with @gatimitra imports.");
