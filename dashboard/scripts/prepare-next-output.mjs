/**
 * Remove `.next` and webpack caches before build/dev.
 * On Windows + OneDrive, stale `.next/lock` files often block `next build`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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

export async function prepareNextBuildOutput() {
  removeNextDir();
  forceRemoveLock();

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

export { forceRemoveLock, lockPath, nextDir, root };
