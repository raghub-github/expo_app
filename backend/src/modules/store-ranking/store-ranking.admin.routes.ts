/**
 * Super Admin routes for the food store-ranking policy (store_ranking_config).
 *
 * Auth: JWT admin-like role OR X-Internal-Secret (Next.js dashboard proxy) — same pattern as
 * rideWalletConfig.admin.routes. Registered under /v1/admin/store-ranking in index.ts.
 *
 *   GET  /config?profile=HOME_FOOD   → current config (weights/caps/windows, enabled, revision)
 *   PUT  /config                     → save (validated, bumps revision, appends history)
 *   GET  /history?profile=HOME_FOOD  → revision history
 *   POST /preview                    → simulate ranking for a location (real metrics + boosts,
 *                                       haversine candidate distances), returns ranked + breakdown
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import {
  loadStoredRankingConfig,
  saveRankingConfig,
  type RankingConfigUpdate,
} from "./config-store.js";
import { loadRankingMetricsForStores, metricsToHistoricalFeatures } from "./metrics-read.js";
import { loadActiveSubscriptionBoosts } from "./subscription-boost.js";
import { rankStores } from "./engine.js";
import { defaultConfigForProfile } from "./default-config.js";
import { customerListStoreTypesForSql } from "../merchants/merchantStoreTypeFilters.js";
import type { RankingConfig, RankingProfile, StoreFeatures } from "./types.js";

const PROFILES = ["HOME_FOOD", "FOOD_CATEGORY", "FOOD_SEARCH", "FOOD_CUISINE", "REORDER"] as const;

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}
function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}
function actorEmail(req: FastifyRequest): string {
  const h = req.headers["x-actor-email"];
  if (typeof h === "string" && h.includes("@")) return h;
  const e = (req.auth as { email?: string } | undefined)?.email;
  return e && e.includes("@") ? e : "super_admin";
}

const signalWeights = z.object({
  distance: z.number(), deliverySpeed: z.number(), rating: z.number(),
  etaReliability: z.number(), kptReliability: z.number(), velocity: z.number(), availability: z.number(),
});
const penaltyCaps = z.object({ cancellation: z.number(), refund: z.number(), complaint: z.number(), oos: z.number() });
const boostCaps = z.object({ subscription: z.number(), newMerchant: z.number(), admin: z.number() });
const references = z.object({
  distanceRefKm: z.number().positive(), etaFastMin: z.number().positive(), etaSlowMin: z.number().positive(),
  ratingPriorMean: z.number().min(0).max(5), ratingMinVotes: z.number().min(0),
  velocityRefOrders: z.number().positive(),
  penaltyRateRef: z.object({ cancellation: z.number().positive(), refund: z.number().positive(), complaint: z.number().positive(), oos: z.number().positive() }),
});
const configUpdateSchema = z.object({
  profile: z.enum(PROFILES),
  enabled: z.boolean(),
  weights: signalWeights,
  offerWeight: z.number().min(0),
  penaltyCaps,
  boostCaps,
  references,
  minSample: z.number().int().min(0),
  subscriptionPlanBoosts: z.record(z.string(), z.number().min(0)),
});

const previewSchema = z.object({
  lat: z.number(), lng: z.number(),
  profile: z.enum(PROFILES).default("HOME_FOOD"),
  limit: z.number().int().min(1).max(50).default(15),
  configOverride: configUpdateSchema.partial().optional(),
});

const MAX_RADIUS_KM = 15;

function storedToConfigDto(profile: RankingProfile, s: Awaited<ReturnType<typeof loadStoredRankingConfig>>) {
  const c = s.config;
  return {
    profile,
    enabled: c.enabled,
    version: c.version,
    revision: s.revision,
    weights: c.weights,
    offerWeight: c.offerWeight,
    penaltyCaps: c.penaltyCaps,
    boostCaps: c.boostCaps,
    references: c.references,
    minSample: c.minSample,
    subscriptionPlanBoosts: s.subscriptionPlanBoosts,
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt,
  };
}

export const storeRankingAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    admin.get("/config", async (req) => {
      const profile = (((req.query as { profile?: string })?.profile ?? "HOME_FOOD") as RankingProfile);
      const p = PROFILES.includes(profile) ? profile : "HOME_FOOD";
      const stored = await loadStoredRankingConfig(p, { fresh: true });
      return { success: true, config: storedToConfigDto(p, stored) };
    });

    admin.put("/config", async (req, reply) => {
      const body = configUpdateSchema.parse(req.body ?? {});
      const { profile, ...rest } = body;
      try {
        const stored = await saveRankingConfig(profile, rest as RankingConfigUpdate, actorEmail(req));
        return { success: true, config: storedToConfigDto(profile, stored) };
      } catch (e) {
        const err = e as Error;
        return reply.code(400).send({ success: false, error: "invalid_config", message: err.message });
      }
    });

    admin.get("/history", async (req) => {
      const profile = (((req.query as { profile?: string })?.profile ?? "HOME_FOOD") as RankingProfile);
      const sql = getSql();
      const rows = (await sql`
        SELECT id, revision, enabled, version, updated_by, created_at
        FROM store_ranking_config_history WHERE profile = ${profile}
        ORDER BY created_at DESC, id DESC LIMIT 100
      `) as unknown as Array<{ id: number; revision: number; enabled: boolean; version: string; updated_by: string | null; created_at: string | Date }>;
      return {
        success: true,
        items: rows.map((r) => ({
          id: Number(r.id), revision: Number(r.revision), enabled: r.enabled === true, version: r.version,
          updatedBy: r.updated_by ?? null,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
      };
    });

    admin.post("/preview", async (req, reply) => {
      const body = previewSchema.parse(req.body ?? {});
      if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
        return reply.code(400).send({ success: false, error: "invalid_location" });
      }
      const stored = await loadStoredRankingConfig(body.profile, { fresh: true });
      // Preview always evaluates as-if-enabled so admins can see ordering before turning it on.
      const base = defaultConfigForProfile(body.profile);
      const o = body.configOverride;
      const cfg: RankingConfig = {
        ...stored.config,
        enabled: true,
        weights: { ...stored.config.weights, ...(o?.weights ?? {}) },
        offerWeight: o?.offerWeight ?? stored.config.offerWeight,
        penaltyCaps: { ...stored.config.penaltyCaps, ...(o?.penaltyCaps ?? {}) },
        boostCaps: { ...stored.config.boostCaps, ...(o?.boostCaps ?? {}) },
        references: { ...stored.config.references, ...(o?.references ?? {}) },
        minSample: o?.minSample ?? stored.config.minSample,
      };
      const planBoosts = o?.subscriptionPlanBoosts ?? stored.subscriptionPlanBoosts;

      // Candidate FOOD stores near the point (bbox + haversine; radius-gated). Preview uses
      // haversine distance (no Mapbox) — good enough to see ordering.
      const sql = getSql();
      const latDelta = MAX_RADIUS_KM / 111;
      const lngDelta = MAX_RADIUS_KM / (111 * Math.max(0.2, Math.cos((body.lat * Math.PI) / 180)));
      // Match the live food page's store-type set (RESTAURANT/CLOUD_KITCHEN/BAKERY/CAFE/FOOD).
      const foodTypes = customerListStoreTypesForSql("FOOD") ?? ["RESTAURANT"];
      const rows = (await sql`
        SELECT id, store_name, delivery_radius_km::float8 AS radius,
               (6371 * acos(least(1, greatest(-1,
                 cos(radians(${body.lat})) * cos(radians(latitude)) *
                 cos(radians(longitude) - radians(${body.lng})) +
                 sin(radians(${body.lat})) * sin(radians(latitude))
               )))) AS dist_km
        FROM merchant_stores
        WHERE status = 'ACTIVE' AND is_active = true
          AND upper(trim(store_type::text)) = ANY(${foodTypes}::text[])
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND latitude BETWEEN ${body.lat - latDelta} AND ${body.lat + latDelta}
          AND longitude BETWEEN ${body.lng - lngDelta} AND ${body.lng + lngDelta}
        ORDER BY dist_km ASC
        LIMIT 60
      `) as unknown as Array<{ id: number; store_name: string; radius: number | null; dist_km: number }>;

      const eligible = rows.filter((r) => {
        const eff = Math.min(MAX_RADIUS_KM, Number(r.radius) > 0 ? Number(r.radius) : MAX_RADIUS_KM);
        return Number(r.dist_km) <= eff;
      }).slice(0, 40);

      const ids = eligible.map((r) => Number(r.id)).filter((n) => n > 0);
      const [metrics, subBoosts] = await Promise.all([
        loadRankingMetricsForStores(ids),
        loadActiveSubscriptionBoosts(ids, planBoosts),
      ]);
      const nameById = new Map(eligible.map((r) => [Number(r.id), r.store_name]));
      const distById = new Map(eligible.map((r) => [Number(r.id), Number(r.dist_km)]));
      const features: StoreFeatures[] = eligible.map((r) => ({
        storeId: Number(r.id),
        roadDistanceKm: Number(r.dist_km),
        availabilityFraction: 1,
        oosRate: 0,
        subscriptionBoostRaw: subBoosts.get(Number(r.id)) ?? 0,
        ...metricsToHistoricalFeatures(metrics.get(Number(r.id))),
      }));
      const ranked = rankStores(features, cfg);
      return {
        success: true,
        version: cfg.version,
        rankingVersion: base.version,
        candidateCount: eligible.length,
        results: ranked.slice(0, body.limit).map((r, i) => ({
          rank: i + 1,
          storeId: r.storeId,
          storeName: nameById.get(r.storeId) ?? null,
          score: r.score,
          reliability: r.reliability,
          distanceKm: Math.round((distById.get(r.storeId) ?? 0) * 100) / 100,
          etaMin: r.etaMin,
          breakdown: r.breakdown,
          subscriptionBoosted: (subBoosts.get(r.storeId) ?? 0) > 0,
        })),
      };
    });
  });
};
