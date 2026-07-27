const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const os = require("os");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// Keep Metro cache outside OneDrive — sync can serve stale/wrong asset paths on Windows.
const metroCacheRoot = path.join(os.tmpdir(), "gatimitra-customer-metro-cache");
const metroCacheDir = path.join(metroCacheRoot, "cache");
const metroFileMapDir = path.join(metroCacheRoot, "file-map");

for (const dir of [metroCacheDir, metroFileMapDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.cacheStores = ({ FileStore }) => [new FileStore({ root: metroCacheDir })];
config.fileMapCacheDirectory = metroFileMapDir;

// App + shared packages only — avoid indexing sibling apps (e.g. rider assets/images/mapbike.png).
const packagesFolder = path.resolve(workspaceRoot, "packages");
const gatimitraWorkspacePackages = [
  "contracts",
  "expo-push-kit",
  "expo-location-kit",
  "map-tracking-engine",
];

config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, "packages"),
].filter((p, i, arr) => arr.indexOf(p) === i);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...Object.fromEntries(
    gatimitraWorkspacePackages.map((pkg) => [
      `@gatimitra/${pkg}`,
      path.resolve(packagesFolder, pkg),
    ])
  ),
};

const WEB_MOCKS = {
  "@react-native-async-storage/async-storage": "mocks/async-storage.web.js",
};

function resolveAliasModule(moduleName) {
  if (!moduleName.startsWith("@/")) return null;
  const rel = moduleName.slice(2);
  const base = path.resolve(projectRoot, rel);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { filePath: candidate, type: "sourceFile" };
    }
  }
  return null;
}

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_MOCKS[moduleName]) {
    return {
      filePath: path.resolve(projectRoot, WEB_MOCKS[moduleName]),
      type: "sourceFile",
    };
  }
  const aliasHit = resolveAliasModule(moduleName);
  if (aliasHit) return aliasHit;
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

module.exports = config;
