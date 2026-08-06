import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const sql = postgres(databaseUrl, {
    // Dev used to run 5 connections. The tickets list alone fires the page
    // query, the count query and several background maintenance queries at
    // once, so a handful of concurrent requests exhausted the pool and every
    // later query sat waiting (the 60s and 2.8min responses in the logs).
    max: process.env.NODE_ENV === "production" ? 20 : 10,
    idle_timeout: 20,
    connect_timeout: 30, // Increased from 10 to 30 seconds
    max_lifetime: 60 * 30, // 30 minutes
    prepare: false, // Avoid "prepared statement does not exist" with connection pooling
    // DATABASE_URL points at the Supabase pooler (port 6543 = pgbouncer in
    // transaction mode), so `prepare: false` is required. The side effect is
    // that every parameterised query rides the *unnamed* prepared statement,
    // and postgres.js sends those in two round trips (Parse+Describe+Flush,
    // then Bind+Execute+Sync). Under concurrency pgbouncer can serve those two
    // round trips from different server backends, where the unnamed statement
    // is whatever another client last parsed — surfacing as "bind message
    // supplies 2 parameters, but prepared statement '' requires 1"
    // (SQLSTATE 08P01). That is the error the tickets list was throwing during
    // bulk updates.
    //
    // Capping the pipeline shrinks the window (from up to 100 queries in flight
    // per connection down to 2) but cannot close it — see withPgRetry below,
    // and prefer the direct/session connection string for this service.
    //
    // `max_pipeline` is a real postgres.js option (parsed alongside idle_timeout
    // and friends) that its .d.ts never declared, hence the cast.
    ...({ max_pipeline: 1 } as Record<string, number>),
    connection: {
      // A runaway query must not hold a pooled connection for minutes.
      statement_timeout: process.env.NODE_ENV === "production" ? 30_000 : 60_000,
      idle_in_transaction_session_timeout: 30_000,
    },
  });

  _sql = sql;
  _db = drizzle(sql, { schema });
  return _db;
}

export function getSql() {
  if (!_sql) {
    getDb();
  }
  return _sql!;
}

/**
 * Transient pooler faults that are safe to retry.
 *
 * 08P01 is the unnamed-prepared-statement collision described on the pool
 * options above; 08006 / 08003 are connection resets from the pooler recycling
 * a backend. All three mean "this attempt never reached a consistent state",
 * not "the statement is wrong".
 */
const RETRYABLE_PG_CODES = new Set(["08P01", "08006", "08003", "57P01"]);

export function isRetryablePgError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && RETRYABLE_PG_CODES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("bind message supplies");
}

/**
 * Run a **read-only** query with one retry on a transient pooler fault.
 *
 * Deliberately not used for writes: a write that failed at Bind may or may not
 * have been applied, so retrying it is not safe without an idempotency key.
 */
export async function withPgRetry<T>(
  run: () => Promise<T>,
  label: string,
  attempts = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryablePgError(error)) throw error;
      console.warn(
        `[db] ${label}: transient pooler error (${(error as { code?: string }).code ?? "?"}), retrying ${attempt}/${attempts - 1}`
      );
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
  throw lastError;
}

/** Serialize JSON/JSONB params for postgres.js tagged templates (unknown metadata objects). */
export function sqlJsonbParam(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}
