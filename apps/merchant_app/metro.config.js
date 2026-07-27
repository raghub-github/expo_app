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
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

module.exports = config;
