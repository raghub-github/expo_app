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
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

const slotDepth = new AsyncLocalStorage<number>();

export class DbSlotTimeoutError extends Error {
  constructor() {
    super("database_slot_timeout");
    this.name = "DbSlotTimeoutError";
  }
}

function dbSlotLimit(): number {
  const env = getEnv();
  const poolMax =
    env.DATABASE_POOL_MAX ??
    (env.NODE_ENV === "production" ? 30 : 6);
  return Math.max(2, Math.min(poolMax, env.NODE_ENV === "production" ? 30 : 6));
}

function acquireTimeoutMs(): number {
  const env = getEnv();
  return env.NODE_ENV === "production" ? 12_000 : 8_000;
}

export async function acquireDbSlot(): Promise<void> {
  const limit = dbSlotLimit();
  if (activeDbSlots < limit) {
    activeDbSlots++;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const entry = {
      resolve: () => resolve(),
      reject,
    };
    waitQueue.push(entry);
    setTimeout(() => {
      const idx = waitQueue.indexOf(entry);
      if (idx >= 0) {
        waitQueue.splice(idx, 1);
        reject(new DbSlotTimeoutError());
      }
    }, acquireTimeoutMs());
  });
  activeDbSlots++;
}

export function releaseDbSlot(): void {
  activeDbSlots = Math.max(0, activeDbSlots - 1);
  const next = waitQueue.shift();
  if (next) next.resolve();
}

/** Limits concurrent in-flight DB work (re-entrant — nested calls share one slot). */
export async function withDbSlot<T>(
  fn: () => Promise<T>,
  req?: Pick<FastifyRequest, "dbSlotHeld">
): Promise<T> {
  const depth = slotDepth.getStore() ?? 0;
  if (depth > 0) {
    return fn();
  }
  if (req?.dbSlotHeld) {
    return slotDepth.run(1, fn);
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
