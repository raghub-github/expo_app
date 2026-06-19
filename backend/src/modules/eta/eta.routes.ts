/**
 * Public ETA routes mounted at /v1/eta/*.
 *
 *   GET    /orders/:orderIdText               → promise + live ETA (customer + merchant + rider safe)
 *   GET    /orders/:orderIdText/history       → full recalc audit trail (auth-gated)
 *   POST   /orders/:orderIdText/recalc        → trigger a recalc with a reason; appends history row
 *
 * Recalc routing details (origin, drop coords) are taken from orders_core so
 * external callers can't tamper with the inputs. Reasons accepted:
 *   RIDER_ASSIGNED | RIDER_PICKED_UP | TRAFFIC_UPDATE | WEATHER_UPDATE |
 *   MERCHANT_DELAY | BATCHING_CHANGE | MANUAL_OVERRIDE | STATUS_CHANGE
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";
import {
  getEtaForOrder,
  type EtaRecalcReason,
} from "./eta.repository.js";
import { recalcOrderEta } from "./eta.recalc-service.js";
import { runLiveEtaForOrder } from "./eta.live-engine.js";

const RECALC_REASONS: EtaRecalcReason[] = [
  "RIDER_ASSIGNED",
  "RIDER_PICKED_UP",
  "TRAFFIC_UPDATE",
  "WEATHER_UPDATE",
  "MERCHANT_DELAY",
  "BATCHING_CHANGE",
  "MANUAL_OVERRIDE",
  "STATUS_CHANGE",
];

export async function etaRoutes(app: FastifyInstance) {
  app.get(
    "/orders/:orderIdText",
    {
      schema: {
        params: z.object({ orderIdText: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const { orderIdText } = req.params as { orderIdText: string };
      let view = await getEtaForOrder(orderIdText);
      if (!view) return reply.code(404).send({ ok: false, error: "Order not found" });

      // Refresh stale live ETA (> 45s) so customers always see current value.
      try {
        const sql = (await import("../../db/client.js")).getSql();
        let updatedAt: Date | string | null | undefined;
        try {
          const stale = await sql<Array<{ live_eta_updated_at: Date | string | null }>>`
            SELECT live_eta_updated_at FROM orders_core WHERE order_id = ${orderIdText} LIMIT 1
          `;
          updatedAt = stale[0]?.live_eta_updated_at;
        } catch {
          const stale = await sql<Array<{ updated_at: Date | string | null }>>`
            SELECT updated_at FROM orders_core WHERE order_id = ${orderIdText} LIMIT 1
          `;
          updatedAt = stale[0]?.updated_at;
        }
        const ageMs =
          updatedAt != null ? Date.now() - new Date(updatedAt).getTime() : Number.POSITIVE_INFINITY;
        if (ageMs > 45_000) {
          await runLiveEtaForOrder(orderIdText, "STATUS_CHANGE");
          view = (await getEtaForOrder(orderIdText)) ?? view;
        }
      } catch {
        /* non-fatal — return cached view */
      }

      return reply.send({ ok: true, ...view });
    },
  );

  app.get(
    "/orders/:orderIdText/history",
    {
      schema: {
        params: z.object({ orderIdText: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const { orderIdText } = req.params as { orderIdText: string };
      const sql = getSql();
      const rows = await sql`
        SELECT id, old_eta_min, old_eta_max, new_eta_min, new_eta_max,
               promised_delivery_at::text AS promised_delivery_at,
               new_promised_delivery_at::text AS new_promised_delivery_at,
               recalc_reason, prep_minutes, rider_assignment_minutes,
               rider_to_store_minutes, store_to_customer_minutes,
               traffic_delay_minutes, weather_delay_minutes,
               congestion_delay_minutes, buffer_minutes,
               rider_id, merchant_store_id,
               route_distance_km::text AS route_distance_km,
               metadata,
               created_at::text AS created_at
        FROM order_eta_history
        WHERE order_id_text = ${orderIdText}
        ORDER BY id DESC
        LIMIT 100
      `;
      return reply.send({ ok: true, entries: rows });
    },
  );

  /**
   * Recompute ETA. Inputs (route, prep) are re-resolved from orders_core; the
   * caller only chooses a reason and optional delay adjustments. The promise
   * columns on orders_core are NEVER overwritten — recalcs only append to
   * order_eta_history.
   */
  app.post(
    "/orders/:orderIdText/recalc",
    {
      schema: {
        params: z.object({ orderIdText: z.string().min(1) }),
        body: z.object({
          reason: z.enum([
            "RIDER_ASSIGNED",
            "RIDER_PICKED_UP",
            "TRAFFIC_UPDATE",
            "WEATHER_UPDATE",
            "MERCHANT_DELAY",
            "BATCHING_CHANGE",
            "MANUAL_OVERRIDE",
            "STATUS_CHANGE",
          ]),
          extraTrafficMinutes: z.number().int().min(0).max(120).optional(),
          extraWeatherMinutes: z.number().int().min(0).max(120).optional(),
          extraCongestionMinutes: z.number().int().min(0).max(120).optional(),
          riderId: z.number().int().min(1).optional(),
        }),
      },
    },
    async (req, reply) => {
      const { orderIdText } = req.params as { orderIdText: string };
      const body = req.body as {
        reason: EtaRecalcReason;
        extraTrafficMinutes?: number;
        extraWeatherMinutes?: number;
        extraCongestionMinutes?: number;
        riderId?: number;
      };

      if (!RECALC_REASONS.includes(body.reason)) {
        return reply.code(400).send({ ok: false, error: "Invalid reason" });
      }

      const snap = await recalcOrderEta(orderIdText, {
        reason: body.reason,
        extraWeatherMinutes: body.extraWeatherMinutes,
        riderId: body.riderId,
      });
      if (!snap) {
        return reply.code(404).send({ ok: false, error: "Order not found" });
      }

      return reply.send({
        ok: true,
        orderIdText,
        snap: {
          etaMinMinutes: snap.etaMinMinutes,
          etaMaxMinutes: snap.etaMaxMinutes,
          promisedDeliveryAt: snap.promisedDeliveryAt,
          confidenceScore: snap.confidenceScore,
          engineVersion: snap.engineVersion,
          breakdown: snap.breakdown,
          multipliers: snap.multipliers,
          context: snap.context,
          routeKm: snap.routeKm,
        },
      });
    },
  );
}
