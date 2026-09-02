/**
 * Run `next build` with a raised V8 heap so the TypeScript checker worker
 * does not OOM on this large dashboard (~1.5k TS files).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import {
  isProductionBuildComplete,
  localNextOutputDir,
  repoOnOneDrive,
  resolveBuildOutputDir,
} from "./onedrive-build-paths.mjs";
import {
  applyOneDriveModuleResolutionOptions,
  forceRemoveLock,
  isJunction,
  lockPath,
  nextDir,
  prepareNextBuildOutput,
  root,
} from "./prepare-next-output.mjs";

const require = createRequire(`${root}/package.json`);
const nextBin = require.resolve("next/dist/bin/next");

process.env.NODE_ENV = "production";

forceRemoveLock();
await prepareNextBuildOutput();
spawnSync("cmd", ["/c", "attrib", "-R", "-S", "-H", lockPath], { stdio: "ignore" });
spawnSync("cmd", ["/c", "del", "/f", "/q", lockPath], { stdio: "ignore" });

if (repoOnOneDrive()) {
  if (!isJunction(nextDir)) {
    console.error(
      `[build] .next is not junctioned off OneDrive (found regular folder). Stop dev server and run: npm run build`
    );
    process.exit(1);
  }
  console.log(`[build] production output → ${localNextOutputDir()}`);
}

applyOneDriveModuleResolutionOptions(process.env);

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

if (result.status === 0 && repoOnOneDrive()) {
  const distDir = resolveBuildOutputDir(nextDir);
  if (!isProductionBuildComplete(distDir)) {
    console.error(`[build] incomplete output in ${distDir} — OneDrive may have interrupted the build.`);
    process.exit(1);
  }
  console.log(`[build] verified production output in ${distDir}`);
}

process.exit(result.status ?? 1);
