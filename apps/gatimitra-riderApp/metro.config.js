// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const os = require('os');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Keep Metro cache outside OneDrive/Desktop — sync can break bundle file reads on Windows.
const metroCacheRoot = path.join(os.tmpdir(), 'gatimitra-rider-metro-cache');
const metroCacheDir = path.join(metroCacheRoot, 'cache');
const metroFileMapDir = path.join(metroCacheRoot, 'file-map');

for (const dir of [metroCacheDir, metroFileMapDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: metroCacheDir }),
];
config.fileMapCacheDirectory = metroFileMapDir;

// Watch app + shared packages only (full-repo watch on OneDrive/Windows often misses HMR file events).
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'packages'),
].filter((p, i, arr) => arr.indexOf(p) === i);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Configure resolver to handle mapbox-gl imports on web
const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Ignore mapbox-gl imports on web (they're not needed for React Native web)
  if (platform === 'web') {
    if (moduleName && (
      moduleName.includes('mapbox-gl') ||
      moduleName.includes('@rnmapbox/maps/lib/module/web')
    )) {
      return {
        type: 'empty',
      };
    }
  }
  
  // Ignore mapbox-gl CSS imports (they're not needed for React Native)
  if (moduleName && moduleName.includes('mapbox-gl/dist/mapbox-gl.css')) {
    return {
      type: 'empty',
    };
  }
  
  // Use default resolver for everything else
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

module.exports = config;
