import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Backend env loading rules (in order):
 * 1) `.env.local` (machine-specific overrides, never committed)
 * 2) `.env` (shared dev/prod secrets injected by server)
 *
 * We do NOT commit any `.env*` files.
 * Example templates live as `env.example` and `env.local.example`.
 */
export function loadEnv() {
  // In a monorepo, `process.cwd()` may be the repo root when running workspace scripts.
  // So we search a small set of candidate directories deterministically.
  const cwd = process.cwd();
  const initCwd = typeof process.env.INIT_CWD === "string" ? process.env.INIT_CWD : "";

  // backendRoot = <repo>/backend
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // loadEnv.ts is at: backend/src/config/loadEnv.ts → go 3 levels up to reach `backend/`
  const backendRoot = path.resolve(__dirname, "..", "..", "..");

  // Also include `<repo>/backend` when cwd is the monorepo root.
  const backendFromCwd = path.resolve(cwd, "backend");
  const backendFromInitCwd = initCwd ? path.resolve(initCwd, "backend") : "";

  const candidates = Array.from(
    new Set([cwd, initCwd, backendRoot, backendFromCwd, backendFromInitCwd].filter(Boolean)),
  );

  for (const base of candidates) {
    const envLocal = path.join(base, ".env.local");
    const env = path.join(base, ".env");

    if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });
    if (fs.existsSync(env)) dotenv.config({ path: env, override: false });
  }
}


