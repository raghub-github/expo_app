/**
 * Remove `.next` / production caches before build/dev.
 * Production builds on OneDrive junction `.next` → %LOCALAPPDATA%.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dashboardRoot, localNextOutputDir, repoOnOneDrive } from "./onedrive-build-paths.mjs";

const root = dashboardRoot;
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

function forceRemovePath(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  if (isJunction(dirPath)) {
    spawnSync("cmd", ["/c", "rmdir", dirPath], { stdio: "ignore" });
  } else {
    spawnSync("cmd", ["/c", "attrib", "-R", "-S", "-H", path.join(dirPath, "*"), "/S", "/D"], {
      stdio: "ignore",
    });
    try {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    } catch {
      spawnSync("cmd", ["/c", "rmdir", "/s", "/q", dirPath], { stdio: "ignore" });
    }
  }
  return !fs.existsSync(dirPath);
}

function removeDirBestEffort(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  forceRemovePath(dirPath);
}

function removeAllNextOutputs() {
  if (fs.existsSync(nextDir)) {
    forceRemoveLock();
    forceRemoveTrace();
    forceRemovePath(nextDir);
  }
  if (repoOnOneDrive()) {
    removeDirBestEffort(localNextOutputDir());
  }
}

function removeDashboardWebpackCache() {
  if (process.platform === "win32") {
    const local =
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
    removeDirBestEffort(path.join(local, "gatimitra-dashboard-webpack"));
  } else {
    removeDirBestEffort(path.join(os.homedir(), ".cache", "gatimitra-dashboard-webpack"));
  }
}

function stopDashboardDevServer() {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }",
    ],
    { stdio: "ignore" }
  );
  spawnSync("cmd", ["/c", "timeout", "/t", "2", "/nobreak"], { stdio: "ignore" });
}

function tryRemoveNextDir(maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (fs.existsSync(nextDir) && !forceRemovePath(nextDir)) {
      spawnSync("cmd", ["/c", "rmdir", "/s", "/q", nextDir], { stdio: "ignore" });
    }
    if (!fs.existsSync(nextDir)) return true;
    if (attempt < maxAttempts) {
      spawnSync("cmd", ["/c", "timeout", "/t", "1", "/nobreak"], { stdio: "ignore" });
    }
  }
  return !fs.existsSync(nextDir);
}

/**
 * Junction repo `.next` → %LOCALAPPDATA% for production builds on OneDrive.
 * @param {{ required?: boolean }} opts - exit process when junction cannot be created
 */
function ensureNextOutputJunction(opts = {}) {
  const { required = false } = opts;
  if (!repoOnOneDrive()) return true;

  const target = localNextOutputDir();
  removeDirBestEffort(target);
  fs.mkdirSync(target, { recursive: true });

  let removed = tryRemoveNextDir();
  if (!removed && required && fs.existsSync(nextDir) && !isJunction(nextDir)) {
    console.log("[prepare-next] stopping dashboard dev server on :3001 to release .next");
    stopDashboardDevServer();
    removed = tryRemoveNextDir(5);
  }

  if (!removed && fs.existsSync(nextDir) && !isJunction(nextDir)) {
    const msg = `[prepare-next] Could not remove dev .next at ${nextDir}. Stop \`npm run dev\` and retry.`;
    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    return false;
  }

  if (isJunction(nextDir)) {
    console.log(`[prepare-next] .next junction → ${target}`);
    return true;
  }

  const link = spawnSync("cmd", ["/c", "mklink", "/J", nextDir, target], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (link.status === 0 && isJunction(nextDir)) {
    console.log(`[prepare-next] .next junction → ${target}`);
    return true;
  }

  const detail = link.stderr?.trim() || link.stdout?.trim() || "unknown error";
  const msg = `[prepare-next] Could not junction .next → ${target}: ${detail}`;
  if (required) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg);
  return false;
}

function appendNodeOption(env, flag) {
  const token = flag.split("=")[0];
  const existing = (env.NODE_OPTIONS ?? "").trim();
  if (existing.includes(token)) return;
  env.NODE_OPTIONS = [existing, flag].filter(Boolean).join(" ");
}

export function applyOneDriveModuleResolutionOptions(env = process.env) {
  if (!repoOnOneDrive()) return;
  appendNodeOption(env, "--preserve-symlinks");
}

export async function prepareNextBuildOutput() {
  forceRemoveLock();
  forceRemoveTrace();
  removeAllNextOutputs();
  forceRemoveLock();
  forceRemoveTrace();
  removeDashboardWebpackCache();
  ensureNextOutputJunction({ required: repoOnOneDrive() });

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

export {
  forceRemoveLock,
  forceRemovePath,
  isJunction,
  lockPath,
  nextDir,
  root,
  repoOnOneDrive,
  localNextOutputDir,
  ensureNextOutputJunction,
};
