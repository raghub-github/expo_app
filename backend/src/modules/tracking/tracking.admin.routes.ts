/**
 * Control Dashboard — tracking timeline + geo-engine violations review.
 * Admin-gated (JWT admin-like role OR X-Internal-Secret dashboard proxy),
 * matching tracking-config.admin.routes.
 *
 *   GET   /order/:orderId/timeline   — sessions + recent events + open
 *                                      violations + latest position for one order
 *   GET   /violations                — review queue (filter by status/type/rider)
 *   PATCH /violations/:id            — reviewed | penalized | dismissed
 *
 * Registered under /v1/admin/tracking in index.ts.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import {
  orderRiderTracking,
  trackingEvents,
  trackingSessions,
  trackingViolations,
} from "../../db/schema.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}
function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().INTERNAL_API_TOKEN;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d != null ? String(d) : null);
const nnum = (v: unknown) => (v == null ? null : Number(v));

export const trackingAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    // ── Order tracking timeline ─────────────────────────────────────────
    admin.get("/order/:orderId/timeline", async (req) => {
      const { orderId } = req.params as { orderId: string };
      const db = getDb();

      const sessions = await db
        .select()
        .from(trackingSessions)
        .where(eq(trackingSessions.orderId, orderId))
        .orderBy(desc(trackingSessions.startedAt))
        .limit(20);

      const events = await db
        .select()
        .from(trackingEvents)
        .where(eq(trackingEvents.orderId, orderId))
        .orderBy(desc(trackingEvents.createdAt))
        .limit(100);

      const violations = await db
        .select()
        .from(trackingViolations)
        .where(eq(trackingViolations.orderId, orderId))
        .orderBy(desc(trackingViolations.createdAt))
        .limit(50);

      const [latest] = await db
        .select()
        .from(orderRiderTracking)
        .where(eq(orderRiderTracking.orderId, orderId))
        .orderBy(desc(orderRiderTracking.createdAt))
        .limit(1);

      return {
        orderId,
        latest: latest
          ? {
              riderId: latest.riderId,
              latitude: nnum(latest.latitude),
              longitude: nnum(latest.longitude),
              headingDegrees: nnum(latest.headingDegrees),
              speedKmh: nnum(latest.speedKmh),
              accuracyMeters: nnum(latest.accuracyMeters),
              sessionId: latest.sessionId ?? null,
              sequenceNumber: latest.sequenceNumber ?? null,
              at: iso(latest.createdAt),
            }
          : null,
        sessions: sessions.map((s) => ({
          id: s.id,
          riderId: s.riderId,
          assignmentId: s.assignmentId ?? null,
          serviceType: s.serviceType,
          status: s.status,
          stopReason: s.stopReason ?? null,
          coordinateCount: s.coordinateCount,
          startedAt: iso(s.startedAt),
          endedAt: iso(s.endedAt),
        })),
        events: events.map((e) => ({
          id: e.id,
          sessionId: e.sessionId ?? null,
          riderId: e.riderId ?? null,
          eventType: e.eventType,
          milestoneKey: e.milestoneKey ?? null,
          severity: e.severity,
          latitude: nnum(e.latitude),
          longitude: nnum(e.longitude),
          distanceM: e.distanceM ?? null,
          radiusM: e.radiusM ?? null,
          message: e.message ?? null,
          at: iso(e.createdAt),
        })),
        violations: violations.map((v) => ({
          id: v.id,
          sessionId: v.sessionId ?? null,
          riderId: v.riderId ?? null,
          violationType: v.violationType,
          level: v.level,
          status: v.status,
          distanceM: v.distanceM ?? null,
          durationSeconds: v.durationSeconds ?? null,
          message: v.message ?? null,
          at: iso(v.createdAt),
        })),
      };
    });

    // ── Violations review queue ─────────────────────────────────────────
    const listQuery = z.object({
      status: z.enum(["open", "reviewed", "penalized", "dismissed"]).optional(),
      type: z.enum(["long_stop", "route_deviation", "opposite_direction"]).optional(),
      riderId: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    });

    admin.get("/violations", async (req) => {
      const q = listQuery.parse(req.query ?? {});
      const db = getDb();
      const conds = [];
      if (q.status) conds.push(eq(trackingViolations.status, q.status));
      if (q.type) conds.push(eq(trackingViolations.violationType, q.type));
      if (q.riderId) conds.push(eq(trackingViolations.riderId, q.riderId));
      const rows = await db
        .select()
        .from(trackingViolations)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(trackingViolations.createdAt))
        .limit(q.limit ?? 100);
      return {
        items: rows.map((v) => ({
          id: v.id,
          orderId: v.orderId,
          riderId: v.riderId ?? null,
          sessionId: v.sessionId ?? null,
          serviceType: v.serviceType ?? null,
          violationType: v.violationType,
          level: v.level,
          status: v.status,
          distanceM: v.distanceM ?? null,
          durationSeconds: v.durationSeconds ?? null,
          message: v.message ?? null,
          at: iso(v.createdAt),
        })),
      };
    });

    const patchBody = z.object({
      status: z.enum(["reviewed", "penalized", "dismissed"]),
      note: z.string().max(500).optional(),
    });

    admin.patch("/violations/:id", async (req, reply) => {
      const { id } = req.params as { id: string };
      const violationId = Number(id);
      if (!Number.isFinite(violationId)) {
        return reply.code(400).send({ error: "invalid_id" });
      }
      const body = patchBody.parse(req.body ?? {});
      const actor = internalSecretGrantsAdmin(req) ? "dashboard" : (req.auth?.sub ?? "admin");
      const db = getDb();
      // Modular boundary: this records the admin decision. Actual wallet
      // penalty execution stays with the existing penalty engine — flipping to
      // 'penalized' marks it for that flow rather than deducting here.
      const [row] = await db
        .update(trackingViolations)
        .set({
          status: body.status,
          metadata: { reviewedBy: actor, note: body.note ?? null, reviewedAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(trackingViolations.id, violationId))
        .returning({ id: trackingViolations.id, status: trackingViolations.status });
      if (!row) return reply.code(404).send({ error: "not_found" });
      return { id: row.id, status: row.status };
    });
  });
};
