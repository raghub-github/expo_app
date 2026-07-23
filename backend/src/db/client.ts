import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "../config/env.js";
import { isTransientDbError } from "../lib/db/is-transient-db-error.js";
import { withDbSlot, resolvePoolMax } from "../lib/db/db-slot.js";

export { withDbSlot } from "../lib/db/db-slot.js";

/**
 * IMPORTANT (monorepo bootstrap):
 * Do NOT read env at module import time. `loadEnv()` runs in `src/index.ts`.
 * If we call `getEnv()` here eagerly, it will execute before `.env.local` is loaded.
 */
let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;
/** Coalesce concurrent pool resets so one ECONNRESET cannot stampede sql.end(). */
let _resetInFlight: Promise<void> | null = null;
let _poolGeneration = 0;

function isSupabaseTransactionPooler(url: string): boolean {
  try {
    const u = new URL(url);
    // Supabase transaction pooler listens on 6543; session mode is 5432.
    return u.port === "6543" || u.hostname.includes("pooler.supabase.com");
  } catch {
    return false;
  }
}

function createPool(): ReturnType<typeof postgres> {
  const env = getEnv();
  const connectTimeoutSec = env.DATABASE_CONNECT_TIMEOUT_SEC ?? 30;
  // Shared with dbSlotLimit() so the semaphore never admits more than there are
  // connections (over-admission causes database_slot_timeout while Postgres is fine).
  const poolMax = resolvePoolMax();

  const pooler = isSupabaseTransactionPooler(env.DATABASE_URL);
  // Close idle sockets before Supabase PgBouncer kills them (often ~60s),
  // otherwise the next query hits a dead TCP socket → ECONNRESET.
  const idleTimeoutSec = pooler
    ? env.NODE_ENV === "production"
      ? 20
      : 15
    : env.NODE_ENV === "production"
      ? 30
      : 60;
  // Recycle connections before the pooler/NAT drops them mid-query.
  const maxLifetimeSec = pooler
    ? env.NODE_ENV === "production"
      ? 60 * 8
      : 60 * 4
    : env.NODE_ENV === "production"
      ? 60 * 10
      : 60 * 5;

  return postgres(env.DATABASE_URL, {
    max: poolMax,
    idle_timeout: idleTimeoutSec,
    max_lifetime: maxLifetimeSec,
    connect_timeout: connectTimeoutSec,
    // TCP keepalive helps detect dead pooler sockets sooner than idle_timeout alone.
    keep_alive: 10,
    connection: {
      statement_timeout: 15_000,
      application_name: "gatimitra-backend",
    },
    // Required for PgBouncer transaction mode (Supabase :6543).
    prepare: false,
    // MUST stay true: with fetch_types:false, postgres.js cannot resolve array
    // element-type OIDs and serializes JS arrays as a bare "1,2,3" string, so EVERY
    // `= ANY(${array})` query throws `malformed array literal` (22P02). Verified against
    // the Supabase :6543 pooler — type introspection is one plain SELECT per new
    // connection (not per query) and is fully compatible with transaction pooling.
    fetch_types: true,
    onnotice: () => undefined,
  });
}

/**
 * Tear down the shared pool. Serialized — concurrent callers share one end().
 * Prefer NOT calling this on every transient ECONNRESET; that destroys in-flight
 * queries on every other tick/request and causes CONNECTION_DESTROYED storms.
 */
export function resetDbPool(): void {
  void resetDbPoolAsync();
}

export async function resetDbPoolAsync(): Promise<void> {
  if (_resetInFlight) return _resetInFlight;

  _resetInFlight = (async () => {
    const sql = _sql;
    const gen = _poolGeneration;
    _sql = null;
    _db = null;
    _poolGeneration = gen + 1;
    if (sql) {
      await sql.end({ timeout: 2 }).catch(() => undefined);
    }
  })().finally(() => {
    _resetInFlight = null;
  });

  return _resetInFlight;
}

export function getDb() {
  if (_db) return _db;

  const sql = createPool();
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

function collectErrCodes(err: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur && typeof cur === "object"; depth++) {
    const e = cur as { code?: unknown; errno?: unknown; cause?: unknown };
    if (typeof e.code === "string" && e.code) out.push(e.code);
    if (typeof e.errno === "string" && e.errno) out.push(e.errno);
    cur = e.cause;
  }
  return out;
}

function collectErrMessage(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur; depth++) {
    if (typeof cur === "string") {
      parts.push(cur);
      break;
    }
    if (typeof cur !== "object") break;
    const e = cur as { message?: unknown; cause?: unknown };
    if (typeof e.message === "string") parts.push(e.message);
    cur = e.cause;
  }
  return parts.join(" ").toLowerCase();
}

export function isDbConnectionError(err: unknown): boolean {
  if (isTransientDbError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const codes = collectErrCodes(err);
  const connectionCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ETIMEDOUT",
    "CONNECT_TIMEOUT",
    "CONNECTION_DESTROYED",
    "CONNECTION_CLOSED",
    "57P01",
    "08006",
    "08003",
    "XX000",
    "53300",
  ]);
  if (codes.some((c) => connectionCodes.has(c))) return true;
  const msg = collectErrMessage(err);
  return (
    msg.includes("connection_closed") ||
    msg.includes("connection_destroyed") ||
    msg.includes("connection to database closed") ||
    msg.includes("edbhandlerexited") ||
    msg.includes("echeckouttimeout") ||
    msg.includes("getaddrinfo enotfound") ||
    msg.includes("getaddrinfo eai_again") ||
    msg.includes("write connection_closed") ||
    msg.includes("connect_timeout") ||
    msg.includes("connect etimedout")
  );
}

/**
 * True when the postgres.js client itself is dead (sql.end already called, or
 * pooler destroyed the handle). In that case we must rebuild the singleton.
 * Plain ECONNRESET on one socket must NOT trigger a full pool reset — that
 * is what caused CONNECTION_DESTROYED storms across background ticks.
 */
function needsFullPoolReset(err: unknown): boolean {
  const codes = new Set(collectErrCodes(err));
  if (
    codes.has("CONNECTION_DESTROYED") ||
    codes.has("CONNECTION_CLOSED") ||
    codes.has("CONNECT_TIMEOUT")
  ) {
    return true;
  }
  const msg = collectErrMessage(err);
  return (
    msg.includes("connection_destroyed") ||
    msg.includes("connection_closed") ||
    msg.includes("connect_timeout") ||
    // Pooler rejected checkout — stale client often needs a fresh pool.
    msg.includes("edbhandlerexited") ||
    msg.includes("echeckouttimeout")
  );
}

/**
 * Retry a DB operation after transient pooler / network failures.
 *
 * Important: do NOT call sql.end() on every ECONNRESET. The shared pool is used
 * by API requests and many ticks; ending it mid-flight cascades CONNECTION_DESTROYED.
 * Only rebuild the pool when the client is actually unusable.
 */
export async function withSqlRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  // Backoff grows for DNS / connect timeouts so we wait out brief outages.
  const delaysMs = [0, 200, 600, 1500];
  let lastErr: unknown;
  let generationAtStart = _poolGeneration;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // If another caller already rebuilt the pool, use the new client.
      if (!_sql || generationAtStart !== _poolGeneration) {
        getDb();
        generationAtStart = _poolGeneration;
      }
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isDbConnectionError(err) || attempt >= attempts - 1) throw err;

      if (needsFullPoolReset(err)) {
        await resetDbPoolAsync();
        getDb();
        generationAtStart = _poolGeneration;
      }

      const delay = delaysMs[attempt + 1] ?? 1500;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
