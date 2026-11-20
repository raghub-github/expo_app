#!/usr/bin/env node
/**
 * Replace MSG91_AUTH_KEY values that match the historical leak fingerprint with a
 * non-secret placeholder in LOCAL gitignored env files only.
 * Does not print secrets. Does not touch remote/deployment systems.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const HISTORICAL = "483466A9gWqQENhMod699337aeP1";
const histFp = createHash("sha256").update(HISTORICAL).digest("hex").slice(0, 16);
const PLACEHOLDER =
  "ROTATE_REQUIRED_set_new_key_from_MSG91_dashboard_do_not_reuse_leaked_key";

const targets = [
  "partnersite/.env.local",
  "cxsite/.env.local",
  "apps/gatimitra-riderApp/.env",
  "apps/gatimitra-riderApp/.env.local",
];

function fp(v) {
  return createHash("sha256").update(v).digest("hex").slice(0, 16);
}

const results = [];
for (const path of targets) {
  if (!existsSync(path)) {
    results.push({ path, action: "skip_missing" });
    continue;
  }
  const before = readFileSync(path, "utf8");
  let changed = false;
  const after = before.replace(/^MSG91_AUTH_KEY=(.*)$/m, (_m, raw) => {
    const v = String(raw).trim().replace(/^["']|["']$/g, "");
    if (!v) return `MSG91_AUTH_KEY=${PLACEHOLDER}`;
    if (fp(v) !== histFp) return `MSG91_AUTH_KEY=${raw}`;
    changed = true;
    return `MSG91_AUTH_KEY=${PLACEHOLDER}`;
  });
  if (changed) {
    writeFileSync(path, after, "utf8");
    results.push({ path, action: "neutralized_historical_leak" });
  } else {
    results.push({ path, action: "unchanged_not_historical_or_absent" });
  }
}

console.log(JSON.stringify({ historicalFingerprintPrefix: histFp, results }, null, 2));
