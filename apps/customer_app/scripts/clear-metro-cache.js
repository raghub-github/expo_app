/**
 * Windows-safe Metro cache wipe for gatimitra-customer-app.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const metroCacheRoot = path.join(os.tmpdir(), "gatimitra-customer-metro-cache");

function tryRm(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return true;
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : null;
    if (code === "ENOENT") return true;
    return false;
  }
}

function clearMetroCacheRoot() {
  if (!fs.existsSync(metroCacheRoot)) {
    fs.mkdirSync(metroCacheRoot, { recursive: true });
    console.log(`[clear-metro-cache] Cache already empty (${metroCacheRoot})`);
    return;
  }

  if (tryRm(metroCacheRoot)) {
    fs.mkdirSync(metroCacheRoot, { recursive: true });
    console.log(`[clear-metro-cache] Cleared ${metroCacheRoot}`);
    return;
  }

  const staleRoot = `${metroCacheRoot}.stale-${Date.now()}`;
  try {
    fs.renameSync(metroCacheRoot, staleRoot);
    fs.mkdirSync(metroCacheRoot, { recursive: true });
    console.log(`[clear-metro-cache] Rotated locked cache to ${path.basename(staleRoot)}`);
    setImmediate(() => {
      tryRm(staleRoot);
    });
  } catch (err) {
    console.warn(
      `[clear-metro-cache] Could not clear cache (stop Metro on port 8081 first): ${err.message}`,
    );
    process.exitCode = 1;
  }
}

clearMetroCacheRoot();
