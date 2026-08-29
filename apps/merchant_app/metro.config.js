// EMFILE / ENOENT guard (Windows + OneDrive): queue fs ops and keep caches off synced folders.
require("graceful-fs").gracefulify(require("fs"));

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const os = require("os");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const packagesFolder = path.resolve(workspaceRoot, "packages");

// Keep Metro cache outside OneDrive — sync + Next.js .next churn can crash file watchers on Windows.
const metroCacheRoot = path.join(os.tmpdir(), "gatimitra-merchant-metro-cache");
const metroCacheDir = path.join(metroCacheRoot, "cache");
const metroFileMapDir = path.join(metroCacheRoot, "file-map");

for (const dir of [metroCacheDir, metroFileMapDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.cacheStores = ({ FileStore }) => {
  const store = new FileStore({ root: metroCacheDir });
  store.clear = () => {
    const tryRm = (target) => {
      try {
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
        return true;
      } catch {
        return false;
      }
    };

    if (tryRm(metroCacheDir)) {
      fs.mkdirSync(metroCacheDir, { recursive: true });
      return;
    }

    const staleDir = `${metroCacheDir}.stale-${Date.now()}`;
    try {
      fs.renameSync(metroCacheDir, staleDir);
      fs.mkdirSync(metroCacheDir, { recursive: true });
      setImmediate(() => {
        tryRm(staleDir);
      });
    } catch (err) {
      const code = err && typeof err === "object" ? err.code : null;
      if (code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM") {
        console.warn("[metro] Cache clear skipped — stop the other Metro/Expo process first.");
        return;
      }
      throw err;
    }
  };
  return [store];
};

try {
  config.fileMapCacheDirectory = metroFileMapDir;
} catch {
  // older metro may ignore unknown option
}

// App + shared packages + hoisted node_modules only — never watch dashboard/.next etc.
config.watchFolders = [projectRoot, packagesFolder, path.resolve(workspaceRoot, "node_modules")].filter(
  (p, i, arr) => arr.indexOf(p) === i,
);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

{
  const blockAbsDir = (absDir) => {
    const escaped = path
      .resolve(absDir)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\\/g, "[/\\\\]")
      .replace(/\//g, "[/\\\\]");
    return new RegExp(`^${escaped}([/\\\\]|$)`);
  };
  const extraBlock = [
    /[/\\]\.git[/\\].*/,
    /[/\\]\.expo[/\\].*/,
    /[/\\]android[/\\](build|\.gradle|\.cxx|app[/\\]build)[/\\].*/,
    /[/\\]ios[/\\](build|Pods)[/\\].*/,
    /[/\\]apps[/\\]customer_app[/\\].*/,
    /[/\\]apps[/\\]gatimitra-riderApp[/\\].*/,
    // Optional @unrs native bindings (incl. wasm32-wasi) — OneDrive often leaves broken nested paths → Metro ENOENT.
    /[/\\]node_modules[/\\]@unrs[/\\]resolver-binding-(?!win32-x64-msvc)[^/\\]+([/\\].*)?$/,
    blockAbsDir(path.resolve(workspaceRoot, "dashboard")),
    blockAbsDir(path.resolve(workspaceRoot, "backend")),
    blockAbsDir(path.resolve(workspaceRoot, "partnersite")),
    blockAbsDir(path.resolve(workspaceRoot, "services")),
    blockAbsDir(path.resolve(workspaceRoot, "cxsite")),
  ];
  const existing = config.resolver.blockList;
  config.resolver.blockList = Array.isArray(existing)
    ? [...existing, ...extraBlock]
    : existing
      ? [existing, ...extraBlock]
      : extraBlock;
}

const gatimitraWorkspacePackages = [
  "contracts",
  "expo-push-kit",
  "expo-location-kit",
  "map-tracking-engine",
  "kot-print",
  "bill-print",
  "print-utils",
  "otp-verify-ui",
  "merchant-payout",
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...Object.fromEntries(
    gatimitraWorkspacePackages.map((pkg) => [
      `@gatimitra/${pkg}`,
      path.resolve(packagesFolder, pkg),
    ]),
  ),
  // Deep path used by @gatimitra/kot-print — avoid resolving to the Node-only
  // package root (PNG/SVG renderers require `fs` and crash Hermes).
  "qrcode/lib/core/qrcode.js": path.resolve(
    workspaceRoot,
    "node_modules/qrcode/lib/core/qrcode.js",
  ),
  "qrcode/lib/core/qrcode": path.resolve(
    workspaceRoot,
    "node_modules/qrcode/lib/core/qrcode.js",
  ),
};

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "qrcode/lib/core/qrcode.js" ||
    moduleName === "qrcode/lib/core/qrcode"
  ) {
    return {
      type: "sourceFile",
      filePath: path.resolve(workspaceRoot, "node_modules/qrcode/lib/core/qrcode.js"),
    };
  }
  // Never let Metro load the Node entry (fs / pngjs) for accidental bare imports.
  if (moduleName === "qrcode") {
    return {
      type: "sourceFile",
      filePath: path.resolve(workspaceRoot, "node_modules/qrcode/lib/core/qrcode.js"),
    };
  }
  if (platform === "web") {
    if (
      moduleName &&
      (moduleName.includes("mapbox-gl") ||
        moduleName.includes("@rnmapbox/maps/lib/module/web"))
    ) {
      return { type: "empty" };
    }
  }
  if (moduleName && moduleName.includes("mapbox-gl/dist/mapbox-gl.css")) {
    return { type: "empty" };
  }
  if (typeof upstreamResolveRequest === "function") {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

module.exports = config;
