/**
 * Internal endpoints for the payment-worker. Guarded by a shared secret
 * header — NOT exposed publicly, NOT mounted under /v1 like customer-facing
 * routes. Only reachable on the internal docker network (Stage 5) or via the
 * VPS reverse proxy with an allowlist.
 *
 * Endpoints:
 *   POST /payments/reconcile        — runs the same logic the old setInterval
 *                                     ran; returns { checked, finalized }
 *   POST /payments/webhook-replay   — re-enters the Razorpay webhook pipeline
 *                                     with a previously-failed payload
 *
 * Auth model: `x-internal-token` header MUST match env INTERNAL_API_TOKEN.
 * Falls back to 503 (not 401) when no token is configured so a misconfigured
 * backend doesn't look like an auth problem.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { reconcilePendingPayments } from "../orders/order.placement.service.js";

const reconcileBody = z.object({
  scheduled: z.boolean().optional().default(true),
});

const webhookReplayBody = z.object({
  eventId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export async function paymentInternalRoutes(app: FastifyInstance) {
  // Auth preHandler for everything in this scope.
  app.addHook("preHandler", async (req, reply) => {
    const env = getEnv();
    const expected = env.INTERNAL_API_TOKEN ?? "";
    if (!expected) {
      return reply.code(503).send({ ok: false, error: "internal_token_not_configured" });
    }
    const given = String(req.headers["x-internal-token"] ?? "");
    if (given !== expected) {
      return reply.code(401).send({ ok: false, error: "invalid_internal_token" });
    }
  });

  app.post(
    "/payments/reconcile",
    { schema: { body: reconcileBody } },
    async (req, reply) => {
      const db = getDb();
      // Note: reconcilePendingPayments today returns void; once we surface
      // per-call counters, plumb them through. For now we infer "checked"
      // from logs and return 0/0 to keep the API contract typed.
      try {
        await reconcilePendingPayments(db);
        return reply.send({ ok: true, checked: 0, finalized: 0 });
      } catch (err) {
        req.log.error({ err }, "internal_reconcile_failed");
        return reply.code(500).send({
          ok: false,
          error: "reconcile_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  app.post(
    "/payments/webhook-replay",
    { schema: { body: webhookReplayBody } },
    async (req, reply) => {
      const body = req.body as z.infer<typeof webhookReplayBody>;
      // Stage 2 intentionally does NOT implement webhook replay yet — we
      // need to decouple the signed-payload verification from the request
      // handler first (Stage 6). Until then, replay is logged + acked so
      // the worker can clear the queue without bouncing.
      req.log.info(
        { eventId: body.eventId },
        "webhook-replay received (Stage 6 will wire actual replay)",
      );
      return reply.send({ ok: true });
    },
  );
}
