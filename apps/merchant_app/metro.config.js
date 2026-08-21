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

for (const dir of [metroCacheDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.cacheStores = ({ FileStore }) => [new FileStore({ root: metroCacheDir })];

// App + shared packages only — never watch partnersite/dashboard/.next (Metro ENOENT crash).
config.watchFolders = [projectRoot, packagesFolder].filter(
  (p, i, arr) => arr.indexOf(p) === i,
);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

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
