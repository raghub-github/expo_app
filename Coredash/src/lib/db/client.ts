import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const sql = postgres(databaseUrl, {
    max: process.env.NODE_ENV === "production" ? 12 : 8,
    idle_timeout: 20,
    connect_timeout: 30,
    max_lifetime: 60 * 30,
    prepare: false,
    ...({ max_pipeline: 1 } as Record<string, number>),
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (value: Date | string) =>
          value instanceof Date ? value.toISOString() : String(value),
        parse: (value: string) => value,
      },
    },
    connection: {
      statement_timeout: process.env.NODE_ENV === "production" ? 30_000 : 60_000,
      idle_in_transaction_session_timeout: 30_000,
    },
  });

  _sql = sql;
  _db = drizzle(sql);
  return _db;
}

export function getSql() {
  if (!_sql) getDb();
  return _sql!;
}

const RETRYABLE_PG_CODES = new Set(["08P01", "08006", "08003", "57P01"]);

export function isRetryablePgError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && RETRYABLE_PG_CODES.has(code)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("bind message supplies");
}

export async function withPgRetry<T>(run: () => Promise<T>, label: string, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryablePgError(error)) throw error;
      console.warn(`[coredash:db] ${label}: retry ${attempt}`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  throw lastError;
}

export async function safeQuery<T>(label: string, run: () => Promise<T>, fallback: unknown): Promise<T> {
  try {
    return await withPgRetry(run, label);
  } catch (error) {
    console.error(`[coredash:db] ${label}`, error);
    return fallback as T;
  }
}

export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function str(value: unknown): string {
  return value == null ? "" : String(value);
}
