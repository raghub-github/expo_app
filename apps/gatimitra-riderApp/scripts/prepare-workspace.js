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

// Check if packages already exist (from previous run)
const contractsExist = fs.existsSync(path.join(NODE_MODULES_DIR, 'contracts'));
const sdkExist = fs.existsSync(path.join(NODE_MODULES_DIR, 'sdk'));

log('INFO', 'Checking existing packages', {
  contractsExist,
  sdkExist,
  nodeModulesDir: NODE_MODULES_DIR
});

if (contractsExist && sdkExist) {
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
let contractsSource = null;
let sdkSource = null;

log('INFO', 'Searching for packages', {
  packagesDir: PACKAGES_DIR,
  packagesDirExists: fs.existsSync(PACKAGES_DIR)
});

// Location 1: Standard monorepo structure
if (fs.existsSync(PACKAGES_DIR)) {
  contractsSource = path.join(PACKAGES_DIR, 'contracts');
  sdkSource = path.join(PACKAGES_DIR, 'sdk');
  log('INFO', 'Found packages at standard location', {
    contractsSource,
    sdkSource,
    contractsExists: fs.existsSync(contractsSource),
    sdkExists: fs.existsSync(sdkSource)
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
    contractsSource = path.join(altPackagesDir, 'contracts');
    sdkSource = path.join(altPackagesDir, 'sdk');
    log('INFO', 'Found packages at alternative location', {
      contractsSource,
      sdkSource,
      contractsExists: fs.existsSync(contractsSource),
      sdkExists: fs.existsSync(sdkSource)
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

// Copy contracts package
const contractsDest = path.join(NODE_MODULES_DIR, 'contracts');
if (contractsSource && fs.existsSync(contractsSource)) {
  log('INFO', 'Copying contracts package', {
    source: contractsSource,
    dest: contractsDest,
    sourceExists: fs.existsSync(contractsSource)
  });
  console.log('📋 Copying @gatimitra/contracts...');
  if (fs.existsSync(contractsDest)) {
    fs.rmSync(contractsDest, { recursive: true, force: true });
  }
  copyDirectory(contractsSource, contractsDest);
  log('INFO', 'Contracts package copied successfully', {
    destExists: fs.existsSync(contractsDest)
  });
  console.log('✅ @gatimitra/contracts copied');
} else {
  log('WARN', 'Contracts package not found', {
    contractsSource,
    exists: contractsSource ? fs.existsSync(contractsSource) : false
  });
  console.log('⚠️  packages/contracts not found');
}

// Copy sdk package
const sdkDest = path.join(NODE_MODULES_DIR, 'sdk');
if (sdkSource && fs.existsSync(sdkSource)) {
  log('INFO', 'Copying sdk package', {
    source: sdkSource,
    dest: sdkDest,
    sourceExists: fs.existsSync(sdkSource)
  });
  console.log('📋 Copying @gatimitra/sdk...');
  if (fs.existsSync(sdkDest)) {
    fs.rmSync(sdkDest, { recursive: true, force: true });
  }
  copyDirectory(sdkSource, sdkDest);
  log('INFO', 'SDK package copied successfully', {
    destExists: fs.existsSync(sdkDest)
  });
  console.log('✅ @gatimitra/sdk copied');
} else {
  log('WARN', 'SDK package not found', {
    sdkSource,
    exists: sdkSource ? fs.existsSync(sdkSource) : false
  });
  console.log('⚠️  packages/sdk not found');
}

log('INFO', 'Workspace preparation complete', {
  contractsCopied: contractsSource && fs.existsSync(contractsDest),
  sdkCopied: sdkSource && fs.existsSync(sdkDest)
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
