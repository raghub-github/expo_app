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
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import {
  computeEta,
  resolveStorePrepMinutes,
} from "./eta.engine.js";
import {
  appendEtaRecalc,
  getEtaForOrder,
  type EtaRecalcReason,
} from "./eta.repository.js";

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
      const view = await getEtaForOrder(orderIdText);
      if (!view) return reply.code(404).send({ ok: false, error: "Order not found" });
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

      const sql = getSql();
      const rows = await sql<
        Array<{
          merchant_store_id: number;
          pickup_lat: string;
          pickup_lon: string;
          drop_lat: string;
          drop_lon: string;
          distance_km: string | null;
          prep_time_minutes: number | null;
        }>
      >`
        SELECT merchant_store_id,
               pickup_lat::text AS pickup_lat,
               pickup_lon::text AS pickup_lon,
               drop_lat::text   AS drop_lat,
               drop_lon::text   AS drop_lon,
               distance_km::text AS distance_km,
               prep_time_minutes
        FROM orders_core
        WHERE order_id = ${orderIdText}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return reply.code(404).send({ ok: false, error: "Order not found" });
      }
      const row = rows[0]!;
      const env = getEnv();
      let routeKm = row.distance_km != null ? Number(row.distance_km) : 0;
      let routeMinutes = 0;
      try {
        const route = await getRoute({
          origin: { lat: Number(row.pickup_lat), lng: Number(row.pickup_lon) },
          destination: { lat: Number(row.drop_lat), lng: Number(row.drop_lon) },
          profile: "driving",
          mapboxToken: env.MAPBOX_ACCESS_TOKEN || undefined,
          osrmBaseUrl: env.OSRM_BASE_URL || undefined,
        });
        if (route.distanceKm > 0) routeKm = route.distanceKm;
        if (route.etaMinutes > 0) routeMinutes = route.etaMinutes;
      } catch {
        routeMinutes = Math.max(5, Math.round((routeKm / 18) * 60));
      }

      // After rider pickup, prep time is 0 — we've already left the store.
      const noPrep = body.reason === "RIDER_PICKED_UP";
      const orderPrep =
        row.prep_time_minutes != null && Number(row.prep_time_minutes) > 0
          ? Math.round(Number(row.prep_time_minutes))
          : null;
      const prepMinutes = noPrep
        ? 0
        : orderPrep != null
          ? orderPrep
          : await resolveStorePrepMinutes(Number(row.merchant_store_id));
      const noAssignment = body.reason === "RIDER_PICKED_UP" || body.reason === "RIDER_ASSIGNED";

      const snap = computeEta({
        routeMinutes,
        routeKm,
        prepMinutes,
        riderAssignmentMinutes: noAssignment ? 0 : undefined,
        trafficDelayMinutes: body.extraTrafficMinutes,
        weatherDelayMinutes: body.extraWeatherMinutes,
        congestionDelayMinutes: body.extraCongestionMinutes,
      });

      await appendEtaRecalc({
        orderIdText,
        newSnap: snap,
        reason: body.reason,
        riderId: body.riderId ?? null,
        merchantStoreId: Number(row.merchant_store_id),
      });

      return reply.send({
        ok: true,
        orderIdText,
        snap: {
          minMinutes: snap.minMinutes,
          maxMinutes: snap.maxMinutes,
          promisedDeliveryAt: snap.promisedDeliveryAt,
          confidenceScore: snap.confidenceScore,
          breakdown: snap.breakdown,
          routeKm: snap.routeKm,
        },
      });
    },
  );
}
