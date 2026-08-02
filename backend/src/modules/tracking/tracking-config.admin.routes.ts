/**
 * Super Admin routes for the real-time tracking + geo-scoping engine config
 * (tracking_config, single row). Mirrors the auth pattern of
 * rideWalletConfig.admin.routes / merchant-subscription.admin.routes:
 *   1. JWT with admin / super_admin / manager / support role, OR
 *   2. X-Internal-Secret matching INTERNAL_API_TOKEN (Next.js dashboard proxy).
 *
 * Registered under /v1/admin/tracking-config in index.ts.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import {
  getTrackingConfig,
  updateTrackingConfig,
  TRACKING_INTERVAL_OPTIONS,
  type TrackingConfig,
} from "../../lib/tracking-config.service.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const posInt = z.number().int().positive().max(1_000_000);

const configSchema = z.object({
  trackingIntervalSeconds: posInt,
  gpsAccuracyThresholdM: posInt,
  speedThresholdKmh: posInt,
  etaRefreshSeconds: posInt,
  movementThresholdM: posInt,
  stationaryTimeoutSeconds: posInt,
  deviationDistanceM: posInt,
  wrongDirectionThresholdM: posInt,
  enableStationaryRule: z.boolean(),
  enableDeviationRule: z.boolean(),
  enableWrongDirectionRule: z.boolean(),
});

// Partial for updates — admin may change any subset.
const updateBodySchema = configSchema.partial();

const responseSchema = configSchema.extend({
  intervalOptions: z.array(z.number()),
});

function withOptions(cfg: TrackingConfig) {
  return { ...cfg, intervalOptions: [...TRACKING_INTERVAL_OPTIONS] };
}

export const trackingConfigAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    admin.get(
      "/",
      { schema: { response: { 200: responseSchema, 403: z.object({ error: z.string() }) } } },
      async () => withOptions(await getTrackingConfig(true))
    );

    admin.put(
      "/",
      {
        schema: {
          body: updateBodySchema,
          response: {
            200: responseSchema,
            400: z.object({ error: z.string(), message: z.string().optional() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const body = updateBodySchema.parse(req.body ?? {});
        try {
          const updatedBy = internalSecretGrantsAdmin(req)
            ? "dashboard"
            : (req.auth?.sub ?? "admin");
          const cfg = await updateTrackingConfig(body, updatedBy);
          return withOptions(cfg);
        } catch (e) {
          const err = e as Error;
          return reply.code(400).send({ error: "invalid_config", message: err.message });
        }
      }
    );
  });
};
