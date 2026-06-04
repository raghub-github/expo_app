import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  RiderApprovalStatusSchema,
  RiderLocationPingResponseSchema,
  RiderLocationPingSchema,
  type RiderLocationPing,
} from "@gatimitra/contracts";

/** Full /me payload — keep in sync with RiderProfileSchema in @gatimitra/contracts. */
const RiderMeResponseSchema = z.object({
  riderId: z.string(),
  riderDisplayId: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  mobile: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  address: z.string().nullable(),
  preferredLanguage: z.string(),
  referralCode: z.string().nullable(),
  referredByDisplayId: z.string().nullable(),
  selfieUrl: z.string().nullable(),
  approvalStatus: RiderApprovalStatusSchema,
  accountStatus: z.string(),
  onboardingStatus: z.string(),
});
import { desc, eq, and, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { auth } from "../../plugins/auth.js";
import { getDb, getSql } from "../../db/client.js";
import { deactivateRiderDeviceSessions } from "../../lib/rider-app-session.js";
import {
  riderLocationEvents,
  riders,
  riderDocuments,
  riderDocumentFiles,
  blacklistHistory,
  dutyLogs,
  riderLogoutEvents,
  riderLiveLocations,
  riderLocationHistory,
  orderRiderTracking,
  ordersCore,
} from "../../db/schema.js";
import { RiderLogoutBodySchema } from "../../lib/rider-logout-reasons.js";
import { scoreLocationPing, type LocationPoint } from "./fraud.js";
import { getR2SignedUrl, deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";
import { attachmentsProxyUrlFromKey } from "../../utils/attachments-proxy-url.js";
import {
  collectDocumentR2Keys,
  deleteReplacedR2Keys,
} from "../../lib/rider-document-r2-keys.js";
import { getRiderOnboardingProgress } from "../../lib/rider-onboarding-progress.js";
import { getEnv } from "../../config/env.js";
import { finalizeMerchantOrderDelivered } from "../../lib/merchant-order-delivered-wallet.js";
import { unassignFoodRiderAndRestartDispatch } from "../../lib/food-rider-unassign.service.js";
import { registerRiderSubscriptionRoutes } from "./rider-subscription.routes.js";
import { speedMpsToKmh, upsertRiderLiveLocation } from "../../lib/rider-live-location.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

export async function riderRoutes(app: FastifyInstance) {
  // All rider endpoints require rider auth (later: enforce role claim).
  await app.register(auth, { required: true });

  registerRiderSubscriptionRoutes(app);

  app.post(
    "/logout",
    {
      schema: {
        body: RiderLogoutBodySchema,
        response: {
          200: z.object({ success: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const riderId = parseRiderIdFromAuth(userId);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }

      const body = RiderLogoutBodySchema.parse(req.body);
      if (body.reasonCode === "OTHER" && !body.reasonText?.trim()) {
        return reply.status(400).send({ error: "reason_text_required" });
      }

      const db = getDb();
      const sql = getSql();
      const deviceId = req.auth?.device_id ?? null;

      await db.insert(riderLogoutEvents).values({
        id: `rlogout_${ulid()}`,
        riderId,
        userId,
        deviceId,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText?.trim() || null,
      });

      try {
        await deactivateRiderDeviceSessions(sql, { userId, deviceId });
      } catch (sessErr) {
        req.log?.error?.({ err: sessErr, riderId }, "Rider logout: device session deactivate failed");
      }

      return { success: true as const };
    },
  );

  app.post(
    "/location/ping",
    {
      schema: {
        body: RiderLocationPingSchema,
        response: { 200: RiderLocationPingResponseSchema },
      },
    },
    async (req) => {
      const userId = req.auth!.sub;
      const tokenDeviceId = req.auth?.device_id ?? null;

      const body = RiderLocationPingSchema.parse(req.body) as RiderLocationPing;
      const deviceId = body.deviceId ?? tokenDeviceId ?? "unknown_device";

      const db = getDb();

      const prevRow = await db
        .select()
        .from(riderLocationEvents)
        .where(and(eq(riderLocationEvents.userId, userId), eq(riderLocationEvents.deviceId, deviceId)))
        .orderBy(desc(riderLocationEvents.tsMs))
        .limit(1);

      const prev: LocationPoint | null = prevRow.length
        ? {
            tsMs: prevRow[0]!.tsMs,
            lat: prevRow[0]!.lat,
            lng: prevRow[0]!.lng,
            accuracyM: prevRow[0]!.accuracyM ?? null,
            speedMps: prevRow[0]!.speedMps ?? null,
            headingDeg: prevRow[0]!.headingDeg ?? null,
            mocked: prevRow[0]!.mocked ?? null,
          }
        : null;

      const curr: LocationPoint = {
        tsMs: body.tsMs,
        lat: body.lat,
        lng: body.lng,
        accuracyM: body.accuracyM ?? null,
        speedMps: body.speedMps ?? null,
        headingDeg: body.headingDeg ?? null,
        mocked: body.mocked ?? null,
      };

      const { fraudSignals, fraudScore, meta } = scoreLocationPing({
        prev,
        curr,
        tokenDeviceId,
        bodyDeviceId: body.deviceId ?? null,
        gpsEnabled: null,
      });

      await db.insert(riderLocationEvents).values({
        id: `rloc_${ulid()}`,
        userId: userId,
        deviceId: deviceId,
        tsMs: body.tsMs,
        lat: body.lat,
        lng: body.lng,
        accuracyM: body.accuracyM ?? null,
        altitudeM: body.altitudeM ?? null,
        speedMps: body.speedMps ?? null,
        headingDeg: body.headingDeg ?? null,
        mocked: body.mocked ?? false,
        provider: body.provider ?? "unknown",
        fraudScore: fraudScore,
        fraudSignals: fraudSignals,
        meta,
      });

      const riderId = parseRiderIdFromAuth(userId);
      if (riderId != null) {
        await upsertRiderLiveLocation(db, {
          riderId,
          lat: body.lat,
          lng: body.lng,
          speedKmh: speedMpsToKmh(body.speedMps),
          heading: body.headingDeg ?? null,
          accuracyMeters: body.accuracyM ?? null,
        });

        const [activeRide] = await db
          .select({ orderId: ordersCore.orderId })
          .from(ordersCore)
          .where(
            and(
              eq(ordersCore.riderId, riderId),
              eq(ordersCore.orderType, "person_ride"),
              inArray(ordersCore.status, [
                "accepted",
                "reached_store",
                "reached_user",
                "picked_up",
                "in_transit",
              ])
            )
          )
          .orderBy(desc(ordersCore.updatedAt))
          .limit(1);

        const activeOrderId = activeRide?.orderId?.trim();
        if (activeOrderId) {
          const now = new Date();
          await db.insert(orderRiderTracking).values({
            orderId: activeOrderId,
            orderSource: "orders_core",
            riderId,
            latitude: String(body.lat),
            longitude: String(body.lng),
            headingDegrees: body.headingDeg != null ? String(body.headingDeg) : null,
            speedKmh: body.speedMps != null ? String(speedMpsToKmh(body.speedMps)) : null,
            accuracyMeters: body.accuracyM != null ? String(body.accuracyM) : null,
            createdAt: now,
          });
        }
      }

      return {
        accepted: true,
        serverTsMs: Date.now(),
        fraudSignals,
        fraudScore,
      };
    },
  );

  // Level-2: Live rider location update — UPSERT rider_live_locations, append order_rider_tracking + history
  app.post(
    "/location/update",
    {
      schema: {
        body: z.object({
          lat: z.number(),
          lng: z.number(),
          order_id: z.string().optional(),
          speed: z.number().optional(),
          heading: z.number().optional(),
          accuracy: z.number().optional(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const riderIdMatch = String(userId).match(/usr_(\d+)/);
      const riderId = riderIdMatch ? parseInt(riderIdMatch[1]!, 10) : null;
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }

      const body = req.body as { lat: number; lng: number; order_id?: string; speed?: number; heading?: number; accuracy?: number };
      const db = getDb();
      const now = new Date();

      await upsertRiderLiveLocation(db, {
        riderId,
        lat: body.lat,
        lng: body.lng,
        speedKmh: body.speed ?? null,
        heading: body.heading ?? null,
        accuracyMeters: body.accuracy ?? null,
        updatedAt: now,
      });

      if (body.order_id) {
        const useAssignmentV2 = getEnv().OMS_RIDER_ASSIGNMENT_V2;
        if (useAssignmentV2) {
        const active = await db.execute(sql`
          SELECT rider_id
          FROM order_rider_assignments_current
          WHERE order_id = ${body.order_id}
          LIMIT 1
        `) as unknown as Array<{ rider_id: number }>;
        if (!active[0] || Number(active[0].rider_id) !== riderId) {
          return reply.status(403).send({ error: "Rider is not active on this order" });
        }
        }
        await db.insert(orderRiderTracking).values({
          orderId: body.order_id,
          orderSource: "orders_core",
          riderId,
          latitude: String(body.lat),
          longitude: String(body.lng),
          headingDegrees: body.heading != null ? String(body.heading) : null,
          speedKmh: body.speed != null ? String(body.speed) : null,
          accuracyMeters: body.accuracy != null ? String(body.accuracy) : null,
          createdAt: now,
        });
      }

      await db.insert(riderLocationHistory).values({
        riderId,
        orderId: body.order_id ?? null,
        latitude: String(body.lat),
        longitude: String(body.lng),
        speedKmh: body.speed != null ? String(body.speed) : null,
        heading: body.heading != null ? String(body.heading) : null,
        accuracyMeters: body.accuracy != null ? String(body.accuracy) : null,
        recordedAt: now,
      });

      return { ok: true as const };
    },
  );

  if (getEnv().OMS_RIDER_ASSIGNMENT_V2) app.post(
    "/assignments/event",
    {
      schema: {
        body: z.object({
          order_id: z.string().min(1),
          rider_id: z.number().int().positive().nullable().optional(),
          event_type: z.enum(["assigned", "reassigned", "accepted", "rejected", "unassigned", "completed"]),
          idempotency_key: z.string().min(6),
          actor_type: z.string().default("system"),
          actor_id: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
        response: {
          200: z.object({ ok: z.literal(true), eventId: z.string() }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const db = getDb();
      const body = req.body as {
        order_id: string;
        rider_id?: number | null;
        event_type: "assigned" | "reassigned" | "accepted" | "rejected" | "unassigned" | "completed";
        idempotency_key: string;
        actor_type?: string;
        actor_id?: string;
        metadata?: Record<string, unknown>;
      };
      const eventId = `rae_${ulid()}`;
      const now = new Date();

      if (
        (body.event_type === "unassigned" || body.event_type === "rejected") &&
        body.rider_id
      ) {
        const [foodOrder] = await db
          .select({
            id: ordersCore.id,
            orderType: ordersCore.orderType,
            riderId: ordersCore.riderId,
          })
          .from(ordersCore)
          .where(eq(ordersCore.orderId, body.order_id))
          .limit(1);

        if (
          foodOrder?.orderType === "food" &&
          foodOrder.riderId === body.rider_id
        ) {
          try {
            await unassignFoodRiderAndRestartDispatch({
              orderCorePk: foodOrder.id,
              orderIdText: body.order_id,
              riderId: body.rider_id,
              reasonCode:
                typeof body.metadata?.reason_code === "string"
                  ? body.metadata.reason_code
                  : body.event_type.toUpperCase(),
              reasonText:
                typeof body.metadata?.reason_text === "string"
                  ? body.metadata.reason_text
                  : null,
              removedBy: body.actor_id ?? null,
              actorType: body.actor_type ?? "system",
              actorId: body.actor_id ?? null,
            });
          } catch (e) {
            return reply.status(400).send({
              error: e instanceof Error ? e.message : "Failed to unassign food rider",
            });
          }
          return { ok: true as const, eventId };
        }
      }

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            INSERT INTO order_rider_assignment_events (
              event_id, order_id, rider_id, event_type, actor_type, actor_id, idempotency_key, metadata, created_at
            )
            VALUES (
              ${eventId},
              ${body.order_id},
              ${body.rider_id ?? null},
              ${body.event_type},
              ${body.actor_type ?? "system"},
              ${body.actor_id ?? null},
              ${body.idempotency_key},
              ${JSON.stringify(body.metadata ?? {})}::jsonb,
              ${now}
            )
            ON CONFLICT (order_id, idempotency_key) DO NOTHING
          `);

          if (body.event_type === "assigned" || body.event_type === "reassigned" || body.event_type === "accepted") {
            if (!body.rider_id) throw new Error("rider_id is required for assignment event");
            await tx.execute(sql`
              INSERT INTO order_rider_assignments_current (order_id, rider_id, status, assigned_at, updated_at)
              VALUES (${body.order_id}, ${body.rider_id}, ${body.event_type}, ${now}, ${now})
              ON CONFLICT (order_id) DO UPDATE
              SET rider_id = EXCLUDED.rider_id, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
            `);
            await tx.execute(sql`
              UPDATE orders_core SET rider_id = ${body.rider_id}, updated_at = ${now}
              WHERE order_id = ${body.order_id}
            `);
          } else if (body.event_type === "unassigned" || body.event_type === "rejected" || body.event_type === "completed") {
            await tx.execute(sql`DELETE FROM order_rider_assignments_current WHERE order_id = ${body.order_id}`);
            if (body.event_type === "unassigned" || body.event_type === "rejected") {
              await tx.execute(sql`UPDATE orders_core SET rider_id = NULL, updated_at = ${now} WHERE order_id = ${body.order_id}`);
            }
          }

          await tx.execute(sql`
            INSERT INTO order_events (order_id, order_source, event_type, to_status, payload, actor_type, created_at)
            VALUES (
              ${body.order_id},
              'orders_core',
              ${`rider_${body.event_type}`},
              ${body.event_type},
              ${JSON.stringify({ rider_id: body.rider_id ?? null, assignment_event_id: eventId })}::jsonb,
              ${body.actor_type ?? "system"},
              ${now}
            )
          `);
        });

        if (body.event_type === "completed") {
          void finalizeMerchantOrderDelivered({
            orderIdText: body.order_id,
            previousStatus: "OUT_FOR_DELIVERY",
          }).catch((err) => {
            console.warn("[rider/assignments/event] merchant wallet credit failed:", err);
          });
        }

        if (
          (body.event_type === "unassigned" || body.event_type === "rejected") &&
          body.rider_id
        ) {
          const [coreRow] = await db
            .select({ id: ordersCore.id, orderType: ordersCore.orderType })
            .from(ordersCore)
            .where(eq(ordersCore.orderId, body.order_id))
            .limit(1);
          if (coreRow?.id && coreRow.orderType !== "food") {
            const { recordRiderDispatchExclusion } = await import(
              "../../lib/rider-dispatch-order-exclusion.js"
            );
            const reasonCode =
              typeof body.metadata?.reason_code === "string"
                ? body.metadata.reason_code
                : body.event_type.toUpperCase();
            const reasonText =
              typeof body.metadata?.reason_text === "string"
                ? body.metadata.reason_text
                : null;
            await recordRiderDispatchExclusion({
              orderCoreId: coreRow.id,
              orderId: body.order_id,
              riderId: body.rider_id,
              exclusionSource:
                body.event_type === "rejected" ? "admin_reject" : "admin_unassign",
              reasonCode,
              reasonText,
              actorType: body.actor_type ?? "system",
              actorId: body.actor_id ?? null,
              metadata: body.metadata ?? {},
            });
          }
        }
      } catch (e) {
        return reply.status(400).send({ error: e instanceof Error ? e.message : "Failed to record assignment event" });
      }
      return { ok: true as const, eventId };
    }
  );

  app.get(
    "/me",
    {
      schema: {
        response: { 200: RiderMeResponseSchema },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const riderId = parseRiderIdFromAuth(userId);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }

      const db = getDb();
      const sql = getSql();

      const { resolveRiderOnboardingStatusForApp } = await import(
        "../../lib/rider-onboarding-status.js"
      );
      const resolved = await resolveRiderOnboardingStatusForApp(riderId);
      if (!resolved) {
        return reply.status(404).send({ error: "Rider not found" });
      }

      const { rider, onboardingStatus, approvalStatus } = resolved;
      const { toAbsoluteClientMediaUrl } = await import("../../utils/publicAttachmentUrl.js");

      let referralCode = rider.referralCode?.trim() || null;
      if (!referralCode) {
        try {
          const [gen] = await sql<{ code: string }[]>`
            SELECT generate_unique_rider_referral_code() AS code
          `;
          const generated = gen?.code?.trim();
          if (generated) {
            referralCode = generated;
            await db
              .update(riders)
              .set({ referralCode: generated, updatedAt: new Date() })
              .where(eq(riders.id, riderId));
          }
        } catch (genErr) {
          req.log?.warn?.({ err: genErr, riderId }, "Could not auto-generate rider referral code");
        }
      }

      const mobile =
        rider.mobile?.trim() ||
        (typeof req.auth?.phone === "string" ? req.auth.phone.trim() : "") ||
        "";

      return {
        riderId: rider.id.toString(),
        riderDisplayId: `GMR${rider.id}`,
        userId,
        name: rider.name ?? null,
        mobile,
        city: rider.city ?? null,
        state: rider.state ?? null,
        pincode: rider.pincode ?? null,
        address: rider.address ?? null,
        preferredLanguage: rider.defaultLanguage ?? "en",
        referralCode,
        referredByDisplayId: rider.referredBy != null ? `GMR${rider.referredBy}` : null,
        selfieUrl: toAbsoluteClientMediaUrl(rider.selfieUrl),
        approvalStatus: approvalStatus as z.infer<typeof RiderApprovalStatusSchema>,
        accountStatus: rider.status,
        onboardingStatus,
      };
    },
  );

  app.get(
    "/me/documents",
    {
      schema: {
        response: {
          200: z.object({
            documents: z.array(
              z.object({
                docKey: z.string(),
                label: z.string(),
                icon: z.string(),
                required: z.boolean(),
                status: z.enum(["verified", "pending", "rejected", "not_uploaded"]),
                uploaded: z.boolean(),
                docNumber: z.string().nullable(),
                rejectedReason: z.string().nullable(),
                sides: z.array(
                  z.object({
                    side: z.string(),
                    label: z.string(),
                    status: z.enum(["verified", "pending", "rejected", "not_uploaded"]),
                    rejectedReason: z.string().nullable(),
                  }),
                ),
              }),
            ),
            verifiedCount: z.number().int(),
            uploadedCount: z.number().int(),
            totalCount: z.number().int(),
            kycCompleted: z.boolean(),
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }

      const { getRiderKycDocumentsForApp } = await import("../../lib/rider-documents-kyc-catalog.js");
      return getRiderKycDocumentsForApp(riderId);
    },
  );

  const EarningsSummarySchema = z.object({
    totalBalance: z.number(),
    withdrawable: z.number(),
    locked: z.number(),
    thisWeek: z.number(),
    thisMonth: z.number(),
    breakdown: z.object({
      food: z.number(),
      parcel: z.number(),
      ride: z.number(),
    }),
  });

  app.get(
    "/earnings/summary",
    {
      schema: {
        response: { 200: EarningsSummarySchema },
      },
    },
    async (req) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return {
          totalBalance: 0,
          withdrawable: 0,
          locked: 0,
          thisWeek: 0,
          thisMonth: 0,
          breakdown: { food: 0, parcel: 0, ride: 0 },
        };
      }
      const { riderWallet } = await import("../../db/schema.js");
      const db = getDb();
      const [wallet] = await db
        .select()
        .from(riderWallet)
        .where(eq(riderWallet.riderId, riderId))
        .limit(1);
      const total = wallet ? Number(wallet.totalBalance ?? 0) : 0;
      const food = wallet ? Number(wallet.earningsFood ?? 0) : 0;
      const parcel = wallet ? Number(wallet.earningsParcel ?? 0) : 0;
      const ride = wallet ? Number(wallet.earningsPersonRide ?? 0) : 0;
      return {
        totalBalance: total,
        withdrawable: Math.max(0, total),
        locked: 0,
        thisWeek: 0,
        thisMonth: 0,
        breakdown: { food, parcel, ride },
      };
    },
  );

  const RiderLedgerEntrySchema = z.object({
    id: z.number(),
    entryType: z.string(),
    flow: z.enum(["credit", "debit"]),
    category: z.string(),
    description: z.string(),
    amount: z.number(),
    balance: z.number().nullable(),
    ref: z.string().nullable(),
    refType: z.string().nullable(),
    serviceType: z.string().nullable(),
    createdAt: z.string(),
  });

  const RiderLedgerResponseSchema = z.object({
    entries: z.array(RiderLedgerEntrySchema),
    total: z.number(),
    hasMore: z.boolean(),
    periodLabel: z.string(),
  });

  app.get(
    "/wallet/ledger",
    {
      schema: {
        querystring: z.object({
          segment: z
            .enum(["all", "food", "parcel", "ride", "incentives", "adjustments", "penalties"])
            .default("all"),
          period: z.enum(["this_month", "last_month", "all"]).default("this_month"),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: RiderLedgerResponseSchema },
      },
    },
    async (req) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return { entries: [], total: 0, hasMore: false, periodLabel: "This month" };
      }

      const { segment, period, limit, offset } = req.query as {
        segment: "all" | "food" | "parcel" | "ride" | "incentives" | "adjustments" | "penalties";
        period: "this_month" | "last_month" | "all";
        limit: number;
        offset: number;
      };

      const { getRiderLedgerForApp } = await import("../../lib/rider-wallet-ledger-app.js");
      return getRiderLedgerForApp({ riderId, segment, period, limit, offset });
    },
  );

  const RiderVehicleDtoSchema = z.object({
    id: z.number().int(),
    vehicleType: z.string(),
    vehicleTypeLabel: z.string(),
    registrationNumber: z.string(),
    fuelType: z.string().nullable(),
    fuelTypeLabel: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    year: z.number().int().nullable(),
    color: z.string().nullable(),
    ownershipType: z.string().nullable(),
    registrationState: z.string().nullable(),
    verified: z.boolean(),
    isCommercial: z.boolean(),
    serviceTypes: z.array(z.string()),
    seatingCapacity: z.number().int().nullable(),
    acType: z.string().nullable(),
  });

  const RiderVehicleStatusSchema = z.object({
    hasVehicle: z.boolean(),
    isComplete: z.boolean(),
    vehicle: RiderVehicleDtoSchema.nullable(),
  });

  app.get(
    "/me/vehicle",
    {
      schema: {
        response: {
          200: RiderVehicleStatusSchema,
        },
      },
    },
    async (req) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return { hasVehicle: false, isComplete: false, vehicle: null };
      }
      const { getRiderVehicleStatusForApp } = await import("../../lib/rider-vehicle-app.js");
      return getRiderVehicleStatusForApp(riderId);
    },
  );

  app.put(
    "/me/vehicle",
    {
      schema: {
        body: z.object({
          vehicleType: z.string().min(1),
          registrationNumber: z.string().min(1),
          fuelType: z.string().nullable().optional(),
          make: z.string().nullable().optional(),
          model: z.string().nullable().optional(),
          year: z.number().int().nullable().optional(),
          color: z.string().nullable().optional(),
          ownershipType: z.string().nullable().optional(),
          registrationState: z.string().nullable().optional(),
          serviceTypes: z.array(z.string()).min(1),
          isCommercial: z.boolean(),
          seatingCapacity: z.number().int().nullable().optional(),
          acType: z.string().nullable().optional(),
        }),
        response: {
          200: RiderVehicleStatusSchema,
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { upsertRiderVehicleForApp, parseVehicleDbError } = await import(
        "../../lib/rider-vehicle-app.js"
      );
      try {
        return await upsertRiderVehicleForApp(riderId, req.body);
      } catch (e) {
        const message = e instanceof Error ? e.message : parseVehicleDbError(e);
        return reply.status(400).send({ error: message });
      }
    },
  );

  // Update duty status (go online/offline). When going online, blacklisted services are excluded so rider can only be online for required services.
  app.put(
    "/duty",
    {
      schema: {
        body: z.object({
          isOnDuty: z.boolean(),
          serviceTypes: z.array(z.enum(["food", "parcel", "person_ride"])).optional(),
        }),
        response: {
          200: z.object({
            isOnDuty: z.boolean(),
            allowedServiceTypes: z.array(z.string()),
            blockedServiceTypes: z.array(z.string()).optional(),
            lastUpdated: z.string(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const db = getDb();

      const riderIdMatch = userId.match(/usr_(\d+)/);
      if (!riderIdMatch) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const riderId = parseInt(riderIdMatch[1]!, 10);

      const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (!rider) {
        return reply.status(403).send({ error: "Rider not found" });
      }

      if (rider.status === "BLOCKED") {
        return reply.status(403).send({
          error: "You cannot go online. Your account is blocked (permanent blacklist).",
        });
      }

      const body = req.body as { isOnDuty: boolean; serviceTypes?: ("food" | "parcel" | "person_ride")[] };
      const isOnDuty = body.isOnDuty;
      const now = new Date();

      if (!isOnDuty) {
        await db.insert(dutyLogs).values({
          riderId,
          status: "OFF",
          serviceTypes: [],
        });
        return {
          isOnDuty: false,
          allowedServiceTypes: [],
          lastUpdated: now.toISOString(),
        };
      }

      const { getRiderVehicleStatusForApp } = await import("../../lib/rider-vehicle-app.js");
      const vehicleStatus = await getRiderVehicleStatusForApp(riderId);
      if (!vehicleStatus.isComplete) {
        return reply.status(403).send({
          error: "VEHICLE_DETAILS_REQUIRED",
          message: "Add your vehicle details before going online.",
        });
      }

      if (!vehicleStatus.vehicle?.verified) {
        return reply.status(403).send({
          error: "VEHICLE_NOT_VERIFIED",
          message:
            "Your vehicle is pending verification. You can go online after an admin verifies your vehicle.",
        });
      }

      const vehicleServices = (vehicleStatus.vehicle?.serviceTypes ?? []).filter(
        (s): s is "food" | "parcel" | "person_ride" =>
          s === "food" || s === "parcel" || s === "person_ride"
      );
      const requestedServices =
        body.serviceTypes?.length && body.serviceTypes.length > 0
          ? body.serviceTypes.filter((s) => vehicleServices.includes(s))
          : vehicleServices;

      if (requestedServices.length === 0) {
        return reply.status(403).send({
          error: "NO_VEHICLE_SERVICES",
          message: "Your vehicle is not enabled for any dispatch services.",
        });
      }

      const blacklistEntries = await db
        .select()
        .from(blacklistHistory)
        .where(and(eq(blacklistHistory.riderId, riderId), eq(blacklistHistory.banned, true)))
        .orderBy(desc(blacklistHistory.createdAt));

      const norm = (s: string) => {
        const x = (s || "").toLowerCase();
        return x === "ride" ? "person_ride" : x;
      };
      const isActiveBan = (entry: { isPermanent: boolean; expiresAt: Date | null }) =>
        entry.isPermanent || !entry.expiresAt || new Date(entry.expiresAt) > now;

      const getEffectiveForSlot = (slots: string[]) => {
        const candidate = blacklistEntries.find((e) =>
          slots.includes(norm((e.serviceType as string) || "all"))
        );
        if (!candidate) return null;
        return isActiveBan(candidate) ? candidate : null;
      };

      const allBanned = getEffectiveForSlot(["all"]) != null;
      const foodBanned = allBanned || getEffectiveForSlot(["food", "all"]) != null;
      const parcelBanned = allBanned || getEffectiveForSlot(["parcel", "all"]) != null;
      const personRideBanned = allBanned || getEffectiveForSlot(["person_ride", "all"]) != null;

      const allowed: string[] = [];
      const blocked: string[] = [];
      if (requestedServices.includes("food")) (foodBanned ? blocked : allowed).push("food");
      if (requestedServices.includes("parcel")) (parcelBanned ? blocked : allowed).push("parcel");
      if (requestedServices.includes("person_ride")) (personRideBanned ? blocked : allowed).push("person_ride");

      if (allowed.length === 0) {
        return reply.status(403).send({
          error: "ALL_SERVICES_BLOCKED",
          message: "You cannot go online — all requested services are blocked.",
          blockedServiceTypes: blocked,
        });
      }

      await db.insert(dutyLogs).values({
        riderId,
        status: "ON",
        serviceTypes: allowed,
      });

      return {
        isOnDuty: true,
        allowedServiceTypes: allowed,
        blockedServiceTypes: blocked.length ? blocked : undefined,
        lastUpdated: now.toISOString(),
      };
    }
  );

  app.put(
    "/home-location",
    {
      schema: {
        body: z.object({
          lat: z.number(),
          lon: z.number(),
          city: z.string().min(1),
          state: z.string().min(1),
          pincode: z.string().optional(),
          address: z.string().min(1),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            city: z.string().nullable(),
            state: z.string().nullable(),
            pincode: z.string().nullable(),
            address: z.string().nullable(),
            lat: z.number().nullable(),
            lon: z.number().nullable(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const userId = req.auth!.sub;
      const riderIdMatch = userId.match(/usr_(\d+)/);
      if (!riderIdMatch) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }

      const riderId = parseInt(riderIdMatch[1]!, 10);
      const body = req.body as {
        lat: number;
        lon: number;
        city: string;
        state: string;
        pincode?: string;
        address: string;
      };

      const db = getDb();
      const [updated] = await db
        .update(riders)
        .set({
          lat: parseFloat(Number(body.lat).toFixed(8)),
          lon: parseFloat(Number(body.lon).toFixed(8)),
          city: body.city.trim(),
          state: body.state.trim(),
          pincode: body.pincode?.trim() || null,
          address: body.address.trim(),
          updatedAt: new Date(),
        })
        .where(eq(riders.id, riderId))
        .returning({
          city: riders.city,
          state: riders.state,
          pincode: riders.pincode,
          address: riders.address,
          lat: riders.lat,
          lon: riders.lon,
        });

      if (!updated) {
        return reply.status(403).send({ error: "Rider not found" });
      }

      return {
        success: true,
        city: updated.city,
        state: updated.state,
        pincode: updated.pincode,
        address: updated.address,
        lat: updated.lat,
        lon: updated.lon,
      };
    },
  );

  // Get rider status
  app.get(
    "/:riderId/status",
    {
      schema: {
        params: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            riderId: z.string(),
            name: z.string().nullable(),
            mobile: z.string(),
            referralCode: z.string().nullable(),
            preferredLanguage: z.string(),
            selfieUrl: z.string().nullable(),
            onboardingStatus: z.string(),
            approvalStatus: z.string(),
            accountStatus: z.string(),
            hasHomeLocation: z.boolean(),
            homeAddress: z
              .object({
                city: z.string().nullable(),
                state: z.string().nullable(),
                pincode: z.string().nullable(),
                address: z.string().nullable(),
                lat: z.number().nullable(),
                lon: z.number().nullable(),
              })
              .nullable(),
            nextOnboardingStep: z.string(),
            completedOnboardingSteps: z.array(z.string()),
            rating: z.number().nullable(),
          }),
          404: z.object({
            error: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { riderId } = req.params as { riderId: string };

      const parsedId = parseInt(riderId, 10);
      if (!Number.isFinite(parsedId) || parsedId <= 0) {
        return reply.code(400).send({ error: "Invalid rider ID" });
      }

      const { resolveRiderOnboardingStatusForApp } = await import(
        "../../lib/rider-onboarding-status.js"
      );
      const { tryActivateRiderIfEligible } = await import(
        "../../lib/rider-onboarding-activation.js"
      );
      // Status is polled often — do not block on heavy activation checks (many DB round-trips).
      void tryActivateRiderIfEligible(parsedId).catch((err) => {
        req.log.warn({ err, riderId: parsedId }, "background rider activation check failed");
      });
      const resolved = await resolveRiderOnboardingStatusForApp(parsedId, {
        syncActivation: false,
      });
      if (!resolved) {
        return reply.code(404).send({ error: "Rider not found" });
      }

      const { rider, onboardingStatus, approvalStatus } = resolved;

      const progress = await getRiderOnboardingProgress(rider.id);

      const { getRiderAverageRating } = await import("../../lib/rider-average-rating.js");
      const rating = await getRiderAverageRating(rider.id);

      const { toAbsoluteClientMediaUrl } = await import("../../utils/publicAttachmentUrl.js");

      const tokenPhone =
        typeof req.auth?.phone === "string" ? req.auth.phone.trim() : "";

      return {
        riderId: rider.id.toString(),
        name: rider.name ?? null,
        mobile: rider.mobile?.trim() || tokenPhone || "",
        referralCode: rider.referralCode?.trim() || null,
        preferredLanguage: rider.defaultLanguage ?? "en",
        selfieUrl: toAbsoluteClientMediaUrl(rider.selfieUrl),
        onboardingStatus,
        approvalStatus,
        accountStatus: rider.status,
        hasHomeLocation: rider.lat != null && rider.lon != null,
        homeAddress:
          rider.lat != null && rider.lon != null
            ? {
                city: rider.city ?? null,
                state: rider.state ?? null,
                pincode: rider.pincode ?? null,
                address: rider.address ?? null,
                lat: rider.lat ?? null,
                lon: rider.lon ?? null,
              }
            : null,
        nextOnboardingStep: progress.nextStep,
        completedOnboardingSteps: progress.completedSteps,
        rating,
      };
    },
  );

  // Save document to rider_documents table (+ optional multi-file rows for front/back)
  app.post(
    "/onboarding/save-document",
    {
      schema: {
        body: z.object({
          riderId: z.number(),
          docType: z.string().min(1).max(64),
          fileUrl: z.string(),
          r2Key: z.string().optional(),
          extractedName: z.string().optional(),
          extractedDob: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
          files: z
            .array(
              z.object({
                side: z.enum(["front", "back", "single"]),
                fileUrl: z.string(),
                r2Key: z.string().optional(),
                mimeType: z.string().optional(),
              })
            )
            .optional(),
        }),
        response: {
          200: z.object({
            documentId: z.number(),
            success: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId, docType, fileUrl, r2Key, extractedName, extractedDob, metadata, files } =
        req.body as {
          riderId: number;
          docType: string;
          fileUrl: string;
          r2Key?: string;
          extractedName?: string;
          extractedDob?: string;
          metadata?: Record<string, unknown>;
          files?: {
            side: "front" | "back" | "single";
            fileUrl: string;
            r2Key?: string;
            mimeType?: string;
          }[];
        };
      const db = getDb();

      const resolveStoredFileUrl = (url: string, key?: string) => {
        if (key?.trim()) return attachmentsProxyUrlFromKey(key);
        if (url.includes("/attachments/proxy")) return url;
        return url;
      };

      const primaryKey = r2Key || extractKeyFromSignedUrl(fileUrl);
      const storedFileUrl = resolveStoredFileUrl(fileUrl, primaryKey ?? undefined);
      const rollbackKeys = new Set<string>();
      if (primaryKey) rollbackKeys.add(primaryKey);
      for (const f of files ?? []) {
        if (f.r2Key?.trim()) rollbackKeys.add(f.r2Key.trim());
      }

      try {
        const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
        if (riderRows.length === 0) {
          throw new Error("Rider not found");
        }

        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, docType)))
          .limit(1);

        let documentId: number;
        const previousR2Keys =
          existing.length > 0
            ? await collectDocumentR2Keys(existing[0]!.id, existing[0]!.r2Key)
            : [];

        const nextR2Keys = (): string[] =>
          [primaryKey, ...(files?.map((f) => f.r2Key) ?? [])].filter(
            (k): k is string => Boolean(k?.trim())
          );

        if (docType === "aadhaar") {
          const updateData: {
            name?: string;
            dob?: string;
            aadhaarNumber?: string;
          } = {};

          if (extractedName) updateData.name = extractedName;
          if (extractedDob) {
            const d = new Date(extractedDob);
            updateData.dob = Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
          }

          const rawAadhaar = metadata?.aadhaarNumber;
          let aadhaarDigits: string | undefined;
          if (typeof rawAadhaar === "string") {
            const digits = rawAadhaar.replace(/\D/g, "");
            if (digits.length === 12) {
              aadhaarDigits = digits;
              updateData.aadhaarNumber = digits;
            }
          }

          const docUpdate: Record<string, unknown> = {
            fileUrl: storedFileUrl,
            r2Key: primaryKey || null,
            extractedName: extractedName || null,
            extractedDob: extractedDob || null,
            metadata: metadata || null,
            verificationMethod: "MANUAL_UPLOAD",
            updatedAt: new Date(),
          };
          if (aadhaarDigits) {
            docUpdate.docNumber = aadhaarDigits;
          }

          if (existing.length > 0) {
            await db
              .update(riderDocuments)
              .set(docUpdate)
              .where(eq(riderDocuments.id, existing[0]!.id));
            documentId = existing[0]!.id;
          } else {
            const [newDoc] = await db
              .insert(riderDocuments)
              .values({
                riderId,
                docType,
                fileUrl: storedFileUrl,
                r2Key: primaryKey || null,
                extractedName: extractedName || null,
                extractedDob: extractedDob || null,
                docNumber: aadhaarDigits || null,
                metadata: metadata || null,
                verificationMethod: "MANUAL_UPLOAD",
              })
              .returning({ id: riderDocuments.id });
            documentId = newDoc!.id;
          }

          if (files?.length) {
            await db
              .delete(riderDocumentFiles)
              .where(eq(riderDocumentFiles.documentId, documentId));

            await db.insert(riderDocumentFiles).values(
              files.map((f, index) => ({
                documentId,
                fileUrl: resolveStoredFileUrl(f.fileUrl, f.r2Key),
                r2Key: f.r2Key || null,
                side: f.side,
                mimeType: f.mimeType || "image/jpeg",
                sortOrder: index,
              }))
            );
          }

          if (Object.keys(updateData).length > 0) {
            await db
              .update(riders)
              .set({
                ...updateData,
                updatedAt: new Date(),
              })
              .where(eq(riders.id, riderId));
          }

          await deleteReplacedR2Keys(previousR2Keys, nextR2Keys());

          return {
            documentId,
            success: true,
          };
        }

        if (existing.length > 0) {
          await db
            .update(riderDocuments)
            .set({
              fileUrl: storedFileUrl,
              r2Key: primaryKey || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              metadata: metadata || null,
              verificationMethod: "MANUAL_UPLOAD",
              updatedAt: new Date(),
            })
            .where(eq(riderDocuments.id, existing[0]!.id));
          documentId = existing[0]!.id;
        } else {
          const [newDoc] = await db
            .insert(riderDocuments)
            .values({
              riderId,
              docType,
              fileUrl: storedFileUrl,
              r2Key: primaryKey || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              metadata: metadata || null,
              verificationMethod: "MANUAL_UPLOAD",
            })
            .returning({ id: riderDocuments.id });
          documentId = newDoc!.id;
        }

        if (files?.length) {
          await db
            .delete(riderDocumentFiles)
            .where(eq(riderDocumentFiles.documentId, documentId));

          await db.insert(riderDocumentFiles).values(
            files.map((f, index) => ({
              documentId,
              fileUrl: resolveStoredFileUrl(f.fileUrl, f.r2Key),
              r2Key: f.r2Key || null,
              side: f.side,
              mimeType: f.mimeType || "image/jpeg",
              sortOrder: index,
            }))
          );
        }

        if (docType === "pan") {
          const rawPan = metadata?.panNumber;
          if (typeof rawPan === "string" && rawPan.trim()) {
            await db
              .update(riders)
              .set({
                panNumber: rawPan.trim().toUpperCase(),
                updatedAt: new Date(),
              })
              .where(eq(riders.id, riderId));
          }
        } else if (docType === "selfie") {
          await db
            .update(riders)
            .set({
              selfieUrl: storedFileUrl,
              updatedAt: new Date(),
            })
            .where(eq(riders.id, riderId));
        }

        await deleteReplacedR2Keys(previousR2Keys, nextR2Keys());

        return {
          documentId,
          success: true,
        };
      } catch (error) {
        for (const key of rollbackKeys) {
          try {
            await deleteFromR2(key);
            console.log(`[Rollback] Deleted R2 file: ${key}`);
          } catch (rollbackError) {
            console.error(`[Rollback] Failed to delete R2 file ${key}:`, rollbackError);
          }
        }
        throw error;
      }
    },
  );

  // Update rider onboarding stage
  app.post(
    "/onboarding/update-stage",
    {
      schema: {
        body: z.object({
          riderId: z.number(),
          stage: z.enum(["MOBILE_VERIFIED", "KYC", "PAYMENT", "APPROVAL", "ACTIVE"]),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId, stage } = req.body as { riderId: number; stage: "MOBILE_VERIFIED" | "KYC" | "PAYMENT" | "APPROVAL" | "ACTIVE" };
      const db = getDb();

      // Verify rider exists
      const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      // Update onboarding stage
      await db
        .update(riders)
        .set({
          onboardingStage: stage,
          updatedAt: new Date(),
        })
        .where(eq(riders.id, riderId));

      return {
        success: true,
      };
    },
  );

  // Regenerate signed URL for a document (if URL expired)
  app.post(
    "/onboarding/regenerate-url",
    {
      schema: {
        body: z.object({
          documentId: z.number(),
        }),
        response: {
          200: z.object({
            fileUrl: z.string(),
            success: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { documentId } = req.body as { documentId: number };
      const db = getDb();

      // Get document
      const docs = await db
        .select()
        .from(riderDocuments)
        .where(eq(riderDocuments.id, documentId))
        .limit(1);

      if (docs.length === 0) {
        throw new Error("Document not found");
      }

      const doc = docs[0]!;

      // Check if we have the R2 key
      if (!doc.r2Key) {
        throw new Error("R2 key not found. Cannot regenerate URL. Please re-upload the document.");
      }

      // Regenerate signed URL with maximum expiration
      const newSignedUrl = await getR2SignedUrl(doc.r2Key);

      // Update document with new signed URL
      await db
        .update(riderDocuments)
        .set({
          fileUrl: newSignedUrl,
        })
        .where(eq(riderDocuments.id, documentId));

      return {
        fileUrl: newSignedUrl,
        success: true,
      };
    },
  );

  const RiderOrderSummarySchema = z.object({
    id: z.string(),
    status: z.enum(["pending", "assigned", "picked_up", "in_transit", "delivered", "cancelled"]),
    category: z.enum(["food", "parcel", "ride"]),
    pickup: z.object({
      address: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
    delivery: z.object({
      address: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
    distanceKm: z.number().optional(),
    pickupDistanceKm: z.number().optional(),
    tripDistanceKm: z.number().optional(),
    totalDistanceKm: z.number().optional(),
    estimatedEarning: z.number(),
    baseEarning: z.number().optional(),
    customerTipAmount: z.number().optional(),
    totalEarning: z.number().optional(),
    higherDispatchPriority: z.boolean().optional(),
    merchantName: z.string().nullable().optional(),
    itemCount: z.number().optional(),
    createdAt: z.string(),
    acceptDeadlineAt: z.string().optional(),
    rideType: z.string().optional(),
    formattedOrderId: z.string().nullable().optional(),
    atPickup: z.boolean().optional(),
    pickupOtpVerified: z.boolean().optional(),
    rideStarted: z.boolean().optional(),
    atCustomer: z.boolean().optional(),
    foodOrderStatus: z.string().nullable().optional(),
    merchantOrderReady: z.boolean().optional(),
    customerName: z.string().nullable().optional(),
    customerPhone: z.string().nullable().optional(),
    pickupAddressGeocoded: z.string().optional(),
    dropAddressGeocoded: z.string().optional(),
  });

  app.get(
    "/order-acceptance-settings",
    {
      schema: {
        response: {
          200: z.object({
            settings: z.object({
              store_type: z.string(),
              acceptance_window_minutes: z.number(),
              alert_sound_enabled: z.boolean(),
              alert_sound_url: z.string().nullable(),
              alert_sound_repeat_count: z.number(),
              alert_sound_urls_by_slot: z.tuple([
                z.string().nullable(),
                z.string().nullable(),
                z.string().nullable(),
              ]),
              alert_sound_slot_choice: z.number(),
            }),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { loadPlatformOrderAcceptanceSettingsForCategory } = await import(
        "../../lib/merchant-order-acceptance-settings.js"
      );
      const sql = getSql();
      const settings = await loadPlatformOrderAcceptanceSettingsForCategory(sql, "RIDER");
      return { settings };
    }
  );

  app.get(
    "/orders/available",
    {
      schema: {
        response: {
          200: z.array(RiderOrderSummarySchema),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { getAvailableOrdersForRider } = await import("./rider.orders.service.js");
      try {
        return await getAvailableOrdersForRider(riderId);
      } catch (err) {
        req.log.warn({ err, riderId }, "getAvailableOrdersForRider failed");
        return [];
      }
    }
  );

  app.get(
    "/orders/active",
    {
      schema: {
        response: {
          200: z.array(RiderOrderSummarySchema),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { getActiveOrdersForRider } = await import("./rider.orders.service.js");
      return getActiveOrdersForRider(riderId);
    }
  );

  const RiderOrderHistoryCategorySchema = z.enum(["all", "food", "ride", "parcel", "person"]);

  app.get(
    "/orders/ride-history",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
          offset: z.coerce.number().int().min(0).optional(),
          category: RiderOrderHistoryCategorySchema.optional(),
        }),
        response: {
          200: z.object({
            orders: z.array(RiderOrderSummarySchema),
            total: z.number(),
            hasMore: z.boolean(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const q = req.query as { limit?: number; offset?: number; category?: string };
      const { getOrderHistoryForRider, parseRiderOrderHistoryCategory } = await import(
        "./rider.orders.service.js"
      );
      return getOrderHistoryForRider(riderId, {
        limit: q.limit,
        offset: q.offset,
        category: parseRiderOrderHistoryCategory(q.category),
      });
    }
  );

  app.post(
    "/orders/:id/accept",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      try {
        const { acceptOrderForRider } = await import("./rider.orders.service.js");
        return await acceptOrderForRider(riderId, id);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        const status = err.statusCode ?? 500;
        const raw = err.message || "Accept failed";
        const safeMessage =
          raw.includes("Failed query") ||
          raw.includes("INSERT INTO") ||
          raw.includes("duplicate key")
            ? status === 409
              ? "This order is no longer available."
              : "Could not assign rider to this order. Please try again."
            : raw;
        return reply.status(status as 409).send({ error: safeMessage });
      }
    }
  );

  app.post(
    "/orders/:id/reject",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          reasonCode: z.string().min(1),
          reasonText: z.string().optional(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as { reasonCode: string; reasonText?: string };
      try {
        const { rejectOrderForRider } = await import("./rider.orders.service.js");
        return await rejectOrderForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const code = err.statusCode ?? 500;
        if (code >= 400 && code < 500) {
          return reply.status(code).send({ error: err.message || "Reject failed" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/orders/:id",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      try {
        const { getOrderForRider } = await import("./rider.orders.service.js");
        return await getOrderForRider(riderId, id);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Not found" });
        }
        throw e;
      }
    }
  );

  const riderGpsBodySchema = z
    .object({
      lat: z.number().finite().optional(),
      lng: z.number().finite().optional(),
    })
    .optional();

  app.get(
    "/orders/:id/milestone-geo-fence",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({
          lat: z.coerce.number().finite().optional(),
          lng: z.coerce.number().finite().optional(),
        }),
        response: {
          200: z.object({
            orderId: z.string(),
            serviceType: z.enum(["food", "parcel", "person_ride"]),
            milestones: z.array(
              z.object({
                milestoneKey: z.string(),
                serviceType: z.enum(["food", "parcel", "person_ride"]),
                radiusMeters: z.number(),
                distanceMeters: z.number(),
                withinRadius: z.boolean(),
                blockedMessage: z.string().nullable(),
              })
            ),
          }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const q = req.query as { lat?: number; lng?: number };
      try {
        const { getMilestoneGeoFenceForRiderOrder } = await import("./rider.orders.service.js");
        return await getMilestoneGeoFenceForRiderOrder(riderId, id, q);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 404).send({ error: err.message || "Failed" });
      }
    }
  );

  app.post(
    "/orders/:id/reached-pickup",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderGpsBodySchema,
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { lat?: number; lng?: number };
      try {
        const { markReachedPickupForRider } = await import("./rider.orders.service.js");
        return await markReachedPickupForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
      }
    }
  );

  app.post(
    "/orders/:id/verify-pickup-otp",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          otp: z.string().min(4).max(8),
          lat: z.number().finite().optional(),
          lng: z.number().finite().optional(),
        }),
        response: {
          200: RiderOrderSummarySchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as { otp: string; lat?: number; lng?: number };
      try {
        const { verifyPickupOtpForRider } = await import("./rider.orders.service.js");
        return await verifyPickupOtpForRider(riderId, id, body.otp, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        if (status === 403) {
          return reply.status(403).send({ error: err.message || "Incorrect OTP" });
        }
        return reply.status(status as 409).send({ error: err.message || "Verification failed" });
      }
    }
  );

  app.post(
    "/orders/:id/start-ride",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderGpsBodySchema,
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { lat?: number; lng?: number };
      try {
        const { startRideForRider } = await import("./rider.orders.service.js");
        return await startRideForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Could not start ride" });
      }
    }
  );

  app.post(
    "/orders/:id/complete-ride",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderGpsBodySchema,
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { lat?: number; lng?: number };
      try {
        const { completePersonRideForRider } = await import("./rider.orders.service.js");
        return await completePersonRideForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Could not complete ride" });
      }
    }
  );

  app.post(
    "/orders/:id/reached-customer",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderGpsBodySchema,
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { lat?: number; lng?: number };
      try {
        const { markReachedCustomerForRider } = await import("./rider.orders.service.js");
        return await markReachedCustomerForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
      }
    }
  );

  app.post(
    "/orders/:id/verify-delivery-otp",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          otp: z.string().min(4).max(8),
          lat: z.number().finite().optional(),
          lng: z.number().finite().optional(),
          deliveryImageUrl: z.string().min(8).max(2048).optional(),
          deliveryImageR2Key: z.string().min(3).max(512).optional(),
        }),
        response: {
          200: RiderOrderSummarySchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        otp: string;
        lat?: number;
        lng?: number;
        deliveryImageUrl: string;
        deliveryImageR2Key: string;
      };
      try {
        const { verifyDeliveryOtpForRider } = await import("./rider.orders.service.js");
        return await verifyDeliveryOtpForRider(riderId, id, body.otp, body);
      } catch (e) {
        req.log.error({ err: e, orderId: id, riderId }, "verify-delivery-otp failed");
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        const raw = err.message || "Verification failed";
        const safeMessage =
          raw.includes("Failed query") || raw.includes("INSERT INTO")
            ? "Could not complete delivery. Ensure DB migrations 0282 and 0283 are applied, then retry."
            : raw;
        if (status === 403) {
          return reply.status(403).send({ error: safeMessage });
        }
        if (status === 400 || status === 409) {
          return reply.status(status).send({ error: safeMessage });
        }
        return reply.status(500).send({ error: safeMessage });
      }
    }
  );

  app.post(
    "/orders/:id/cancel-assigned",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          reasonCode: z.string().min(1).max(64),
          reasonText: z.string().max(500).optional(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return reply.status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as { reasonCode: string; reasonText?: string };
      try {
        const { cancelAssignedRideForRider } = await import("./rider.orders.service.js");
        return await cancelAssignedRideForRider(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        if (status === 404) {
          return reply.status(404).send({ error: err.message || "Not found" });
        }
        return reply.status(status as 409).send({ error: err.message || "Cancel failed" });
      }
    }
  );
}


