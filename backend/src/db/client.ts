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

  // Postgres.js maintains its own connection pool. Five was far too low even
  // for dev: a single store-open in the customer app fans out to ~5 parallel
  // HTTP requests, each running 3–5 queries. With max=5 the pool saturated
  // immediately, queries queued behind each other, and the customer app saw
  // "Network Error" / billing never resolving while the handlers waited on
  // a connection. Supabase's transaction pooler accepts plenty more.
  const connectTimeoutSec = env.DATABASE_CONNECT_TIMEOUT_SEC ?? 30;
  const poolMax = env.NODE_ENV === "production" ? 30 : 20;

  const sql = postgres(env.DATABASE_URL, {
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: connectTimeoutSec,
    // Cap any single query at 15s so a runaway statement can't hold a
    // connection forever and starve everything else.
    connection: { statement_timeout: 15_000 },
    // Supabase pooler (port 6543) does not support prepared statements across
    // pooled connections — must be disabled or DEALLOCATE errors recur.
    prepare: false,
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


