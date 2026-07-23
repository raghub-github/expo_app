// Learn more https://docs.expo.io/guides/customizing-metro

// EMFILE guard (Windows + OneDrive): OneDrive continuously opens files to sync,
// competing with Metro's workers and expo-router's typed-routes writeFileSync for
// OS file handles. graceful-fs monkeypatches the global fs so open/read/write
// queue-and-retry on EMFILE/ENFILE instead of throwing. Must run before anything
// else touches fs. Pairs with the maxWorkers cap below (fewer concurrent opens).
require('graceful-fs').gracefulify(require('fs'));

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
const gatimitraWorkspacePackages = ['contracts', 'sdk', 'expo-push-kit', 'expo-location-kit'];

config.watchFolders = [
  ...new Set([...(defaultConfig.watchFolders ?? []), packagesFolder]),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

// Keep Metro's file map out of VCS state and native build artifacts. These trees are
// not part of the JS bundle, but after `expo run:android`/`prebuild` they explode to
// thousands of files (android/build, .gradle, .cxx, ios/Pods) that Metro would
// otherwise crawl and hold handles on — a real EMFILE contributor on Windows/OneDrive.
// Merged with any default blockList so we never widen resolution, only narrow crawling.
{
  const extraBlock = [
    /[/\\]\.git[/\\].*/,
    /[/\\]\.expo[/\\].*/,
    /[/\\]android[/\\](build|\.gradle|\.cxx|app[/\\]build)[/\\].*/,
    /[/\\]ios[/\\](build|Pods)[/\\].*/,
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

// Configure resolver to handle mapbox-gl imports on web
const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Always resolve workspace packages from packages/ (avoids stale/incomplete
  // node_modules copies from prepare-workspace on OneDrive/Windows).
  if (typeof moduleName === 'string' && moduleName.startsWith('@gatimitra/')) {
    const withoutScope = moduleName.slice('@gatimitra/'.length);
    const slash = withoutScope.indexOf('/');
    const pkgName = slash === -1 ? withoutScope : withoutScope.slice(0, slash);
    const subpath = slash === -1 ? '' : withoutScope.slice(slash + 1);
    if (gatimitraWorkspacePackages.includes(pkgName)) {
      const pkgRoot = path.resolve(packagesFolder, pkgName);
      const candidates = subpath
        ? [
            path.join(pkgRoot, subpath),
            path.join(pkgRoot, `${subpath}.ts`),
            path.join(pkgRoot, `${subpath}.tsx`),
            path.join(pkgRoot, subpath, 'index.ts'),
            path.join(pkgRoot, subpath, 'index.tsx'),
          ]
        : [
            path.join(pkgRoot, 'src', 'index.ts'),
            path.join(pkgRoot, 'src', 'index.tsx'),
            path.join(pkgRoot, 'index.ts'),
          ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { filePath: candidate, type: 'sourceFile' };
        }
      }
    }
  }

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

// Cap parallel transform workers. Metro defaults to (CPU count - 1) — on a 12-core
// machine that is ~11 workers all opening cache files concurrently, which exhausts
// file handles under OneDrive and triggers EMFILE. Metro's FileStore reads via
// fs/promises (NOT patched by graceful-fs), so capping concurrency is the real fix.
// Override with METRO_MAX_WORKERS if you need to tune for your machine.
config.maxWorkers = Number(process.env.METRO_MAX_WORKERS) || 4;

module.exports = config;
