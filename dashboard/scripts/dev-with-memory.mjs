/**
 * `next dev` with a raised V8 heap so webpack does not hit Next's
 * "Server is approaching the used memory threshold, restarting..." loop.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";

import {
  ensureNextOutputJunction,
  localNextOutputDir,
  repoOnOneDrive,
  root,
} from "./prepare-next-output.mjs";

const require = createRequire(path.join(root, "package.json"));
const nextBin = require.resolve("next/dist/bin/next");

/** Wipe pack cache when CLEAR_WEBPACK_CACHE=1 or --clean-cache is passed. */
function maybeClearWebpackCache() {
  const flag =
    process.env.CLEAR_WEBPACK_CACHE === "1" ||
    process.argv.includes("--clean-cache");
  if (!flag) return;
  const cacheRoot =
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
          "gatimitra-dashboard-webpack"
        )
      : path.join(os.homedir(), ".cache", "gatimitra-dashboard-webpack");
  if (fs.existsSync(cacheRoot)) {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
    console.log(`[dev] cleared webpack cache: ${cacheRoot}`);
  }
  const nextDirs = [path.join(root, ".next")];
  if (repoOnOneDrive()) nextDirs.push(localNextOutputDir());
  for (const nextDir of nextDirs) {
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
      console.log(`[dev] cleared ${nextDir}`);
    }
  }
}

maybeClearWebpackCache();

// Dev on OneDrive: keep `.next` in the repo. Junctioning to %LOCALAPPDATA%
// breaks webpack externals (`__webpack_modules__[moduleId] is not a function`
// or missing `next/dist/compiled/next-server/*`). Production builds still
// junction via prepareNextBuildOutput().
const useDevJunction =
  process.env.DASHBOARD_DEV_JUNCTION === "1" || process.argv.includes("--onedrive-next");
if (repoOnOneDrive() && !useDevJunction) {
  console.log("[dev] using local .next (pass --onedrive-next to junction off OneDrive)");
} else {
  ensureNextOutputJunction();
}

let nodeOptions = (process.env.NODE_OPTIONS ?? "").trim();
if (!nodeOptions.includes("--max-old-space-size")) {
  nodeOptions = [nodeOptions, "--max-old-space-size=8192"].filter(Boolean).join(" ");
}
if (!nodeOptions.includes("--unhandled-rejections")) {
  nodeOptions = [nodeOptions, "--unhandled-rejections=warn"].filter(Boolean).join(" ");
}
process.env.NODE_OPTIONS = nodeOptions;

const extraArgs = process.argv.slice(2).filter((a) => a !== "--clean-cache");
const useWebpack = extraArgs.includes("--webpack") || process.env.DASHBOARD_DEV_WEBPACK === "1";
const filteredArgs = extraArgs.filter((a) => a !== "--webpack" && a !== "--onedrive-next");

const nextDevArgs = useWebpack
  ? [nextBin, "dev", "--webpack", "-p", "3001", ...filteredArgs]
  : [nextBin, "dev", "-p", "3001", ...filteredArgs];

const result = spawnSync(process.execPath, nextDevArgs, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
