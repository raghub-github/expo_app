#!/usr/bin/env node
/**
 * EAS Build Workspace Preparation Script
 * Copies workspace packages into node_modules for monorepo builds
 */

const fs = require('fs');
const path = require('path');

const APP_DIR = __dirname + '/..';
const PROJECT_ROOT = path.resolve(APP_DIR, '../..');
const PACKAGES_DIR = path.join(PROJECT_ROOT, 'packages');
const NODE_MODULES_DIR = path.join(APP_DIR, 'node_modules', '@gatimitra');
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f';

function log(level, message, data = {}) {
  const payload = {
    location: 'prepare-workspace.js',
    message,
    level,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'preinstall-hook',
    hypothesisId: 'H3'
  };
  
  // #region agent log
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
  // #endregion
  
  console.log(`[${level}] ${message}`, data);
}

log('INFO', 'Script started', {
  appDir: APP_DIR,
  projectRoot: PROJECT_ROOT,
  cwd: process.cwd(),
  __dirname: __dirname
});

console.log('🔧 Preparing monorepo workspace for EAS build...');
console.log('📦 Project root:', PROJECT_ROOT);
console.log('📱 App directory:', APP_DIR);
console.log('📁 Packages directory:', PACKAGES_DIR);

function packageIsReady(packageName) {
  const packageRoot = path.join(NODE_MODULES_DIR, packageName);
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const entryPath = path.join(packageRoot, 'src', 'index.ts');
  return fs.existsSync(packageJsonPath) && fs.existsSync(entryPath);
}

const workspacePackages = ['contracts', 'sdk', 'expo-push-kit', 'expo-location-kit'];
const packagesReady = Object.fromEntries(
  workspacePackages.map((pkg) => [pkg, packageIsReady(pkg)])
);

log('INFO', 'Checking existing packages', {
  packagesReady,
  nodeModulesDir: NODE_MODULES_DIR
});

if (workspacePackages.every((pkg) => packagesReady[pkg])) {
  log('INFO', 'Packages already exist, skipping', {});
  console.log('✅ Workspace packages already prepared, skipping...');
  process.exit(0);
}

// Create node_modules/@gatimitra directory
log('INFO', 'Creating node_modules directory', {
  nodeModulesDir: NODE_MODULES_DIR,
  exists: fs.existsSync(NODE_MODULES_DIR)
});

if (!fs.existsSync(NODE_MODULES_DIR)) {
  fs.mkdirSync(NODE_MODULES_DIR, { recursive: true });
  log('INFO', 'Created node_modules directory', {});
}

// Try to find packages in multiple locations
const packageSources = {};

log('INFO', 'Searching for packages', {
  packagesDir: PACKAGES_DIR,
  packagesDirExists: fs.existsSync(PACKAGES_DIR)
});

function resolvePackageSources(packagesDir) {
  for (const pkg of workspacePackages) {
    packageSources[pkg] = path.join(packagesDir, pkg);
  }
}

// Location 1: Standard monorepo structure
if (fs.existsSync(PACKAGES_DIR)) {
  resolvePackageSources(PACKAGES_DIR);
  log('INFO', 'Found packages at standard location', {
    packageSources,
    packagesDir: PACKAGES_DIR,
  });
  console.log('✅ Found packages directory at standard location');
} else {
  // Location 2: Alternative location (EAS build might extract differently)
  const altPackagesDir = path.join(APP_DIR, '..', '..', 'packages');
  log('INFO', 'Checking alternative location', {
    altPackagesDir,
    exists: fs.existsSync(altPackagesDir)
  });
  
  if (fs.existsSync(altPackagesDir)) {
    resolvePackageSources(altPackagesDir);
    log('INFO', 'Found packages at alternative location', {
      packageSources,
      packagesDir: altPackagesDir,
    });
    console.log('✅ Found packages directory at alternative location');
  } else {
    log('WARN', 'Packages directory not found', {
      checkedLocations: [PACKAGES_DIR, altPackagesDir],
      currentWorkingDir: process.cwd(),
      appDir: APP_DIR
    });
    console.log('⚠️  Packages directory not found. This might be an EAS build.');
    console.log('⚠️  Build may fail if workspace packages are required.');
    process.exit(0);
  }
}

for (const pkg of workspacePackages) {
  const source = packageSources[pkg];
  const dest = path.join(NODE_MODULES_DIR, pkg);

  if (packagesReady[pkg]) {
    console.log(`✅ @gatimitra/${pkg} already prepared`);
    continue;
  }

  if (source && fs.existsSync(source)) {
    log('INFO', `Linking/copying ${pkg} package`, {
      source,
      dest,
      sourceExists: fs.existsSync(source),
    });
    console.log(`📋 Preparing @gatimitra/${pkg}...`);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    // Prefer a Windows junction / POSIX symlink so Metro always sees live package sources.
    let mode = 'copy';
    try {
      fs.symlinkSync(source, dest, process.platform === 'win32' ? 'junction' : 'dir');
      mode = process.platform === 'win32' ? 'junction' : 'symlink';
    } catch (err) {
      log('WARN', `Symlink failed for ${pkg}, copying instead`, {
        error: err instanceof Error ? err.message : String(err),
      });
      copyDirectory(source, dest);
    }
    log('INFO', `${pkg} package prepared successfully`, {
      destExists: fs.existsSync(dest),
      entryExists: fs.existsSync(path.join(dest, 'src', 'index.ts')),
      mode,
    });
    console.log(`✅ @gatimitra/${pkg} prepared (${mode})`);
  } else {
    log('WARN', `${pkg} package not found`, {
      source,
      exists: source ? fs.existsSync(source) : false,
    });
    console.log(`⚠️  packages/${pkg} not found`);
  }
}

log('INFO', 'Workspace preparation complete', {
  packagesCopied: Object.fromEntries(
    workspacePackages.map((pkg) => [
      pkg,
      Boolean(packageSources[pkg] && fs.existsSync(path.join(NODE_MODULES_DIR, pkg, 'package.json'))),
    ]),
  ),
});
console.log('✅ Monorepo workspace preparation complete!');

function copyDirectory(src, dest) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Copy files
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and other build artifacts
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
