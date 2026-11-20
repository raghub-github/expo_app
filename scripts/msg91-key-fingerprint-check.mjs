#!/usr/bin/env node
/**
 * Compare local MSG91_AUTH_KEY env values to the historically leaked fingerprint
 * WITHOUT printing secrets. Exit 2 if any local env still matches the leak.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const HISTORICAL = "483466A9gWqQENhMod699337aeP1";
const histFp = createHash("sha256").update(HISTORICAL).digest("hex").slice(0, 16);

function fp(v) {
  return createHash("sha256").update(v).digest("hex").slice(0, 16);
}

function readKey(path) {
  if (!existsSync(path)) return { path, status: "missing_file" };
  const t = readFileSync(path, "utf8");
  const m = t.match(/^MSG91_AUTH_KEY=(.*)$/m);
  if (!m) return { path, status: "key_absent" };
  const v = m[1].trim().replace(/^["']|["']$/g, "");
  if (!v || /your_|CHANGE_ME|ROTATE_REQUIRED|<set-|<from-|xxxx/i.test(v)) {
    return { path, status: "placeholder" };
  }
  return {
    path,
    status: "present",
    length: v.length,
    fingerprint: fp(v),
    matchesHistoricalLeak: fp(v) === histFp,
  };
}

const paths = [
  "backend/.env",
  "backend/.env.local",
  "partnersite/.env.local",
  "cxsite/.env.local",
  "dashboard/.env.local",
];

const envs = paths.map(readKey);
const stillLeaked = envs.filter((e) => e.matchesHistoricalLeak);

console.log(
  JSON.stringify(
    {
      historicalFingerprintPrefix: histFp,
      workingTreeDocScrubbed: !readFileSync("MSG91_OTP_IMPLEMENTATION.md", "utf8").includes(HISTORICAL),
      envs: envs.map((e) => ({
        path: e.path,
        status: e.status,
        length: e.length,
        fingerprintPrefix: e.fingerprint,
        matchesHistoricalLeak: e.matchesHistoricalLeak ?? false,
      })),
      anyLocalEnvMatchesHistoricalLeak: stillLeaked.length > 0,
      rotationEvidence:
        stillLeaked.length > 0
          ? "FAIL: at least one local env still matches historically leaked key"
          : envs.some((e) => e.status === "present")
            ? "LOCAL_ENV_DIFFERENT_OR_ABSENT_FROM_LEAK — production rotation still UNVERIFIED"
            : "NO_LOCAL_MSG91_KEY_FOUND — production rotation UNVERIFIED",
      note: "Cannot confirm MSG91 dashboard rotation or remote deploy secrets from this workspace alone.",
    },
    null,
    2,
  ),
);

process.exit(stillLeaked.length > 0 ? 2 : 0);
