/**
 * Stable Expo start for Windows/OneDrive.
 * - Caps Metro workers (avoids EMFILE)
 * - Avoids unnecessary -c unless EXPO_CLEAR_CACHE=1 or --clear is passed
 * - Keeps NODE_OPTIONS light
 */
const { spawn } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const clear =
  args.includes("-c") ||
  args.includes("--clear") ||
  process.env.EXPO_CLEAR_CACHE === "1";

const expoArgs = ["expo", "start", "--port", process.env.EXPO_PORT || "8081"];
if (clear) expoArgs.push("--clear");
for (const a of args) {
  if (a === "-c" || a === "--clear") continue;
  expoArgs.push(a);
}

const env = {
  ...process.env,
  METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS || "1",
  EXPO_NO_TELEMETRY: "1",
  // Reduce watcher pressure on Windows
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
