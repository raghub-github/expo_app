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
const defaultConfig = getDefaultConfig(projectRoot);
const config = defaultConfig;

// Keep Metro file cache outside OneDrive (invalid option fileMapCacheDirectory removed for expo-doctor).
// Wrap clear() — Metro's default clear can throw ENOTEMPTY on Windows when another bundler holds files.
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
      const code = err && typeof err === 'object' ? err.code : null;
      if (code === 'ENOTEMPTY' || code === 'EBUSY' || code === 'EPERM') {
        console.warn(
          '[metro] Cache clear skipped — stop the other Metro/Expo process (often port 8081) or use npm start without -c.',
        );
        return;
      }
      throw err;
    }
  };
  return [store];
};

const packagesFolder = path.resolve(workspaceRoot, 'packages');
const gatimitraWorkspacePackages = ['contracts', 'sdk', 'expo-push-kit'];

config.watchFolders = [
  ...new Set([...(defaultConfig.watchFolders ?? []), packagesFolder]),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...Object.fromEntries(
    gatimitraWorkspacePackages.map((pkg) => [
      `@gatimitra/${pkg}`,
      path.resolve(packagesFolder, pkg),
    ]),
  ),
};

// Configure resolver to handle mapbox-gl imports on web
const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Supabase realtime-js imports Node `ws` → use RN global WebSocket instead.
  if (platform !== 'web' && moduleName === 'ws') {
    return {
      filePath: path.resolve(projectRoot, 'metro-ws-shim.js'),
      type: 'sourceFile',
    };
  }

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
