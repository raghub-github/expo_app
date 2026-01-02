import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../config/env.js";

/**
 * IMPORTANT (monorepo bootstrap):
 * Do NOT read env at module import time. `loadEnv()` runs in `src/index.ts`.
 * If we call `getEnv()` here eagerly, it will execute before `.env.local` is loaded.
 */
let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;

  const env = getEnv();

  // Postgres.js maintains its own connection pool.
  const sql = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _sql = sql;
  _db = drizzle(sql);
  return _db;
}

/**
 * Get the underlying postgres client for raw queries
 */
export function getSql() {
  if (!_sql) {
    getDb(); // Initialize if not already
  }
  return _sql!;
}


