/**
 * OneDrive-safe Next.js output paths (shared by build/dev scripts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function repoOnOneDrive(root = dashboardRoot) {
  return process.platform === "win32" && root.includes("OneDrive");
}

export function localNextOutputDir(root = dashboardRoot) {
  if (process.platform === "win32") {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Local");
    return path.join(local, "gatimitra-dashboard-next");
  }
  return path.join(root, ".next-local");
}

/** Resolve where `next build` wrote output (junction target on OneDrive). */
export function resolveBuildOutputDir(nextDir, root = dashboardRoot) {
  try {
    if (fs.existsSync(nextDir)) {
      return fs.realpathSync.native(nextDir);
    }
  } catch {
    // fall through
  }
  if (repoOnOneDrive(root)) return localNextOutputDir(root);
  return path.join(root, ".next");
}

/**
 * App Router builds may not emit `pages-manifest.json`; use markers Next 16 always writes.
 */
export function isProductionBuildComplete(distDir) {
  if (!fs.existsSync(path.join(distDir, "BUILD_ID"))) return false;
  const markers = [
    path.join(distDir, "routes-manifest.json"),
    path.join(distDir, "server", "app-paths-manifest.json"),
    path.join(distDir, "server", "pages-manifest.json"),
    path.join(distDir, "standalone", "server.js"),
  ];
  return markers.some((marker) => fs.existsSync(marker));
}

export { dashboardRoot };
