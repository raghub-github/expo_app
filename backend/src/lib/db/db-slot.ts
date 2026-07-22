import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyRequest } from "fastify";
import { getEnv } from "../../config/env.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by db-slot-request plugin — one slot held for the whole HTTP request. */
    dbSlotHeld?: boolean;
  }
}

let activeDbSlots = 0;
type WaitEntry = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
};
const waitQueue: WaitEntry[] = [];

const slotDepth = new AsyncLocalStorage<number>();
/** True for the remainder of an HTTP request after the request-level slot is acquired. */
const requestSlotAls = new AsyncLocalStorage<boolean>();

export class DbSlotTimeoutError extends Error {
  constructor() {
    super("database_slot_timeout");
    this.name = "DbSlotTimeoutError";
  }
}

/**
 * The postgres.js pool `max` — the single source of truth for DB concurrency.
 * createPool() in db/client.ts uses this too, so the slot limit and the real
 * connection count can never drift apart.
 */
export function resolvePoolMax(): number {
  const env = getEnv();
  // Dev raised 8 → 16: one dev backend shares this pool between the app bursts
  // (rider + customer polling) AND ~10 background ticks (schedule, dispatch, ETA,
  // reconciler …). Eight connections saturated instantly → database_slot_timeout /
  // "Database is busy" 503s that froze the apps. Supabase (max_connections=60, via
  // the Supavisor transaction pooler) has ample headroom. Prod unchanged.
  return env.DATABASE_POOL_MAX ?? (env.NODE_ENV === "production" ? 25 : 16);
}

/**
 * Align the slot limit with the actual pool size — "one in-flight ≈ one slot".
 *
 * Must NOT exceed the pool `max`: if it does, the semaphore admits more concurrent
 * DB work than there are connections, and the excess queues *inside* postgres.js
 * while still holding slots — which cascades into `database_slot_timeout` 503s even
 * though Postgres itself is healthy. (Previously dev admitted 20 with only 8
 * connections.) Setting DATABASE_POOL_MAX now scales both together.
 */
export function dbSlotLimit(): number {
  return Math.max(2, resolvePoolMax());
}

function acquireTimeoutMs(): number {
  const env = getEnv();
  if (env.DATABASE_SLOT_ACQUIRE_TIMEOUT_MS != null) {
    return env.DATABASE_SLOT_ACQUIRE_TIMEOUT_MS;
  }
  // Dev lowered 25s → 10s: a 25s hang is what made the app feel "stuck". Fail fast so
  // the client can retry/show state instead of freezing on one blocked request.
  return env.NODE_ENV === "production" ? 12_000 : 10_000;
}

export function getDbSlotStats(): { active: number; waiting: number; limit: number } {
  return { active: activeDbSlots, waiting: waitQueue.length, limit: dbSlotLimit() };
}

/**
 * Acquire a concurrency slot.
 * Waiters receive a *transferred* slot (no active++), avoiding the race where a
 * fast-path acquire + waiter both increment after a release and inflate phantoms.
 */
export async function acquireDbSlot(): Promise<void> {
  const limit = dbSlotLimit();
  if (activeDbSlots < limit) {
    activeDbSlots++;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const entry: WaitEntry = {
      resolve,
      reject,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry);
      if (idx >= 0) {
        waitQueue.splice(idx, 1);
        entry.timer = null;
        reject(new DbSlotTimeoutError());
      }
    }, acquireTimeoutMs());
    waitQueue.push(entry);
  });
  // Slot was transferred from the releaser — activeDbSlots stays the same.
}

export function releaseDbSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    if (next.timer) {
      clearTimeout(next.timer);
      next.timer = null;
    }
    next.resolve();
    return;
  }
  activeDbSlots = Math.max(0, activeDbSlots - 1);
}

/** Mark this async context as already holding the request-level DB slot. */
export function enterRequestDbSlotContext(): void {
  requestSlotAls.enterWith(true);
}

export function clearRequestDbSlotContext(): void {
  requestSlotAls.enterWith(false);
}

function requestAlreadyHoldsSlot(req?: Pick<FastifyRequest, "dbSlotHeld">): boolean {
  if (req?.dbSlotHeld) return true;
  return requestSlotAls.getStore() === true;
}

/** Limits concurrent in-flight DB work (re-entrant — nested calls share one slot). */
export async function withDbSlot<T>(
  fn: () => Promise<T>,
  req?: Pick<FastifyRequest, "dbSlotHeld">
): Promise<T> {
  const depth = slotDepth.getStore() ?? 0;
  if (depth > 0 || requestAlreadyHoldsSlot(req)) {
    return slotDepth.run(depth + 1, fn);
  }

  await acquireDbSlot();
  return slotDepth.run(1, async () => {
    try {
      return await fn();
    } finally {
      releaseDbSlot();
    }
  });
}
