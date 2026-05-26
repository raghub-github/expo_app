#!/usr/bin/env node
/**
 * Walk every workspace, parse every TS/TSX/JS/JSX import, compare against the
 * workspace's declared dependencies + devDependencies + peerDependencies.
 * Prints a per-workspace list of bare imports that aren't declared anywhere
 * (those are the dependencies that bite isolated Docker builds).
 *
 * Run from repo root:  node scripts/audit-undeclared-deps.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

// Built-in Node modules — ignore.
const NODE_BUILTINS = new Set([
  "assert","async_hooks","buffer","child_process","cluster","console","crypto",
  "dgram","dns","domain","events","fs","http","http2","https","inspector",
  "module","net","os","path","perf_hooks","process","punycode","querystring",
  "readline","repl","stream","string_decoder","sys","timers","tls","trace_events",
  "tty","url","util","v8","vm","wasi","worker_threads","zlib",
]);

function isBuiltin(spec) {
  if (NODE_BUILTINS.has(spec)) return true;
  if (spec.startsWith("node:")) return true;
  // `fs/promises`, `path/posix`, `stream/web` etc — sub-paths of builtins.
  const root = spec.split("/")[0];
  return NODE_BUILTINS.has(root);
}

// Reject anything that isn't a syntactically valid npm package name.
// Catches false positives from regex literals or comments that look like
// imports (e.g. `@\/hooks\` extracted from a regex source).
const VALID_PKG_NAME = /^(?:@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*|[a-z0-9][\w.-]*)$/i;
function isValidPackageName(spec) {
  return VALID_PKG_NAME.test(spec);
}

function isRelative(spec) {
  return spec.startsWith(".") || spec.startsWith("/");
}

/** turns "@scope/pkg/sub/path" → "@scope/pkg" and "pkg/sub" → "pkg" */
function rootOfSpecifier(spec) {
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    return name ? `${scope}/${name}` : scope;
  }
  return spec.split("/")[0];
}

const IMPORT_RE = /\b(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function stripComments(code) {
  // Drop /* … */ block comments (JSDoc included). Leave `// …` line comments
  // alone — they rarely contain anything that looks like `from "pkg"`.
  return code.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractImports(code) {
  const cleaned = stripComments(code);
  const found = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(cleaned)) !== null) found.add(m[1]);
  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(cleaned)) !== null) found.add(m[1]);
  return found;
}

function walk(dir, ext, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "dist" ||
        e.name === "build" || e.name === ".turbo" || e.name === "out" ||
        e.name === ".git" || e.name === "coverage" || e.name === "archive-output" ||
        e.name === ".expo" || e.name === ".expo-shared") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (ext.test(e.name)) acc.push(p);
  }
  return acc;
}

function loadPkg(workspaceDir) {
  const p = join(workspaceDir, "package.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

// Discover workspaces from root package.json — same as npm.
const rootPkg = loadPkg(ROOT);
if (!rootPkg) { console.error("No root package.json"); process.exit(1); }
const rootDeclared = new Set([
  ...Object.keys(rootPkg.dependencies ?? {}),
  ...Object.keys(rootPkg.devDependencies ?? {}),
]);

const workspaces = [];
for (const pat of rootPkg.workspaces ?? []) {
  if (pat.endsWith("/*")) {
    const base = pat.slice(0, -2);
    try {
      for (const sub of readdirSync(join(ROOT, base))) {
        const dir = join(ROOT, base, sub);
        if (statSync(dir).isDirectory() && existsSync(join(dir, "package.json")))
          workspaces.push(join(base, sub));
      }
    } catch {}
  } else if (existsSync(join(ROOT, pat, "package.json"))) {
    workspaces.push(pat);
  }
}

// Build list of all known workspace names (for excluding @gatimitra/* self-refs)
const workspaceNames = new Set();
for (const w of workspaces) {
  const pkg = loadPkg(join(ROOT, w));
  if (pkg?.name) workspaceNames.add(pkg.name);
}

const report = [];
for (const w of workspaces) {
  const dir = join(ROOT, w);
  const pkg = loadPkg(dir);
  if (!pkg) continue;
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.peerDependenciesMeta ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  const files = walk(dir, /\.(?:ts|tsx|js|jsx|mjs|cjs)$/);
  const used = new Set();
  for (const f of files) {
    let code;
    try { code = readFileSync(f, "utf8"); } catch { continue; }
    for (const spec of extractImports(code)) {
      if (isBuiltin(spec) || isRelative(spec)) continue;
      // Path-alias imports — skip everything starting with @/ or ~/ etc
      if (spec.startsWith("@/") || spec.startsWith("~/")) continue;
      const root = rootOfSpecifier(spec);
      if (!isValidPackageName(root)) continue;
      used.add(root);
    }
  }

  // Compute missing — declared in import but not in package.json, and also
  // not the workspace's own name. Cross-workspace imports (@gatimitra/x) ARE
  // expected to be declared, so they show up here if forgotten.
  const missing = [];
  for (const u of used) {
    if (u === pkg.name) continue;
    if (declared.has(u)) continue;
    // Filter: if it's a transitive that *is* in root deps, flag it specifically
    // since that's the hoisting class of bug.
    const flag = rootDeclared.has(u) ? "ROOT-HOISTED" :
                 workspaceNames.has(u) ? "WORKSPACE-NOT-DECLARED" :
                 "TRULY-MISSING";
    missing.push({ pkg: u, flag });
  }
  if (missing.length) report.push({ workspace: w, name: pkg.name, missing });
}

console.log("# Undeclared imports per workspace\n");
if (report.length === 0) { console.log("✔ Nothing undeclared."); process.exit(0); }

for (const r of report) {
  console.log(`## ${r.workspace}  (${r.name})`);
  for (const m of r.missing) console.log(`  - ${m.pkg.padEnd(40)} [${m.flag}]`);
  console.log("");
}

console.log(`\nTotal workspaces with issues: ${report.length}`);
console.log(`Total undeclared imports: ${report.reduce((n,r) => n + r.missing.length, 0)}`);
