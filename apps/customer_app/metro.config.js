require("graceful-fs").gracefulify(require("fs"));

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const os = require("os");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const metroCacheRoot = path.join(os.tmpdir(), "gatimitra-customer-metro-cache");
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

const packagesFolder = path.resolve(workspaceRoot, "packages");
const gatimitraWorkspacePackages = [
  "contracts",
  "expo-push-kit",
  "expo-location-kit",
  "map-tracking-engine",
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
    /[/\\]apps[/\\]gatimitra-riderApp[/\\].*/,
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

const WEB_MOCKS = {
  "@react-native-async-storage/async-storage": "mocks/async-storage.web.js",
};

const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_MOCKS[moduleName]) {
    return {
      filePath: path.resolve(projectRoot, WEB_MOCKS[moduleName]),
      type: "sourceFile",
    };
  }

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

  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

config.maxWorkers = Number(process.env.METRO_MAX_WORKERS) || 2;

module.exports = config;
