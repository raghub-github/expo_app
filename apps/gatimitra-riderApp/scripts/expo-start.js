/**
 * Stable Expo start for Windows/OneDrive.
 * - Caps Metro workers (avoids EMFILE)
 * - Raises Node heap so metro-file-map disk cache serialize does not OOM
 * - Avoids unnecessary -c unless EXPO_CLEAR_CACHE=1 or --clear is passed
 *
 * Note: `npm start -c` does NOT forward -c to this script (npm owns -c).
 * Use: npm run start:clear   OR   npm start -- --clear
 */
const { spawn } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const clear =
  args.includes("-c") ||
  args.includes("--clear") ||
  process.env.EXPO_CLEAR_CACHE === "1" ||
  // npm start --clear sometimes lands here via npm_config_clear
  process.env.npm_config_clear === "true" ||
  process.env.npm_config_clear === "";

const expoArgs = ["expo", "start", "--port", process.env.EXPO_PORT || "8081"];
if (clear) expoArgs.push("--clear");
for (const a of args) {
  if (a === "-c" || a === "--clear") continue;
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
  METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS || "1",
  EXPO_NO_TELEMETRY: "1",
  // Default: no file-map disk cache on Windows (EMFILE on fs/promises writes).
  METRO_NO_FILEMAP_CACHE:
    process.env.METRO_NO_FILEMAP_CACHE != null
      ? process.env.METRO_NO_FILEMAP_CACHE
      : process.platform === "win32"
        ? "1"
        : "0",
  WATCHMAN_DISABLE_FILE_WATCHING: process.env.WATCHMAN_DISABLE_FILE_WATCHING || "",
};

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  expoArgs,
  {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
