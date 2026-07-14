import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  acquireDbSlot,
  releaseDbSlot,
  enterRequestDbSlotContext,
  clearRequestDbSlotContext,
} from "../lib/db/db-slot.js";
import { getEnv } from "../config/env.js";

function skipRequestDbSlot(req: FastifyRequest): boolean {
  if (req.method === "OPTIONS") return true;
  const path = (req.routeOptions?.url ?? req.url).split("?")[0] ?? "";
  if (path.includes("/attachments/proxy")) return true;
  if (path.includes("/partner-status")) return true;
  if (path === "/health" || path.endsWith("/health")) return true;
  // High-frequency merchant polls — never occupy a global slot for the full request.
  if (path.includes("/waiting-for-order")) return true;
  if (path.includes("/active-orders-count")) return true;
  if (path.includes("/notifications")) return true;
  return false;
}

function releaseRequestSlot(req: FastifyRequest): void {
  if (!req.dbSlotHeld) return;
  req.dbSlotHeld = false;
  clearRequestDbSlotContext();
  releaseDbSlot();
}

/**
 * Optional request-lifetime DB slots.
 *
 * DISABLED BY DEFAULT — holding a slot for the entire HTTP request (JWT, JSON,
 * push, etc.) saturates the semaphore under normal merchant/customer polling and
 * surfaces as database_slot_timeout 503s while Postgres is fine.
 *
 * Postgres.js `max` is the real connection backpressure. Use `withDbSlot()` only
 * around intentional DB bursts. Set DATABASE_REQUEST_SLOTS=1 to re-enable the old
 * behavior in an emergency.
 */
async function dbSlotRequestPlugin(app: FastifyInstance) {
  const enabled = getEnv().DATABASE_REQUEST_SLOTS === true;
  if (!enabled) {
    app.addHook("onRequest", async (req) => {
      req.dbSlotHeld = false;
    });
    return;
  }

  app.addHook("onRequest", async (req) => {
    req.dbSlotHeld = false;
  });

  app.addHook("preHandler", async (req) => {
    if (skipRequestDbSlot(req)) return;
    await acquireDbSlot();
    req.dbSlotHeld = true;
    enterRequestDbSlotContext();
  });

  app.addHook("onResponse", async (req) => {
    releaseRequestSlot(req);
  });

  app.addHook("onError", async (req) => {
    releaseRequestSlot(req);
  });
}

export const dbSlotRequest = fp(dbSlotRequestPlugin, { name: "db-slot-request" });
