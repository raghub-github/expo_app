// Learn more https://docs.expo.io/guides/customizing-metro

// EMFILE guard (Windows + OneDrive): OneDrive continuously opens files to sync,
// competing with Metro's workers. graceful-fs queues open/read/write on EMFILE.
require("graceful-fs").gracefulify(require("fs"));

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const os = require("os");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// Keep Metro cache outside OneDrive/Desktop — sync can break bundle file reads on Windows.
const metroCacheRoot = path.join(os.tmpdir(), "gatimitra-rider-metro-cache");
const metroCacheDir = path.join(metroCacheRoot, "cache");
const metroFileMapDir = path.join(metroCacheRoot, "file-map");

for (const dir of [metroCacheDir, metroFileMapDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {import('expo/metro-config').MetroConfig} */
const defaultConfig = getDefaultConfig(projectRoot);
const config = defaultConfig;

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
        console.warn(
          "[metro] Cache clear skipped — stop the other Metro/Expo process or use npm start without -c.",
        );
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

// CRITICAL: do NOT inherit Expo's default watchFolders — in this monorepo that
// includes dashboard, backend, customer_app, merchant_app, all workers, etc.
// Watching the whole tree on OneDrive/Windows exhausts file handles → EMFILE →
// Metro process dies (looks like the port was "auto killed").
const packagesFolder = path.resolve(workspaceRoot, "packages");
const gatimitraWorkspacePackages = [
  "contracts",
  "sdk",
  "expo-push-kit",
  "expo-location-kit",
  "map-tracking-engine",
  "otp-verify-ui",
];

config.watchFolders = [
  projectRoot,
  packagesFolder,
  path.resolve(workspaceRoot, "node_modules"),
].filter((p, i, arr) => arr.indexOf(p) === i);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;

{
  // Block only workspace-root folders — do NOT use bare `/services/` (that also
  // matches `apps/gatimitra-riderApp/src/services` and breaks Metro resolution).
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
    /[/\\]apps[/\\]merchant_app[/\\].*/,
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

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...Object.fromEntries(
    gatimitraWorkspacePackages.map((pkg) => [
      `@gatimitra/${pkg}`,
      path.resolve(packagesFolder, pkg),
    ]),
  ),
};

const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (typeof moduleName === "string" && moduleName.startsWith("@gatimitra/")) {
    const withoutScope = moduleName.slice("@gatimitra/".length);
    const slash = withoutScope.indexOf("/");
    const pkgName = slash === -1 ? withoutScope : withoutScope.slice(0, slash);
    const subpath = slash === -1 ? "" : withoutScope.slice(slash + 1);
    if (gatimitraWorkspacePackages.includes(pkgName)) {
      const pkgRoot = path.resolve(packagesFolder, pkgName);
      const candidates = subpath
        ? [
            path.join(pkgRoot, subpath),
            path.join(pkgRoot, `${subpath}.ts`),
            path.join(pkgRoot, `${subpath}.tsx`),
            path.join(pkgRoot, subpath, "index.ts"),
            path.join(pkgRoot, subpath, "index.tsx"),
          ]
        : [
            path.join(pkgRoot, "src", "index.ts"),
            path.join(pkgRoot, "src", "index.tsx"),
            path.join(pkgRoot, "index.ts"),
          ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { filePath: candidate, type: "sourceFile" };
        }
      }
    }
  }

  if (platform !== "web" && moduleName === "ws") {
    return {
      filePath: path.resolve(projectRoot, "metro-ws-shim.js"),
      type: "sourceFile",
    };
  }

  if (platform === "web") {
    if (
      moduleName === "sp-react-native-in-app-updates" ||
      (typeof moduleName === "string" &&
        moduleName.includes("sp-react-native-in-app-updates"))
    ) {
      return { type: "empty" };
    }
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

  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

// Cap workers hard — Metro FileStore uses fs/promises (not graceful-fs).
// Override with METRO_MAX_WORKERS if needed.
config.maxWorkers = Number(process.env.METRO_MAX_WORKERS) || 1;

module.exports = config;
