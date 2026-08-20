/**
 * `next dev` with a raised V8 heap so webpack does not hit Next's
 * "Server is approaching the used memory threshold, restarting..." loop.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const nextBin = require.resolve("next/dist/bin/next");

const heapFlag = "--max-old-space-size=8192";
const existing = (process.env.NODE_OPTIONS ?? "").trim();
process.env.NODE_OPTIONS = existing.includes("--max-old-space-size")
  ? existing
  : [existing, heapFlag].filter(Boolean).join(" ");

const extraArgs = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [nextBin, "dev", "--webpack", "-p", "3001", ...extraArgs],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
