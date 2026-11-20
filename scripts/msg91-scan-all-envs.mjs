#!/usr/bin/env node
/**
 * Scan common env files for MSG91_AUTH_KEY vs historical leak fingerprint.
 * Never prints secret values.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const HISTORICAL = "483466A9gWqQENhMod699337aeP1";
const histFp = createHash("sha256").update(HISTORICAL).digest("hex").slice(0, 16);
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "android", "ios"]);

function fp(v) {
  return createHash("sha256").update(v).digest("hex").slice(0, 16);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (relative(ROOT, p).split(/[/\\]/).length > 4) continue;
      walk(p, out);
    } else if (/^\.env/.test(name) && !/\.example$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT);
const rows = [];
for (const path of files) {
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  const t = readFileSync(path, "utf8");
  const m = t.match(/^MSG91_AUTH_KEY=(.*)$/m);
  const redis = /^REDIS_URL=(.+)$/m.test(t);
  if (!m) {
    rows.push({ path: rel, msg91: "absent", redisConfigured: redis, matchesLeak: false });
    continue;
  }
  const v = m[1].trim().replace(/^["']|["']$/g, "");
  if (!v || /your_|CHANGE_ME|<set-|<from-|xxxx|PLACEHOLDER|ROTATE/i.test(v)) {
    rows.push({ path: rel, msg91: "placeholder_or_empty", redisConfigured: redis, matchesLeak: false });
    continue;
  }
  const fingerprint = fp(v);
  rows.push({
    path: rel,
    msg91: "present",
    length: v.length,
    fingerprintPrefix: fingerprint,
    matchesLeak: fingerprint === histFp,
    redisConfigured: redis,
  });
}

const leaked = rows.filter((r) => r.matchesLeak);
console.log(
  JSON.stringify(
    {
      historicalFingerprintPrefix: histFp,
      scannedEnvFiles: rows.length,
      filesMatchingHistoricalLeak: leaked.map((r) => r.path),
      filesWithMsg91Present: rows.filter((r) => r.msg91 === "present").map((r) => ({
        path: r.path,
        fingerprintPrefix: r.fingerprintPrefix,
        matchesLeak: r.matchesLeak,
        redisConfigured: r.redisConfigured,
      })),
      redisUrlPresentIn: rows.filter((r) => r.redisConfigured).map((r) => r.path),
    },
    null,
    2,
  ),
);
process.exit(leaked.length > 0 ? 2 : 0);
