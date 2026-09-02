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
  forceRemovePath,
  isJunction,
  localNextOutputDir,
  repoOnOneDrive,
  root,
  applyOneDriveModuleResolutionOptions,
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
      forceRemovePath(nextDir);
      console.log(`[dev] cleared ${nextDir}`);
    }
  }
}

maybeClearWebpackCache();

// Dev uses repo `.next`; production `next build` uses distDir under %LOCALAPPDATA%.
// Remove legacy junctions left from older build scripts.
const useDevJunction =
  process.env.DASHBOARD_DEV_JUNCTION === "1" || process.argv.includes("--onedrive-next");
if (repoOnOneDrive() && !useDevJunction) {
  const nextDir = path.join(root, ".next");
  if (fs.existsSync(nextDir) && isJunction(nextDir)) {
    console.log("[dev] removing legacy .next junction");
    forceRemovePath(nextDir);
  }
} else if (useDevJunction) {
  ensureNextOutputJunction();
}

applyOneDriveModuleResolutionOptions(process.env);

let nodeOptions = (process.env.NODE_OPTIONS ?? "").trim();
if (!nodeOptions.includes("--max-old-space-size")) {
  nodeOptions = [nodeOptions, "--max-old-space-size=8192"].filter(Boolean).join(" ");
}
if (!nodeOptions.includes("--unhandled-rejections")) {
  nodeOptions = [nodeOptions, "--unhandled-rejections=warn"].filter(Boolean).join(" ");
}
process.env.NODE_OPTIONS = nodeOptions;

const extraArgs = process.argv.slice(2).filter((a) => a !== "--clean-cache");
const useTurbopackExplicit =
  extraArgs.includes("--turbopack") || process.env.DASHBOARD_DEV_TURBOPACK === "1";
const useWebpack =
  extraArgs.includes("--webpack") ||
  process.env.DASHBOARD_DEV_WEBPACK === "1" ||
  (repoOnOneDrive() && !useTurbopackExplicit);
const filteredArgs = extraArgs.filter(
  (a) => a !== "--webpack" && a !== "--onedrive-next" && a !== "--turbopack"
);

if (repoOnOneDrive() && useTurbopackExplicit && !useWebpack) {
  console.warn(
    "[dev] Turbopack on OneDrive may fail with missing next compiled modules. Omit --turbopack to use webpack."
  );
}

const nextDevArgs = useWebpack
  ? [nextBin, "dev", "--webpack", "-p", "3001", ...filteredArgs]
  : [nextBin, "dev", "-p", "3001", ...filteredArgs];

const result = spawnSync(process.execPath, nextDevArgs, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
