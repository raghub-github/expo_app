import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { acquireDbSlot, releaseDbSlot } from "../lib/db/db-slot.js";

function skipRequestDbSlot(req: FastifyRequest): boolean {
  if (req.method === "OPTIONS") return true;
  const path = (req.routeOptions?.url ?? req.url).split("?")[0] ?? "";
  // R2 proxy only — no Postgres on this path.
  if (path.includes("/attachments/proxy")) return true;
  return false;
}

/**
 * Holds one DB concurrency slot for the lifetime of each API request so startup
 * bursts do not open more connections than the Supabase pooler allows.
 */
async function dbSlotRequestPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    req.dbSlotHeld = false;
  });

  app.addHook("preHandler", async (req) => {
    if (skipRequestDbSlot(req)) return;
    await acquireDbSlot();
    req.dbSlotHeld = true;
  });

  app.addHook("onResponse", async (req) => {
    if (!req.dbSlotHeld) return;
    releaseDbSlot();
    req.dbSlotHeld = false;
  });

  app.addHook("onError", async (req) => {
    if (!req.dbSlotHeld) return;
    releaseDbSlot();
    req.dbSlotHeld = false;
  });
}

export const dbSlotRequest = fp(dbSlotRequestPlugin, { name: "db-slot-request" });
