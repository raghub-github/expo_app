/**
 * Remove `.next` and webpack caches before build/dev.
 * On Windows + OneDrive, stale `.next/lock` files often block `next build`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");
const lockPath = path.join(nextDir, "lock");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJunction(dirPath) {
  try {
    const stat = fs.lstatSync(dirPath);
    if (typeof stat.isJunction === "function" && stat.isJunction()) return true;
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function forceRemoveLock() {
  if (!fs.existsSync(lockPath)) return;
  spawnSync("cmd", ["/c", "attrib", "-R", "-S", "-H", lockPath], { stdio: "ignore" });
  spawnSync("cmd", ["/c", "del", "/f", "/q", lockPath], { stdio: "ignore" });
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best effort
  }
}

/** Stale Next workers can leave `.next/trace` locked → EPERM on the next build. */
function forceRemoveTrace() {
  const tracePath = path.join(nextDir, "trace");
  if (!fs.existsSync(tracePath)) return;
  spawnSync("cmd", ["/c", "attrib", "-R", "-S", "-H", tracePath], { stdio: "ignore" });
  spawnSync("cmd", ["/c", "del", "/f", "/q", tracePath], { stdio: "ignore" });
  try {
    fs.unlinkSync(tracePath);
  } catch {
    // best effort
  }
}

function removeNextDir() {
  if (!fs.existsSync(nextDir)) return;

  if (isJunction(nextDir)) {
    spawnSync("cmd", ["/c", "rmdir", nextDir], { stdio: "ignore" });
    return;
  }

  forceRemoveLock();
  try {
    fs.rmSync(nextDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });
  } catch {
    spawnSync("cmd", ["/c", "rmdir", "/s", "/q", nextDir], { stdio: "ignore" });
  }
}

function removeDirBestEffort(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch {
    if (process.platform === "win32") {
      spawnSync("cmd", ["/c", "rmdir", "/s", "/q", dirPath], { stdio: "ignore" });
    }
  }
}

/**
 * Corrupted webpack filesystem packs cause:
 * - ENOENT rename …/4.pack_ → …/4.pack
 * - "No template for dependency: PureExpressionDependency"
 * Keep this off OneDrive and wipe on clean/dev:clean.
 */
function localNextOutputDir() {
  if (process.platform === "win32") {
    const local =
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Local");
    return path.join(local, "gatimitra-dashboard-next");
  }
  return path.join(root, ".next-local");
}

function repoOnOneDrive() {
  return process.platform === "win32" && root.includes("OneDrive");
}

/**
 * OneDrive sync deletes/locks `.next` mid-build → ENOENT on pages-manifest.json.
 * Junction repo `.next` → %LOCALAPPDATA% so Next writes off synced folders.
 */
function ensureNextOutputJunction() {
  if (!repoOnOneDrive()) return;

  const target = localNextOutputDir();
  removeDirBestEffort(target);
  fs.mkdirSync(target, { recursive: true });

  if (fs.existsSync(nextDir)) {
    if (isJunction(nextDir)) {
      spawnSync("cmd", ["/c", "rmdir", nextDir], { stdio: "ignore" });
    } else {
      removeNextDir();
    }
  }

  const link = spawnSync("cmd", ["/c", "mklink", "/J", nextDir, target], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (link.status !== 0) {
    console.warn(
      `[prepare-next] Could not junction .next → ${target}; builds may fail on OneDrive.`,
      link.stderr?.trim() || link.stdout?.trim() || ""
    );
  }
}

function removeDashboardWebpackCache() {
  if (process.platform === "win32") {
    const local =
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
    removeDirBestEffort(path.join(local, "gatimitra-dashboard-webpack"));
  } else {
    removeDirBestEffort(
      path.join(process.env.HOME || os.homedir(), ".cache", "gatimitra-dashboard-webpack")
    );
  }
}

function appendNodeOption(env, flag) {
  const token = flag.split("=")[0];
  const existing = (env.NODE_OPTIONS ?? "").trim();
  if (existing.includes(token)) return;
  env.NODE_OPTIONS = [existing, flag].filter(Boolean).join(" ");
}

/**
 * `.next` is junctioned off OneDrive on Windows; Node resolves the real path
 * under %LOCALAPPDATA% during "Collecting page data", so hoisted deps (next,
 * postgres, drizzle, …) are not found unless symlinks are preserved.
 */
export function applyOneDriveModuleResolutionOptions(env = process.env) {
  if (!repoOnOneDrive()) return;
  appendNodeOption(env, "--preserve-symlinks");
}

export async function prepareNextBuildOutput() {
  forceRemoveLock();
  forceRemoveTrace();
  removeNextDir();
  forceRemoveLock();
  forceRemoveTrace();
  removeDashboardWebpackCache();
  ensureNextOutputJunction();

  const cacheDir = path.join(root, "node_modules", ".cache");
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      }
      return;
    } catch {
      await sleep(150 * attempt);
    }
  }
}

export { forceRemoveLock, lockPath, nextDir, root, repoOnOneDrive, localNextOutputDir };
