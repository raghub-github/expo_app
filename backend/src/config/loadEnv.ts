import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

/**
 * Backend env loading rules:
 * 1) Load candidate `.env` / `.env.local` files (lowest → highest priority)
 * 2) Always finish with `backend/.env` then `backend/.env.local` (override),
 *    so a repo-root `.env.local` cannot silently replace DATABASE_URL/REDIS_URL.
 *
 * We do NOT commit any `.env*` files.
 * Example templates live as `env.example` and `env.local.example`.
 */
export function loadEnv() {
  // In a monorepo, `process.cwd()` may be the repo root when running workspace scripts.
  // So we search a small set of candidate directories deterministically.
  const cwd = process.cwd();
  const initCwd = typeof process.env.INIT_CWD === "string" ? process.env.INIT_CWD : "";

  // backendRoot = <repo>/backend (loadEnv.ts is at backend/src/config/loadEnv.ts → 2 levels up)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRoot = path.resolve(__dirname, "..", "..");

  // Also include `<repo>/backend` when cwd is the monorepo root.
  const backendFromCwd = path.resolve(cwd, "backend");
  const backendFromInitCwd = initCwd ? path.resolve(initCwd, "backend") : "";

  const candidates = Array.from(
    new Set([cwd, initCwd, backendFromCwd, backendFromInitCwd, backendRoot].filter(Boolean)),
  );

  // First pass: non-override fills (later files don't clobber earlier unless override).
  for (const base of candidates) {
    const env = path.join(base, ".env");
    const envLocal = path.join(base, ".env.local");
    if (fs.existsSync(env)) dotenv.config({ path: env, override: false });
    if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });
  }

  // Final authority: the backend package env files always win.
  const backendEnv = path.join(backendRoot, ".env");
  const backendEnvLocal = path.join(backendRoot, ".env.local");
  if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv, override: true });
  if (fs.existsSync(backendEnvLocal)) dotenv.config({ path: backendEnvLocal, override: true });
}
