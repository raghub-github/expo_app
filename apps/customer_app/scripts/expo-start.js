/**
 * Stable Expo start for Windows/OneDrive (customer app).
 * - Caps Metro workers
 * - Raises Node heap
 * - Never auto-opens a browser via BROWSER=none (web SSR + Android = Metro hang at ~25%)
 * - Platforms default to ios/android only (see app.config.js); use EXPO_WEB=1 for web
 *
 * Clear cache: npm run start:clear   OR   npm start -- --clear   OR   npm start -c
 * Web export:  npm run export:web  (sets EXPO_WEB=1 so web platform is enabled)
 */
const { spawn } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const clear =
  args.includes("-c") ||
  args.includes("--clear") ||
  process.env.EXPO_CLEAR_CACHE === "1" ||
  process.env.npm_config_clear === "true" ||
  process.env.npm_config_clear === "" ||
  process.env.npm_config_c === "true" ||
  process.env.npm_config_c === "";

const forceGo =
  process.env.EXPO_FORCE_GO === "1" || process.env.EXPO_FORCE_GO === "true";
const requestedGo =
  args.includes("--go") ||
  process.env.EXPO_USE_GO === "1" ||
  process.env.npm_lifecycle_event === "start:go";

// Customer app is Expo SDK 54. Play Store Expo Go is often SDK 57+ and refuses
 // this project ("Project is incompatible with this version of Expo Go").
 // Default + recommended path: development build (`expo-dev-client`).
if (requestedGo && !forceGo) {
  console.error(`
[gatimitra-customer] Expo Go is blocked for this app (SDK 54).

Your phone's Expo Go is typically SDK 57 and will show:
  "Project is incompatible with this version of Expo Go"

Use the GatiMitra customer development build instead:
  1. npm start
  2. Open the installed GatiMitra customer app (dev client), not Expo Go
  3. Or press 'a' after Metro starts (with the app installed)

Do NOT press 's' to switch to Expo Go while Metro is running.

Override (unsupported): EXPO_FORCE_GO=1 npm run start:go
`);
  process.exit(1);
}

const modeGo = requestedGo && forceGo;

const online =
  args.includes("--online") ||
  process.env.EXPO_ONLINE === "1" ||
  process.env.npm_lifecycle_event === "start:online" ||
  process.env.npm_lifecycle_event === "start:clear:online";

// Expo Go needs Expo's development certificate. Default --offline blocks that
// ("unable to sign manifest") when you press `s` or use `npm run start:go`.
const wantOffline =
  !online &&
  !modeGo &&
  (args.includes("--offline") || process.env.EXPO_OFFLINE === "1");

const expoArgs = [
  "expo",
  "start",
  "--port",
  process.env.EXPO_PORT || "8081",
];
if (wantOffline) expoArgs.push("--offline");
// Always prefer the development client for this SDK 54 app.
if (modeGo) {
  expoArgs.push("--go");
} else {
  expoArgs.push("--dev-client");
}
console.log(
  modeGo
    ? "[gatimitra-customer] Starting with Expo Go (EXPO_FORCE_GO=1) — SDK mismatch may still fail."
    : "[gatimitra-customer] Starting development client (SDK 54). Open the GatiMitra app, not Expo Go. Do not press 's'."
);
if (clear) expoArgs.push("--clear");
for (const a of args) {
  if (
    a === "-c" ||
    a === "--clear" ||
    a === "--go" ||
    a === "--dev-client" ||
    a === "--offline" ||
    a === "--online" ||
    a === "--no-open"
  ) {
    continue;
  }
  expoArgs.push(a);
}

const existingNodeOptions = String(process.env.NODE_OPTIONS || "").trim();
const heapFlag = "--max-old-space-size=";
const nodeOptions = existingNodeOptions.includes(heapFlag)
  ? existingNodeOptions
  : [existingNodeOptions, "--max-old-space-size=8192"].filter(Boolean).join(" ");

const env = {
  ...process.env,
  NODE_OPTIONS: nodeOptions,
  METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS || "2",
  EXPO_NO_TELEMETRY: "1",
  // Prevent browser /_expo/loading from web-SSR'ing the app while Android bundles.
  BROWSER: "none",
  METRO_NO_FILEMAP_CACHE:
    process.env.METRO_NO_FILEMAP_CACHE != null
      ? process.env.METRO_NO_FILEMAP_CACHE
      : process.platform === "win32"
        ? "1"
        : "0",
};

const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", expoArgs, {
  cwd: path.resolve(__dirname, ".."),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
