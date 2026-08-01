/**
 * Prevent Services HTTP API
 *
 * Public:
 *   POST /v1/prevent-services/check
 *
 * Admin (X-Internal-Secret or admin JWT):
 *   GET    /v1/prevent-services
 *   POST   /v1/prevent-services
 *   PUT    /v1/prevent-services/:id
 *   PATCH  /v1/prevent-services/:id/pause
 *   PATCH  /v1/prevent-services/:id/resume
 *   DELETE /v1/prevent-services/:id
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { getEnv } from "../../config/env.js";
import { auth } from "../../plugins/auth.js";
import {
  checkPreventServicesAtPoint,
  countImpactForRule,
  evaluateRiderPreventImpact,
  evaluateStorePreventImpact,
  getPreventSignalVersion,
  PREVENT_SERVICE_CODES,
  PREVENT_SERVICE_USER_MESSAGE,
} from "./preventServices.engine.js";
import { getSql } from "../../db/client.js";
import {
  createPreventServiceRule,
  deletePreventServiceRule,
  getPreventServiceRule,
  listPreventServiceRules,
  pausePreventServiceRule,
  resumePreventServiceRule,
  updatePreventServiceRule,
} from "./preventServices.admin.js";

const serviceCodeSchema = z.enum(PREVENT_SERVICE_CODES);

const upsertSchema = z.object({
  searchType: z.enum(["flat_search", "lat_lng"]),
  placeId: z.string().max(256).optional().nullable(),
  locationName: z.string().min(1).max(240),
  address: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(100_000),
  blockedServices: z.array(serviceCodeSchema).min(1),
  reason: z.string().max(120).optional().nullable(),
  reasonCustom: z.string().max(500).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.enum(["active", "paused"]).optional(),
  adminId: z.string().uuid().optional().nullable(),
  adminName: z.string().max(160).optional().nullable(),
});

const checkSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  service: z.string().min(1).max(40).optional().nullable(),
  /** Optional second point (ride drop). */
  lat2: z.number().min(-90).max(90).optional().nullable(),
  lng2: z.number().min(-180).max(180).optional().nullable(),
});

function internalSecretOk(req: FastifyRequest): boolean {
  const env = getEnv();
  const secret =
    env.INTERNAL_API_TOKEN ||
    process.env.BACKEND_SCHEDULE_TICK_SECRET ||
    "";
  if (!secret) return false;
  const header = String(req.headers["x-internal-secret"] ?? "");
  return header.length > 0 && header === secret;
}

function adminActor(req: FastifyRequest): { adminId: string | null; adminName: string | null } {
  const body = (req.body ?? {}) as { adminId?: string; adminName?: string };
  const authUser = (req as FastifyRequest & {
    auth?: { sub?: string; email?: string; name?: string; role?: string };
  }).auth;
  return {
    adminId: body.adminId ?? authUser?.sub ?? null,
    adminName: body.adminName ?? authUser?.name ?? authUser?.email ?? null,
  };
}

function statusFromErr(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    const n = Number((err as { statusCode?: unknown }).statusCode);
    if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  }
  return 500;
}

export async function preventServicesRoutes(app: FastifyInstance) {
  /** Runtime validation — used by all client apps. */
  app.post("/prevent-services/check", async (request, reply) => {
    const parsed = checkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { lat, lng, service, lat2, lng2 } = parsed.data;
    const primary = await checkPreventServicesAtPoint({ lat, lng, service });
    let secondary = null as Awaited<ReturnType<typeof checkPreventServicesAtPoint>> | null;
    if (lat2 != null && lng2 != null) {
      secondary = await checkPreventServicesAtPoint({ lat: lat2, lng: lng2, service });
    }
    const blocked = primary.blocked || (secondary?.blocked ?? false);
    const nearest = primary.nearest ?? secondary?.nearest ?? null;
    const blockedServices = [
      ...new Set([
        ...primary.blockedServices,
        ...(secondary?.blockedServices ?? []),
      ]),
    ];
    return reply.send({
      ok: true,
      blocked,
      blockedServices,
      nearest,
      matches: [...primary.matches, ...(secondary?.matches ?? [])],
      code: blocked ? primary.code ?? secondary?.code : null,
      message: blocked
        ? primary.message ?? secondary?.message ?? PREVENT_SERVICE_USER_MESSAGE
        : null,
      title: blocked ? "Service Temporarily Unavailable" : null,
    });
  });

  /** Public signal version — clients use this for once-per-event modal keys. */
  app.get("/prevent-services/signal", async (_req, reply) => {
    const version = await getPreventSignalVersion();
    return reply.send({ ok: true, version });
  });

  /**
   * Store impact — area overlap only. Never means "store offline".
   * Query: storeId (numeric PK or public store_id) OR lat+lng (+ optional deliveryRadiusKm, storeType).
   */
  app.get("/prevent-services/impact/store", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const storeIdRaw = (q.storeId ?? "").trim();
    const storeIdNum = storeIdRaw ? Number(storeIdRaw) : NaN;
    let storeLat = q.lat != null ? Number(q.lat) : null;
    let storeLng = q.lng != null ? Number(q.lng) : null;
    let deliveryRadiusKm = q.deliveryRadiusKm != null ? Number(q.deliveryRadiusKm) : null;
    let storeType = q.storeType ?? null;

    if (storeIdRaw) {
      try {
        const sql = getSql();
        const [row] =
          Number.isFinite(storeIdNum) && storeIdNum > 0
            ? await sql<
                Array<{
                  latitude: number | null;
                  longitude: number | null;
                  delivery_radius_km: number | null;
                  store_type: string | null;
                }>
              >`
                SELECT latitude, longitude, delivery_radius_km, store_type
                FROM merchant_stores
                WHERE id = ${storeIdNum}
                LIMIT 1
              `
            : await sql<
                Array<{
                  latitude: number | null;
                  longitude: number | null;
                  delivery_radius_km: number | null;
                  store_type: string | null;
                }>
              >`
                SELECT latitude, longitude, delivery_radius_km, store_type
                FROM merchant_stores
                WHERE store_id = ${storeIdRaw}
                LIMIT 1
              `;
        if (row) {
          storeLat = row.latitude != null ? Number(row.latitude) : storeLat;
          storeLng = row.longitude != null ? Number(row.longitude) : storeLng;
          if (deliveryRadiusKm == null && row.delivery_radius_km != null) {
            deliveryRadiusKm = Number(row.delivery_radius_km);
          }
          if (!storeType) storeType = row.store_type;
        }
      } catch {
        /* fall through with query coords */
      }
    }

    const impact = await evaluateStorePreventImpact({
      storeLat,
      storeLng,
      deliveryRadiusKm,
      storeType,
    });
    return reply.send({ ok: true, ...impact });
  });

  /** Rider impact — advisory only; does not change duty. */
  app.get("/prevent-services/impact/rider", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const lat = q.lat != null ? Number(q.lat) : null;
    const lng = q.lng != null ? Number(q.lng) : null;
    const impact = await evaluateRiderPreventImpact({ lat, lng });
    return reply.send({ ok: true, ...impact });
  });

  /** Admin CRUD — internal secret (dashboard) or authenticated admin JWT. */
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });

    admin.addHook("preHandler", async (req, reply) => {
      if (internalSecretOk(req)) return;
      const role = (req as FastifyRequest & { auth?: { role?: string } }).auth?.role;
      if (role === "admin" || role === "super_admin" || role === "system") return;
      return reply.code(401).send({ error: "unauthorized" });
    });

    admin.get("/prevent-services", async (req, reply) => {
      try {
        const q = req.query as { status?: string; withImpact?: string };
        const status =
          q.status === "active" ||
          q.status === "paused" ||
          q.status === "expired" ||
          q.status === "deleted"
            ? q.status
            : "all";
        const rules = await listPreventServiceRules({ status });
        const signalVersion = await getPreventSignalVersion();
        let enriched = rules;
        if (q.withImpact === "1" || q.withImpact === "true") {
          enriched = await Promise.all(
            rules.map(async (rule) => {
              if (rule.status !== "active") {
                return {
                  ...rule,
                  affectedMerchants: 0,
                  affectedRiders: 0,
                };
              }
              const impact = await countImpactForRule({
                latitude: rule.latitude,
                longitude: rule.longitude,
                radiusMeters: rule.radiusMeters,
                blockedServices: rule.blockedServices,
              });
              return {
                ...rule,
                affectedMerchants: impact.affectedMerchants,
                affectedRiders: impact.affectedRiders,
              };
            })
          );
        }
        return reply.send({ ok: true, rules: enriched, signalVersion });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "list_failed";
        if (/prevent_service_/i.test(msg)) {
          return reply.code(503).send({
            error: "migration_required",
            message: "Apply 0476_prevent_services.sql",
          });
        }
        return reply.code(500).send({ error: "list_failed", message: msg });
      }
    });

    admin.get<{ Params: { id: string } }>("/prevent-services/:id", async (req, reply) => {
      const rule = await getPreventServiceRule(req.params.id);
      if (!rule) return reply.code(404).send({ error: "not_found" });
      return reply.send({ ok: true, rule });
    });

    admin.post("/prevent-services", async (req, reply) => {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      try {
        const actor = adminActor(req);
        const rule = await createPreventServiceRule({
          ...parsed.data,
          adminId: actor.adminId,
          adminName: actor.adminName,
        });
        return reply.code(201).send({ ok: true, rule });
      } catch (e) {
        return reply.code(statusFromErr(e)).send({
          error: "create_failed",
          message: e instanceof Error ? e.message : "create_failed",
        });
      }
    });

    admin.put<{ Params: { id: string } }>("/prevent-services/:id", async (req, reply) => {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      try {
        const actor = adminActor(req);
        const rule = await updatePreventServiceRule(req.params.id, {
          ...parsed.data,
          adminId: actor.adminId,
          adminName: actor.adminName,
        });
        return reply.send({ ok: true, rule });
      } catch (e) {
        return reply.code(statusFromErr(e)).send({
          error: "update_failed",
          message: e instanceof Error ? e.message : "update_failed",
        });
      }
    });

    admin.patch<{ Params: { id: string } }>("/prevent-services/:id/pause", async (req, reply) => {
      try {
        const actor = adminActor(req);
        const body = (req.body ?? {}) as { reason?: string };
        const rule = await pausePreventServiceRule({
          id: req.params.id,
          adminId: actor.adminId,
          adminName: actor.adminName,
          reason: body.reason,
        });
        return reply.send({ ok: true, rule });
      } catch (e) {
        return reply.code(statusFromErr(e)).send({
          error: "pause_failed",
          message: e instanceof Error ? e.message : "pause_failed",
        });
      }
    });

    admin.patch<{ Params: { id: string } }>("/prevent-services/:id/resume", async (req, reply) => {
      try {
        const actor = adminActor(req);
        const body = (req.body ?? {}) as { reason?: string };
        const rule = await resumePreventServiceRule({
          id: req.params.id,
          adminId: actor.adminId,
          adminName: actor.adminName,
          reason: body.reason,
        });
        return reply.send({ ok: true, rule });
      } catch (e) {
        return reply.code(statusFromErr(e)).send({
          error: "resume_failed",
          message: e instanceof Error ? e.message : "resume_failed",
        });
      }
    });

    admin.delete<{ Params: { id: string } }>("/prevent-services/:id", async (req, reply) => {
      try {
        const actor = adminActor(req);
        const body = (req.body ?? {}) as { reason?: string };
        await deletePreventServiceRule({
          id: req.params.id,
          adminId: actor.adminId,
          adminName: actor.adminName,
          reason: body.reason,
        });
        return reply.send({ ok: true });
      } catch (e) {
        return reply.code(statusFromErr(e)).send({
          error: "delete_failed",
          message: e instanceof Error ? e.message : "delete_failed",
        });
      }
    });
  });
}
