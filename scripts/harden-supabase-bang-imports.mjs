#!/usr/bin/env node
/**
 * Sweeps every TS/TSX file under partnersite/ and dashboard/ that does:
 *
 *   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
 *   const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
 *
 * and replaces the non-null assertion with a safe fallback so module load
 * doesn't crash during `next build`'s "Collecting page data" pass when the
 * env is empty (Docker build pass with unset GitHub secrets). The runtime
 * request still throws Supabase's "Invalid URL" when it tries to actually
 * talk to the placeholder — which is the correct failure mode.
 *
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!         → ... || "https://placeholder.supabase.co"
 *   process.env.SUPABASE_SERVICE_ROLE_KEY!        → ... || "placeholder-service-role-key"
 *   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!    → ... || "placeholder-anon-key"
 *
 * Idempotent — re-running is a no-op once converted.
 *
 * Run from repo root:  node scripts/harden-supabase-bang-imports.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["partnersite/src", "dashboard/src"];

const SUBS = [
  // Non-null bang form
  {
    re: /process\.env\.NEXT_PUBLIC_SUPABASE_URL!/g,
    to: 'process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"',
  },
  {
    re: /process\.env\.SUPABASE_SERVICE_ROLE_KEY!/g,
    to: 'process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key"',
  },
  {
    re: /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY!/g,
    to: 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"',
  },
  // `as string` cast form (semantically the same — lies that the value isn't undefined)
  {
    re: /process\.env\.NEXT_PUBLIC_SUPABASE_URL\s+as\s+string/g,
    to: 'process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"',
  },
  {
    re: /process\.env\.SUPABASE_SERVICE_ROLE_KEY\s+as\s+string/g,
    to: 'process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key"',
  },
  {
    re: /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\s+as\s+string/g,
    to: 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"',
  },
];

const SKIP_DIRS = new Set([
  "node_modules", ".next", "dist", "build", ".turbo", "coverage", ".git",
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

let changedCount = 0;
const changedFiles = [];

for (const root of ROOTS) {
  const files = walk(root);
  for (const f of files) {
    let src;
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    let next = src;
    for (const { re, to } of SUBS) next = next.replace(re, to);
    if (next !== src) {
      writeFileSync(f, next);
      changedCount++;
      changedFiles.push(f);
    }
  }
}

console.log(`✓ Hardened ${changedCount} file(s):`);
for (const f of changedFiles) console.log(`  ${f}`);
