#!/usr/bin/env node
/**
 * Diagnostic script to check what files would be included in EAS archive
 * This helps diagnose why package.json might not be found
 */

const fs = require('fs');
const path = require('path');

const APP_DIR = __dirname + '/..';
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f';

function log(level, message, data = {}) {
  const payload = {
    location: 'check-archive.js',
    message,
    level,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'archive-check',
    hypothesisId: 'H1'
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

log('INFO', 'Starting archive content check', { appDir: APP_DIR });

// Check if package.json exists
const packageJsonPath = path.join(APP_DIR, 'package.json');
const packageJsonExists = fs.existsSync(packageJsonPath);

log('INFO', 'package.json check', {
  path: packageJsonPath,
  exists: packageJsonExists,
  absolutePath: path.resolve(packageJsonPath)
});

if (packageJsonExists) {
  const stats = fs.statSync(packageJsonPath);
  log('INFO', 'package.json stats', {
    size: stats.size,
    isFile: stats.isFile(),
    readable: fs.constants.R_OK
  });
  
  try {
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);
    log('INFO', 'package.json parsed', {
      name: pkg.name,
      version: pkg.version,
      hasScripts: !!pkg.scripts,
      scriptsCount: pkg.scripts ? Object.keys(pkg.scripts).length : 0
    });
  } catch (error) {
    log('ERROR', 'Failed to parse package.json', { error: error.message });
  }
}

// Check .easignore
const easignorePath = path.join(APP_DIR, '.easignore');
const easignoreExists = fs.existsSync(easignorePath);

log('INFO', '.easignore check', {
  path: easignorePath,
  exists: easignoreExists
});

if (easignoreExists) {
  const easignoreContent = fs.readFileSync(easignorePath, 'utf8');
  log('INFO', '.easignore content', {
    lines: easignoreContent.split('\n').length,
    excludesPackageJson: easignoreContent.includes('package.json') && !easignoreContent.includes('!package.json'),
    includesPackageJson: easignoreContent.includes('!package.json')
  });
} else {
  log('INFO', '.easignore does not exist - all files will be included');
}

// List all files in app directory
const files = fs.readdirSync(APP_DIR, { withFileTypes: true });
const fileList = files.map(f => ({
  name: f.name,
  isDirectory: f.isDirectory(),
  isFile: f.isFile()
}));

log('INFO', 'Directory contents', {
  totalItems: fileList.length,
  files: fileList.filter(f => f.isFile).map(f => f.name),
  directories: fileList.filter(f => f.isDirectory).map(f => f.name),
  hasPackageJson: fileList.some(f => f.name === 'package.json')
});

// Check if package.json is in the file list
const packageJsonInList = fileList.some(f => f.name === 'package.json');
log('INFO', 'package.json in directory listing', { found: packageJsonInList });

// Check current working directory
log('INFO', 'Process info', {
  cwd: process.cwd(),
  appDir: APP_DIR,
  __dirname: __dirname
});

console.log('\n✅ Diagnostic complete. Check logs for details.');
