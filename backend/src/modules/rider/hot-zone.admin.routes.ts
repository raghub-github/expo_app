/**
 * Super Admin routes for the Hot Zone Engine — config editor + live zone inspector with
 * "why is this zone hot" explainability (Part 47). Mirrors the auth pattern of
 * tracking-config.admin.routes:
 *   1. JWT with admin / super_admin / manager / support role, OR
 *   2. X-Internal-Secret matching INTERNAL_API_TOKEN (Next.js dashboard proxy).
 *
 * Registered under /v1/admin/hot-zones in index.ts.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import { cellToBoundary } from "h3-js";
import {
  loadHotZoneConfig,
  updateHotZoneConfig,
  type HotZoneConfigPatch,
} from "../../lib/hot-zones/hot-zone-config.js";
import { reconcileHotZonesOnce } from "../../lib/hot-zones/hot-zone-reconciler.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const nonNeg = z.number().nonnegative();
const posInt = z.number().int().positive();

const configPatchSchema = z
  .object({
    enabled: z.boolean(),
    h3Resolution: z.number().int().min(0).max(15),
    neighborhoodRings: z.number().int().min(0).max(20),
    supplyRadiusMeters: posInt.max(200_000),
    demandWindowSeconds: posInt.max(86_400),
    demandHalfLifeSeconds: posInt.max(86_400),
    minWeightedDemand: nonNeg,
    supplyRingDecay: z.number().min(0).max(1),
    minSupplyFloor: z.number().min(0.0001),
    locationFreshnessMaxAgeMinutes: posInt.max(1440),
    warmAt: nonNeg,
    hotAt: nonNeg,
    criticalAt: nonNeg,
    hysteresisMargin: nonNeg,
    validitySeconds: posInt.max(86_400),
    visibilityRadiusMeters: posInt.max(200_000),
    reconcileIntervalSeconds: posInt.min(15).max(600),
    demandAssignedWeight: z.number().min(0).max(1),
  })
  .partial();

export const hotZoneAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    // ── Config: read + update the singleton ──
    admin.get("/config", async () => {
      const cfg = await loadHotZoneConfig(getSql());
      return { success: true, config: cfg };
    });

    admin.put("/config", async (req, reply) => {
      let patch: HotZoneConfigPatch;
      try {
        patch = configPatchSchema.parse(req.body ?? {}) as HotZoneConfigPatch;
      } catch (e) {
        return reply.code(400).send({ error: "invalid_config", message: (e as Error).message });
      }
      // Ordering guard: warm ≤ hot ≤ critical, so classification stays monotonic.
      const cfg = await loadHotZoneConfig(getSql());
      const warm = patch.warmAt ?? cfg.warmAt;
      const hot = patch.hotAt ?? cfg.hotAt;
      const crit = patch.criticalAt ?? cfg.criticalAt;
      if (!(warm <= hot && hot <= crit)) {
        return reply.code(400).send({ error: "invalid_thresholds", message: "warmAt ≤ hotAt ≤ criticalAt required" });
      }
      const updated = await updateHotZoneConfig(patch, getSql());
      return { success: true, config: updated };
    });

    // ── Live zones: current persisted state with explainability breakdown ──
    admin.get("/zones", async (req) => {
      const q = (req.query ?? {}) as Record<string, string>;
      const service = q.service; // optional filter
      const sql = getSql();
      const rows = (await sql`
        SELECT h3_index, resolution, service_type::text AS service_type, status,
               center_lat, center_lng, weighted_demand, effective_supply, pressure,
               unassigned_demand, assigned_demand, order_count, supply_count,
               computed_at, valid_until
        FROM rider_hot_zone_state
        WHERE valid_until > now()
          ${service ? sql`AND service_type::text = ${service}` : sql``}
        ORDER BY pressure DESC
        LIMIT 2000
      `) as unknown as Array<Record<string, unknown>>;

      const zones = rows.map((r) => {
        const boundary = cellToBoundary(String(r.h3_index), true) as [number, number][];
        return {
          h3Index: r.h3_index,
          resolution: Number(r.resolution),
          service: r.service_type,
          status: r.status,
          center: { lat: Number(r.center_lat), lng: Number(r.center_lng) },
          boundary,
          // Explainability — "why is this zone hot":
          weightedDemand: Number(r.weighted_demand),
          effectiveSupply: Number(r.effective_supply),
          pressure: Number(r.pressure),
          unassignedDemand: Number(r.unassigned_demand),
          assignedDemand: Number(r.assigned_demand),
          orderCount: Number(r.order_count),
          supplyCount: Number(r.supply_count),
          computedAt: r.computed_at,
          validUntil: r.valid_until,
        };
      });
      return { success: true, count: zones.length, zones };
    });

    // ── Force an immediate reconcile (debug / after a config change) ──
    admin.post("/reconcile", async () => {
      const { elevated } = await reconcileHotZonesOnce(getSql());
      return { success: true, elevated };
    });
  });
};
