import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../config/env.js";
import { isTransientDbError } from "../lib/db/is-transient-db-error.js";
import { withDbSlot } from "../lib/db/db-slot.js";

export { withDbSlot } from "../lib/db/db-slot.js";

/**
 * IMPORTANT (monorepo bootstrap):
 * Do NOT read env at module import time. `loadEnv()` runs in `src/index.ts`.
 * If we call `getEnv()` here eagerly, it will execute before `.env.local` is loaded.
 */
let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function resetDbPool(): void {
  const sql = _sql;
  _sql = null;
  _db = null;
  if (sql) {
    void sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

export function getDb() {
  if (_db) return _db;

  const env = getEnv();

  const connectTimeoutSec = env.DATABASE_CONNECT_TIMEOUT_SEC ?? 30;
  const poolMax =
    env.DATABASE_POOL_MAX ??
    (env.NODE_ENV === "production" ? 30 : 6);

  const sql = postgres(env.DATABASE_URL, {
    max: poolMax,
    idle_timeout: env.NODE_ENV === "production" ? 30 : 60,
    max_lifetime: env.NODE_ENV === "production" ? 60 * 10 : 60 * 5,
    connect_timeout: connectTimeoutSec,
    connection: { statement_timeout: 15_000 },
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
    getDb();
  }
  return _sql!;
}

export function isDbConnectionError(err: unknown): boolean {
  if (isTransientDbError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: string; message?: string };
  const code = String(e.code ?? e.errno ?? "");
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "CONNECTION_DESTROYED" ||
    code === "57P01" ||
    code === "08006" ||
    code === "CONNECTION_CLOSED" ||
    code === "XX000"
  ) {
    return true;
  }
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("connection_closed") ||
    msg.includes("connection to database closed") ||
    msg.includes("edbhandlerexited") ||
    msg.includes("write connection_closed")
  );
}

/** Reset pool and retry after Supabase pooler drops a stale socket. */
export async function withSqlRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  const delaysMs = [0, 150, 400];
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isDbConnectionError(err) || attempt >= attempts - 1) throw err;
      resetDbPool();
      const delay = delaysMs[attempt + 1] ?? 400;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
