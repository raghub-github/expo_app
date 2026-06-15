#!/usr/bin/env node
/**
 * EAS Build pre-install hook (runs before npm install).
 * Prepares monorepo workspace packages; never hard-fails the build.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const prepareScript = path.join(__dirname, "prepare-workspace.js");

console.log("[eas-pre-install] Preparing monorepo workspace...");
console.log("[eas-pre-install] cwd:", process.cwd());

const pkgPath = path.join(process.cwd(), "package.json");
if (!require("fs").existsSync(pkgPath)) {
  console.warn(
    "[eas-pre-install] package.json missing in cwd — EAS should use apps/gatimitra-riderApp as project root."
  );
}

const result = spawnSync(process.execPath, [prepareScript], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.warn(
    "[eas-pre-install] prepare-workspace exited with",
    result.status,
    "— continuing build."
  );
}

console.log("[eas-pre-install] Done.");
