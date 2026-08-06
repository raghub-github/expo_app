/**
 * Run `next build` with a raised V8 heap so the TypeScript checker worker
 * does not OOM on this large dashboard (~1.5k TS files).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forceRemoveLock, lockPath, root } from "./prepare-next-output.mjs";

const require = createRequire(path.join(root, "package.json"));
const nextBin = require.resolve("next/dist/bin/next");

forceRemoveLock();
spawnSync("cmd", ["/c", "attrib", "-R", "-S", "-H", lockPath], { stdio: "ignore" });
spawnSync("cmd", ["/c", "del", "/f", "/q", lockPath], { stdio: "ignore" });

const heapFlag = "--max-old-space-size=8192";
const existing = (process.env.NODE_OPTIONS ?? "").trim();
process.env.NODE_OPTIONS = existing.includes("--max-old-space-size")
  ? existing
  : [existing, heapFlag].filter(Boolean).join(" ");

const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
