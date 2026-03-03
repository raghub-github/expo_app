#!/usr/bin/env node
/**
 * Re-apply Expo "expo-platform" fix after npm install.
 * Run: node scripts/patch-expo-platform.js
 */
const fs = require('fs');
const path = require('path');

const resolvePlatformPath = path.join(
  __dirname,
  '../node_modules/@expo/cli/build/src/start/server/middleware/resolvePlatform.js'
);

if (!fs.existsSync(resolvePlatformPath)) {
  console.warn('Expo CLI resolvePlatform.js not found. Skip patch.');
  process.exit(0);
}

let content = fs.readFileSync(resolvePlatformPath, 'utf8');

// Match and replace so the server doesn't throw when platform is missing
if (content.includes('Must specify "expo-platform"')) {
  content = content.replace(
    /function assertMissingRuntimePlatform\(platform\) \{\s*if \(!platform\) \{\s*throw new _errors\.CommandError[^}]+\}\s*\}/,
    `function assertMissingRuntimePlatform(platform) {
    if (!platform) {
        return;
    }
}`
  );
  console.log('Patched assertMissingRuntimePlatform.');
}
if (content.includes('String(platform)') && !content.includes('const resolved = platform ||')) {
  content = content.replace(
    /const stringifiedPlatform = String\(platform\);/,
    'const resolved = platform || process.env.EXPO_DEFAULT_PLATFORM || \'android\';\n    const stringifiedPlatform = String(resolved);'
  );
  console.log('Patched assertRuntimePlatform default.');
}

fs.writeFileSync(resolvePlatformPath, content);
console.log('Expo platform patch applied.');
