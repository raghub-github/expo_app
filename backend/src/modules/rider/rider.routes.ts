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
import { desc, eq, and, inArray, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";

function normalizeDutyServiceTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((s) => String(s)).filter(Boolean);
}

function toDutyIsoTimestamp(value: Date | string | null | undefined): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}
import { auth } from "../../plugins/auth.js";
import { getDb, getSql } from "../../db/client.js";
import {
  validatePickupScan,
  validatePickupByOtp,
} from "../orders/order-pickup-token.service.js";
import { deactivateRiderDeviceSessions } from "../../lib/rider-app-session.js";
import { registerRiderDeviceSessionRoutes } from "./rider-device-session.routes.js";
import {
  riders,
  riderDocuments,
  riderDocumentFiles,
  riderLogoutEvents,
  riderLiveLocations,
  riderLocationHistory,
  orderRiderTracking,
  ordersCore,
} from "../../db/schema.js";
import { RiderLogoutBodySchema } from "../../lib/rider-logout-reasons.js";
import {
  recordRiderDutyLog,
  recordRiderDutyOffIfOnline,
} from "../../lib/rider-duty-log.service.js";
import { handleRiderLocationPing } from "../../lib/rider-location-ping.service.js";
import { getR2SignedUrl, deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";
import { attachmentsProxyUrlFromKey } from "../../utils/attachments-proxy-url.js";
import {
  collectDocumentR2Keys,
  deleteReplacedR2Keys,
} from "../../lib/rider-document-r2-keys.js";
import { getRiderOnboardingProgress } from "../../lib/rider-onboarding-progress.js";
import { isDlAlreadyRegistered, normalizeDlNumber } from "../../lib/rider-dl-registration-check.js";
import { isRcAlreadyRegistered, normalizeRcNumber } from "../../lib/rider-rc-registration-check.js";
import {
  isAadhaarAlreadyRegistered,
  normalizeAadhaarDigits,
} from "../../lib/rider-aadhaar-registration-check.js";
import { isPanAlreadyRegistered, normalizePan } from "../../lib/rider-pan-registration-check.js";
import { getEnv } from "../../config/env.js";
import { finalizeMerchantOrderDelivered } from "../../lib/merchant-order-delivered-wallet.js";
import { unassignFoodRiderAndRestartDispatch } from "../../lib/food-rider-unassign.service.js";
import { registerRiderSubscriptionRoutes } from "./rider-subscription.routes.js";
import { registerRiderIncentiveRoutes } from "./rider-incentive.routes.js";
import { registerRiderPenaltyPaymentRoutes } from "./rider-penalty-payment.routes.js";
import { listRiderAppCancellationReasons } from "../../lib/rider-cancellation-reason-catalog.js";
import { speedMpsToKmh, upsertRiderCurrentLocation } from "../../lib/rider-current-location.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

export async function riderRoutes(app: FastifyInstance) {
  // All rider endpoints require rider auth (later: enforce role claim).
  await app.register(auth, { required: true });

  registerRiderSubscriptionRoutes(app);
  registerRiderIncentiveRoutes(app);
  registerRiderPenaltyPaymentRoutes(app);
  registerRiderDeviceSessionRoutes(app, parseRiderIdFromAuth);

  // ── Pickup verification (backend-only validation for BOTH QR token + OTP) ──────
  // Either method, when all validations pass, marks the order Picked Up, consumes
  // the shared pickup token (one-time), stamps timestamps, and audits. The order-row
  // update (rider_picked_up_at) is what existing realtime subscribers observe.
  app.post(
    "/pickup/scan",
    {
      schema: {
        body: z.object({
          token: z.string().min(10).max(128),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }),
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (riderId == null) return (reply as any).status(403).send({ success: false, error: "Invalid rider session" });
      const body = req.body as { token: string; latitude?: number; longitude?: number };
      const result = await validatePickupScan({
        token: body.token,
        riderId,
        device: req.auth?.device_id ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = reply as any;
      if (!result.ok) return r.status(result.status).send({ success: false, reason: result.reason, message: result.message });
      return r.status(200).send({
        success: true,
        order_id: result.orderId,
        formatted_order_id: result.publicOrderId,
        status: "PICKED_UP",
        picked_up_at: result.pickedUpAt,
      });
    }
  );

  app.post(
    "/pickup/otp",
    {
      schema: {
        body: z.object({
          order_id: z.coerce.number().int().positive(),
          otp: z.string().min(3).max(8),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }),
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (riderId == null) return (reply as any).status(403).send({ success: false, error: "Invalid rider session" });
      const body = req.body as { order_id: number; otp: string; latitude?: number; longitude?: number };
      const result = await validatePickupByOtp({
        orderId: body.order_id,
        otp: body.otp,
        riderId,
        device: req.auth?.device_id ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = reply as any;
      if (!result.ok) return r.status(result.status).send({ success: false, reason: result.reason, message: result.message });
      return r.status(200).send({
        success: true,
        order_id: result.orderId,
        formatted_order_id: result.publicOrderId,
        status: "PICKED_UP",
        picked_up_at: result.pickedUpAt,
      });
    }
  );

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }

      const body = RiderLogoutBodySchema.parse(req.body);
      if (body.reasonCode === "OTHER" && !body.reasonText?.trim()) {
        return (reply as any).status(400).send({ error: "reason_text_required" });
      }

      const db = getDb();
      const sql = getSql();
      const deviceId = req.auth?.device_id ?? null;

      await recordRiderDutyOffIfOnline(riderId, "logout", {
        deviceId,
        source: "rider_app",
        metadata: { reasonCode: body.reasonCode },
      });

      await db.insert(riderLogoutEvents).values({
        id: `rlogout_${ulid()}`,
        riderId,
        userId,
        deviceId,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText?.trim() || null,
      });

      try {
        if (body.logoutAllDevices) {
          const { revokeAllRiderDeviceSessions } = await import("../../lib/rider-device-sessions.js");
          await revokeAllRiderDeviceSessions(sql, {
            userId,
            revokedBy: "rider_logout_all",
            revokeReason: `logout_all:${body.reasonCode}`,
          });
        } else {
          await deactivateRiderDeviceSessions(sql, {
            userId,
            deviceId,
            revokedBy: "rider_self",
            revokeReason: body.reasonCode,
          });
        }
      } catch (sessErr) {
        req.log?.error?.(
          { err: sessErr, riderId, logoutAllDevices: Boolean(body.logoutAllDevices) },
          "Rider logout: device session deactivate failed"
        );
      }

      try {
        const { purgeUserPushTokens } = await import("../../lib/purge-user-push-tokens.js");
        await purgeUserPushTokens({
          userId,
          role: "rider",
          log: req.log,
        });
      } catch (pushErr) {
        req.log?.warn?.({ err: pushErr, riderId }, "Rider logout: push token purge failed");
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
      const riderId = parseRiderIdFromAuth(userId);

      return handleRiderLocationPing(
        {
          userId,
          deviceId,
          tokenDeviceId,
          tsMs: body.tsMs,
          lat: body.lat,
          lng: body.lng,
          accuracyM: body.accuracyM ?? null,
          altitudeM: body.altitudeM ?? null,
          speedMps: body.speedMps ?? null,
          headingDeg: body.headingDeg ?? null,
          mocked: body.mocked ?? false,
          provider: body.provider ?? "unknown",
        },
        riderId
      );
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }

      const body = req.body as { lat: number; lng: number; order_id?: string; speed?: number; heading?: number; accuracy?: number };
      const db = getDb();
      const now = new Date();

      await upsertRiderCurrentLocation(db, {
        userId,
        riderId,
        lat: body.lat,
        lng: body.lng,
        speedMps: body.speed != null ? body.speed / 3.6 : null,
        headingDeg: body.heading ?? null,
        accuracyM: body.accuracy ?? null,
        seenAt: now,
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

      if (body.order_id) {
        void import("../../lib/otp-radius-notify.js")
          .then(({ maybeNotifyOtpOnLiveLocation }) =>
            maybeNotifyOtpOnLiveLocation({
              riderId,
              orderRef: body.order_id!,
              lat: body.lat,
              lng: body.lng,
            })
          )
          .catch(() => {});
      }

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
              actorId: body.actor_id ?? undefined,
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
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }

      const db = getDb();
      const sql = getSql();

      const { resolveRiderOnboardingStatusForApp } = await import(
        "../../lib/rider-onboarding-status.js"
      );
      const resolved = await resolveRiderOnboardingStatusForApp(riderId);
      if (!resolved) {
        return (reply as any).status(404).send({ error: "Rider not found" });
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

  const RiderBankPaymentMethodSchema = z.object({
    id: z.number(),
    methodType: z.literal("bank"),
    accountHolderName: z.string(),
    bankName: z.string().nullable(),
    ifsc: z.string().nullable(),
    branch: z.string().nullable(),
    accountNumberMasked: z.string(),
    verificationStatus: z.enum(["pending", "verified", "rejected"]),
    createdAt: z.string(),
  });

  app.get(
    "/payment-methods/bank",
    {
      schema: {
        response: {
          200: z.object({
            paymentMethod: RiderBankPaymentMethodSchema.nullable(),
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { getRiderBankPaymentMethod } = await import(
        "../../lib/rider-bank-payment-method.js"
      );
      const paymentMethod = await getRiderBankPaymentMethod(riderId);
      return { paymentMethod };
    },
  );

  app.post(
    "/payment-methods/bank",
    {
      schema: {
        body: z.object({
          accountHolderName: z.string().min(2).max(80),
          bankName: z.string().min(2).max(80),
          ifsc: z.string().min(11).max(11),
          branch: z.string().max(80).optional(),
          accountNumber: z.string().regex(/^\d{9,18}$/),
        }),
        response: {
          201: z.object({
            paymentMethod: RiderBankPaymentMethodSchema,
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { createRiderBankPaymentMethod } = await import(
        "../../lib/rider-bank-payment-method.js"
      );
      try {
        const paymentMethod = await createRiderBankPaymentMethod(
          riderId,
          req.body as Parameters<typeof createRiderBankPaymentMethod>[1]
        );
        return reply.status(201).send({ paymentMethod });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not save bank account";
        const status = message === "Bank account already linked" ? 409 : 400;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(status).send({ error: message });
      }
    },
  );

  const RiderEmergencyContactSchema = z.object({
    label: z.string().min(1).max(40),
    phone: z.string().min(10).max(15),
  });

  app.get(
    "/me/emergency-contacts",
    {
      schema: {
        response: {
          200: z.object({
            contacts: z.array(RiderEmergencyContactSchema),
            defaults: z.object({
              police: z.string(),
              ambulance: z.string(),
            }),
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { getRiderEmergencyContacts, INDIA_EMERGENCY_DEFAULTS } = await import(
        "../../lib/rider-emergency-contacts.js"
      );
      const contacts = await getRiderEmergencyContacts(riderId);
      return {
        contacts,
        defaults: {
          police: INDIA_EMERGENCY_DEFAULTS.police,
          ambulance: INDIA_EMERGENCY_DEFAULTS.ambulance,
        },
      };
    }
  );

  app.put(
    "/me/emergency-contacts",
    {
      schema: {
        body: z.object({
          contacts: z.array(RiderEmergencyContactSchema).max(2),
        }),
        response: {
          200: z.object({
            contacts: z.array(RiderEmergencyContactSchema),
            defaults: z.object({
              police: z.string(),
              ambulance: z.string(),
            }),
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { saveRiderEmergencyContacts } = await import(
        "../../lib/rider-emergency-contacts.js"
      );
      const body = req.body as { contacts: z.infer<typeof RiderEmergencyContactSchema>[] };
      const contacts = await saveRiderEmergencyContacts(riderId, body.contacts);
      const { INDIA_EMERGENCY_DEFAULTS } = await import(
        "../../lib/rider-emergency-contacts.js"
      );
      return {
        contacts,
        defaults: {
          police: INDIA_EMERGENCY_DEFAULTS.police,
          ambulance: INDIA_EMERGENCY_DEFAULTS.ambulance,
        },
      };
    }
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
                verificationMethod: z.enum(["auto", "manual", "pending"]).nullable(),
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
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }

      const { getRiderKycDocumentsForApp } = await import("../../lib/rider-documents-kyc-catalog.js");
      return getRiderKycDocumentsForApp(riderId);
    },
  );

  const ServiceBreakdownSchema = z.object({
    earnings: z.number(),
    penalties: z.number(),
    penaltyReverts: z.number(),
    offers: z.number(),
    net: z.number(),
  });
  const EarningsSummarySchema = z.object({
    totalBalance: z.number(),
    withdrawable: z.number(),
    locked: z.number(),
    subscriptionDebited: z.number(),
    thisWeek: z.number(),
    thisMonth: z.number(),
    hasBankAccount: z.boolean(),
    /** Rider can withdraw only when the wallet is positive and above this amount. */
    minWithdrawal: z.number().optional(),
    canWithdraw: z.boolean().optional(),
    breakdown: z.object({
      food: z.number(),
      parcel: z.number(),
      ride: z.number(),
    }),
    /** Full per-service breakdown (earnings, penalties, reverts, offers) + common bucket. */
    breakdownDetail: z
      .object({
        food: ServiceBreakdownSchema,
        parcel: ServiceBreakdownSchema,
        ride: ServiceBreakdownSchema,
        common: z.object({
          subscriptionDebited: z.number(),
          otherOffers: z.number(),
          otherPenaltyReverts: z.number(),
        }),
      })
      .optional(),
    accountRestrictions: z.object({
      accountRestricted: z.boolean(),
      accountRestrictedReason: z.enum([
        "none",
        "service_blacklist",
        "all_services_blacklist",
        "blocked_status",
      ]),
      globalWalletBlock: z.boolean(),
      blacklistBlockedServices: z.array(z.enum(["food", "parcel", "person_ride"])),
      negativeWalletBlocks: z
        .array(z.object({ serviceType: z.string(), reason: z.string() }))
        .optional(),
      allServicesBlacklisted: z.boolean(),
      penaltyDue: z.number(),
      penaltyDutyStopped: z.boolean(),
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
          subscriptionDebited: 0,
          thisWeek: 0,
          thisMonth: 0,
          hasBankAccount: false,
          breakdown: { food: 0, parcel: 0, ride: 0 },
          accountRestrictions: {
            accountRestricted: false,
            accountRestrictedReason: "none" as const,
            globalWalletBlock: false,
            blacklistBlockedServices: [],
            allServicesBlacklisted: false,
            penaltyDue: 0,
            penaltyDutyStopped: false,
          },
        };
      }
      const { riderWallet } = await import("../../db/schema.js");
      const { safeRiderHasBankPaymentMethod } = await import(
        "../../lib/rider-bank-payment-method.js"
      );
      const db = getDb();
      const [wallet] = await db
        .select()
        .from(riderWallet)
        .where(eq(riderWallet.riderId, riderId))
        .limit(1);
      const { getRiderPeriodEarningsTotals, getRiderSubscriptionDebitedTotal } = await import(
        "../../lib/rider-wallet-ledger-app.js"
      );
      const [hasBankAccount, periodTotals, subscriptionDebited, accountRestrictions] =
        await Promise.all([
        safeRiderHasBankPaymentMethod(riderId),
        getRiderPeriodEarningsTotals(riderId),
        getRiderSubscriptionDebitedTotal(riderId),
        import("../../lib/rider-account-restrictions.js").then((m) =>
          m.getRiderAccountRestrictions(riderId)
        ),
      ]);
      const total = wallet ? Number(wallet.totalBalance ?? 0) : 0;
      const food = wallet ? Number(wallet.earningsFood ?? 0) : 0;
      const parcel = wallet ? Number(wallet.earningsParcel ?? 0) : 0;
      const ride = wallet ? Number(wallet.earningsPersonRide ?? 0) : 0;
      const { getRiderWithdrawableBalance } = await import(
        "../../lib/rider-withdrawal.service.js"
      );
      const { getRiderWalletBreakdown } = await import("../../lib/rider-wallet-breakdown.js");
      const [withdrawable, breakdownDetail] = await Promise.all([
        getRiderWithdrawableBalance(riderId),
        getRiderWalletBreakdown(riderId),
      ]);
      const MIN_WITHDRAWAL_BALANCE = 300;
      return {
        totalBalance: total,
        withdrawable,
        locked: accountRestrictions.penaltyDue,
        subscriptionDebited,
        thisWeek: periodTotals.thisWeek,
        thisMonth: periodTotals.thisMonth,
        hasBankAccount,
        minWithdrawal: MIN_WITHDRAWAL_BALANCE,
        canWithdraw: total > MIN_WITHDRAWAL_BALANCE,
        breakdown: { food, parcel, ride },
        breakdownDetail,
        accountRestrictions: {
          accountRestricted: accountRestrictions.accountRestricted,
          accountRestrictedReason: accountRestrictions.accountRestrictedReason,
          globalWalletBlock: accountRestrictions.globalWalletBlock,
          blacklistBlockedServices: accountRestrictions.blacklistBlockedServices.filter(
            (s): s is "food" | "parcel" | "person_ride" =>
              s === "food" || s === "parcel" || s === "person_ride"
          ),
          negativeWalletBlocks: accountRestrictions.negativeWalletBlocks,
          allServicesBlacklisted: accountRestrictions.allServicesBlacklisted,
          penaltyDue: accountRestrictions.penaltyDue,
          penaltyDutyStopped: accountRestrictions.penaltyDutyStopped,
        },
      };
    },
  );

  const RiderWithdrawalSchema = z.object({
    id: z.number(),
    amount: z.number(),
    status: z.string(),
    bankAccMasked: z.string(),
    ifsc: z.string(),
    accountHolderName: z.string(),
    transactionId: z.string().nullable(),
    failureReason: z.string().nullable(),
    createdAt: z.string(),
    processedAt: z.string().nullable(),
  });

  app.get(
    "/withdrawals",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: {
          200: z.object({
            withdrawals: z.array(RiderWithdrawalSchema),
          }),
        },
      },
    },
    async (req) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        return { withdrawals: [] };
      }
      const { listRiderWithdrawals } = await import("../../lib/rider-withdrawal.service.js");
      const { limit } = req.query as { limit: number };
      const withdrawals = await listRiderWithdrawals(riderId, limit);
      return { withdrawals };
    },
  );

  app.post(
    "/withdrawals",
    {
      schema: {
        body: z.object({
          amount: z.number().positive(),
        }),
        response: {
          200: z.object({
            withdrawal: RiderWithdrawalSchema,
          }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { createRiderWithdrawalRequest } = await import(
        "../../lib/rider-withdrawal.service.js"
      );
      try {
        const body = req.body as { amount: number };
        const withdrawal = await createRiderWithdrawalRequest(riderId, body.amount);
        return { withdrawal };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdrawal failed";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(400).send({ error: message });
      }
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
    orderPublicId: z.string().nullable(),
    createdAt: z.string(),
  });

  const RiderLedgerSummarySchema = z.object({
    totalEarnings: z.number(),
    totalWithdrawals: z.number(),
    pendingSettlement: z.number(),
    monthLabel: z.string(),
  });

  const RiderLedgerResponseSchema = z.object({
    entries: z.array(RiderLedgerEntrySchema),
    total: z.number(),
    hasMore: z.boolean(),
    periodLabel: z.string(),
    summary: RiderLedgerSummarySchema,
  });

  app.get(
    "/wallet/ledger",
    {
      schema: {
        querystring: z.object({
          segment: z
            .enum([
              "all",
              "food",
              "parcel",
              "ride",
              "incentives",
              "adjustments",
              "penalties",
              "withdrawals",
              "subscriptions",
            ])
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
        return {
          entries: [],
          total: 0,
          hasMore: false,
          periodLabel: "This month",
          summary: {
            totalEarnings: 0,
            totalWithdrawals: 0,
            pendingSettlement: 0,
            monthLabel: "This Month Summary",
          },
        };
      }

      const { segment, period, limit, offset } = req.query as {
        segment:
          | "all"
          | "food"
          | "parcel"
          | "ride"
          | "incentives"
          | "adjustments"
          | "penalties"
          | "withdrawals"
          | "subscriptions";
        period: "this_month" | "last_month" | "all";
        limit: number;
        offset: number;
      };

      const { getRiderLedgerForApp } = await import("../../lib/rider-wallet-ledger-app.js");
      return getRiderLedgerForApp({ riderId, segment, period, limit, offset });
    },
  );

  const RiderLedgerGraphSchema = z.object({
    totalEarning: z.number(),
    orderEarning: z.number(),
    incentive: z.number(),
    surge: z.number(),
    waiting: z.number(),
    orderCount: z.number(),
    rangeLabel: z.string(),
    from: z.string(),
    to: z.string(),
    dailyBars: z.array(
      z.object({
        date: z.string(),
        day: z.number(),
        amount: z.number(),
        orderCount: z.number(),
      }),
    ),
  });

  app.get(
    "/wallet/ledger/graph",
    {
      schema: {
        querystring: z.object({
          segment: z
            .enum([
              "all",
              "food",
              "parcel",
              "ride",
              "incentives",
              "adjustments",
              "penalties",
              "withdrawals",
              "subscriptions",
            ])
            .default("all"),
          from: z.string().min(8),
          to: z.string().min(8),
        }),
        response: { 200: RiderLedgerGraphSchema },
      },
    },
    async (req) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      const empty = {
        totalEarning: 0,
        orderEarning: 0,
        incentive: 0,
        surge: 0,
        waiting: 0,
        orderCount: 0,
        rangeLabel: "",
        from: "",
        to: "",
        dailyBars: [] as Array<{
          date: string;
          day: number;
          amount: number;
          orderCount: number;
        }>,
      };
      if (riderId == null) return empty;

      const { segment, from, to } = req.query as {
        segment:
          | "all"
          | "food"
          | "parcel"
          | "ride"
          | "incentives"
          | "adjustments"
          | "penalties"
          | "withdrawals"
          | "subscriptions";
        from: string;
        to: string;
      };

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return empty;
      }

      const { getRiderLedgerGraphForApp } = await import("../../lib/rider-wallet-ledger-app.js");
      return getRiderLedgerGraphForApp({
        riderId,
        segment,
        from: fromDate,
        to: toDate,
      });
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
    vehicleCategory: z.string().nullable(),
    seatingCapacity: z.number().int().nullable(),
    acType: z.string().nullable(),
  });

  const RiderVehicleStatusSchema = z.object({
    hasVehicle: z.boolean(),
    isComplete: z.boolean(),
    vehicle: RiderVehicleDtoSchema.nullable(),
    onboardingVehicleChoice: z.string().nullable(),
    onboardingVehicleCategoryCode: z.string().nullable(),
    onboardingPrefill: z
      .object({
        registrationNumber: z.string().nullable(),
        vehicleChoice: z.string().nullable(),
        vehicleCategoryCode: z.string().nullable(),
        resolvedVehicleType: z.string().nullable(),
        vehicleTypeLabel: z.string().nullable(),
        suggestedAcType: z.enum(["AC", "Non-AC"]).nullable(),
        suggestedIsCommercial: z.boolean().nullable(),
      })
      .nullable(),
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
          vehicleCategoryCode: z.string().nullable().optional(),
          onboardingVehicleChoice: z.string().nullable().optional(),
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
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { upsertRiderVehicleForApp, parseVehicleDbError } = await import(
        "../../lib/rider-vehicle-app.js"
      );
      try {
        return await upsertRiderVehicleForApp(riderId, req.body as Parameters<typeof upsertRiderVehicleForApp>[1]);
      } catch (e) {
        const message = e instanceof Error ? e.message : parseVehicleDbError(e);
        return reply.status(400).send({ error: message });
      }
    },
  );

  // Read current duty status (source of truth for dispatch eligibility).
  app.get(
    "/duty",
    {
      schema: {
        response: {
          200: z.object({
            isOnDuty: z.boolean(),
            allowedServiceTypes: z.array(z.string()),
            blockedServiceTypes: z.array(z.string()).optional(),
            accountRestricted: z.boolean().optional(),
            allServicesBlacklisted: z.boolean().optional(),
            lastUpdated: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const userId = req.auth!.sub;
      const riderIdMatch = userId.match(/usr_(\d+)/);
      if (!riderIdMatch) {
        return {
          isOnDuty: false,
          allowedServiceTypes: [],
          lastUpdated: new Date().toISOString(),
        };
      }
      const riderId = parseInt(riderIdMatch[1]!, 10);
      const { syncRiderDutyWithRestrictions } = await import(
        "../../lib/rider-account-restrictions.js"
      );

      const duty = await syncRiderDutyWithRestrictions(riderId);

      return {
        isOnDuty: duty.isOnDuty,
        allowedServiceTypes: duty.allowedServiceTypes,
        blockedServiceTypes: duty.blockedServiceTypes.length
          ? duty.blockedServiceTypes
          : undefined,
        accountRestricted: duty.accountRestricted,
        allServicesBlacklisted: duty.allServicesBlacklisted,
        lastUpdated: duty.lastUpdated,
      };
    }
  );

  // Update duty status (go online/offline). When going online, blacklisted services are excluded so rider can only be online for required services.
  app.put(
    "/duty",
    {
      schema: {
        body: z.object({
          isOnDuty: z.boolean(),
          serviceTypes: z.array(z.enum(["food", "parcel", "person_ride"])).optional(),
          lat: z.number().optional(),
          lon: z.number().optional(),
          deviceId: z.string().optional(),
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

      if (rider.status === "BLOCKED" || rider.status === "BANNED") {
        return reply.status(403).send({
          error: "ACCOUNT_RESTRICTED",
          message: "You cannot go online. Your account is restricted.",
        });
      }

      const body = req.body as {
        isOnDuty: boolean;
        serviceTypes?: ("food" | "parcel" | "person_ride")[];
        lat?: number;
        lon?: number;
        deviceId?: string;
      };
      const isOnDuty = body.isOnDuty;
      const now = new Date();
      const deviceId = body.deviceId ?? req.auth?.device_id ?? null;

      if (!isOnDuty) {
        await recordRiderDutyLog({
          riderId,
          status: "OFF",
          serviceTypes: [],
          source: "rider_app",
          deviceId,
          lat: body.lat ?? null,
          lon: body.lon ?? null,
          metadata: { trigger: "duty_toggle" },
        });
        if (body.lat != null && body.lon != null) {
          const { buildZoneKey } = await import("../weather/weather.classify.js");
          const { leaveZonePresence } = await import("../weather/weather.zones-active.js");
          const { zoneKey } = buildZoneKey(body.lat, body.lon, "", null);
          leaveZonePresence(zoneKey, "rider", String(riderId));
        }
        return {
          isOnDuty: false,
          allowedServiceTypes: [],
          lastUpdated: now.toISOString(),
        };
      }

      if (!body.serviceTypes?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(400).send({
          error: "SERVICE_TYPES_REQUIRED",
          message: "Select at least one service before going online.",
        });
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

      const { getRiderActiveVehicleProfile } = await import("../../lib/order-assignment-engine.js");
      const { filterDispatchServicesForRiderProfile } = await import(
        "../../lib/rider-dispatch-service-rules.js"
      );
      const { resolveAssignedDispatchServicesForProfile, filterDispatchServicesByVehicleAssignments } =
        await import("../../lib/rider-vehicle-type-service-assignments.js");
      const vehicleProfile = await getRiderActiveVehicleProfile(riderId);
      const assignmentServices = await resolveAssignedDispatchServicesForProfile(vehicleProfile);
      const hasVehicleProfile =
        vehicleProfile.vehicleTypes.some((v) => v.trim().length > 0) ||
        vehicleProfile.vehicleCategories.some((c) => c.trim().length > 0);
      const vehicleServices = hasVehicleProfile
        ? assignmentServices
        : assignmentServices.length > 0
          ? assignmentServices
          : (vehicleStatus.vehicle?.serviceTypes ?? []).filter(
              (s): s is "food" | "parcel" | "person_ride" =>
                s === "food" || s === "parcel" || s === "person_ride"
            );
      const requestedServices = body.serviceTypes.filter((s) => vehicleServices.includes(s));

      if (requestedServices.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(400).send({
          error: "NO_VALID_SERVICE_TYPES",
          message: "None of the selected services are enabled for your vehicle.",
        });
      }

      const dutyServices = filterDispatchServicesForRiderProfile(
        requestedServices as ("food" | "parcel" | "person_ride")[],
        vehicleProfile
      );
      const vehicleFiltered = await filterDispatchServicesByVehicleAssignments(dutyServices, {
        vehicleTypes: vehicleProfile.vehicleTypes,
        vehicleCategories: vehicleProfile.vehicleCategories,
      });

      if (vehicleFiltered.length === 0) {
        return reply.status(403).send({
          error: "NO_VEHICLE_SERVICES",
          message: "Your vehicle is not enabled for any dispatch services.",
        });
      }

      const { getRiderDispatchBlockSnapshot, isDispatchServiceBlocked } = await import(
        "../../lib/rider-account-restrictions.js"
      );
      const restrictionSnapshot = await getRiderDispatchBlockSnapshot(riderId);

      const allowed: string[] = [];
      const blocked: string[] = [];
      for (const service of vehicleFiltered) {
        if (isDispatchServiceBlocked(service, restrictionSnapshot)) {
          blocked.push(service);
        } else {
          allowed.push(service);
        }
      }

      if (allowed.length === 0) {
        return reply.status(403).send({
          error: "ALL_SERVICES_BLOCKED",
          message:
            restrictionSnapshot.allServicesBlocked || restrictionSnapshot.accountRestricted
              ? "You cannot go online — account is restricted. Add balance to wallet to unlock."
              : "You cannot go online — all requested services are restricted.",
          blockedServiceTypes: blocked,
        });
      }

      const { isRiderSubscriptionDispatchBlocked } = await import(
        "../../lib/rider-subscription-wallet.js"
      );
      if (await isRiderSubscriptionDispatchBlocked(riderId)) {
        return reply.status(403).send({
          error: "SUBSCRIPTION_DUTY_STOPPED",
          message:
            "Duty stopped due to subscription penalty. Clear dues to go online.",
        });
      }

      await recordRiderDutyLog({
        riderId,
        status: "ON",
        serviceTypes: allowed as ("food" | "parcel" | "person_ride")[],
        source: "rider_app",
        deviceId,
        lat: body.lat ?? null,
        lon: body.lon ?? null,
        metadata: {
          trigger: "duty_toggle",
          requestedServices: dutyServices,
          blockedServices: blocked,
        },
      });

      if (body.lat != null && body.lon != null && Number.isFinite(body.lat) && Number.isFinite(body.lon)) {
        const { resolveZoneWeather } = await import("../weather/weather.service.js");
        void resolveZoneWeather({
          lat: body.lat,
          lng: body.lon,
          trigger: "rider_online",
          actorId: String(riderId),
          actorType: "rider",
        }).catch(() => undefined);
      }

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
            panNumber: z.string().nullable(),
            panVerified: z.boolean(),
            dob: z.string().nullable(),
            dlNumber: z.string().nullable(),
            dlFrontUrl: z.string().nullable(),
            dlBackUrl: z.string().nullable(),
            dlVerified: z.boolean(),
            dlVerifiedData: z.record(z.string(), z.unknown()).nullable(),
            rcNumber: z.string().nullable(),
            rcFrontUrl: z.string().nullable(),
            rcVerified: z.boolean(),
            rcVerifiedData: z.record(z.string(), z.unknown()).nullable(),
            onboardingProgress: z.record(z.string(), z.string()),
            lastCompletedStep: z.string().nullable(),
            nextRequiredStep: z.string().nullable(),
            onboardingProgressPct: z.number(),
            macroStepIndex: z.number(),
            paymentCompleted: z.boolean(),
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
        return (reply as any).code(400).send({ error: "Invalid rider ID" });
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

      // Progress heals illegal APPROVAL-without-payment before status mapping.
      const progress = await getRiderOnboardingProgress(parsedId);

      const resolved = await resolveRiderOnboardingStatusForApp(parsedId, {
        syncActivation: false,
      });
      if (!resolved) {
        return reply.code(404).send({ error: "Rider not found" });
      }

      const { rider, onboardingStatus, approvalStatus, paymentCompleted } = resolved;

      const { getRiderAverageRating } = await import("../../lib/rider-average-rating.js");
      const rating = await getRiderAverageRating(rider.id);

      const { toAbsoluteClientMediaUrl } = await import("../../utils/publicAttachmentUrl.js");

      const tokenPhone =
        typeof req.auth?.phone === "string" ? req.auth.phone.trim() : "";

      // Defense in depth — never expose pending_approval without completed payment.
      const paid = progress.paymentCompleted || paymentCompleted;
      const appOnboardingStatus =
        onboardingStatus === "pending_approval" && !paid
          ? "in_progress"
          : onboardingStatus;

      return {
        riderId: rider.id.toString(),
        name: rider.name ?? null,
        mobile: rider.mobile?.trim() || tokenPhone || "",
        referralCode: rider.referralCode?.trim() || null,
        preferredLanguage: rider.defaultLanguage ?? "en",
        selfieUrl: toAbsoluteClientMediaUrl(rider.selfieUrl),
        onboardingStatus: appOnboardingStatus,
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
        panNumber: progress.panNumber,
        panVerified: progress.panVerified,
        dob: progress.dob,
        dlNumber: progress.dlNumber,
        dlFrontUrl: toAbsoluteClientMediaUrl(progress.dlFrontUrl),
        dlBackUrl: toAbsoluteClientMediaUrl(progress.dlBackUrl),
        dlVerified: progress.dlVerified,
        dlVerifiedData: progress.dlVerifiedData,
        rcNumber: progress.rcNumber,
        rcFrontUrl: toAbsoluteClientMediaUrl(progress.rcFrontUrl),
        rcVerified: progress.rcVerified,
        rcVerifiedData: progress.rcVerifiedData,
        onboardingProgress: progress.onboardingProgress,
        lastCompletedStep: progress.lastCompletedStep,
        nextRequiredStep: progress.nextRequiredStep,
        onboardingProgressPct: progress.onboardingProgressPct,
        macroStepIndex: progress.macroStepIndex,
        paymentCompleted: paid,
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

        if (docType === "aadhaar") {
          const rawAadhaarPre = metadata?.aadhaarNumber;
          if (typeof rawAadhaarPre === "string") {
            const digits = normalizeAadhaarDigits(rawAadhaarPre);
            if (digits && (await isAadhaarAlreadyRegistered(digits, riderId))) {
              throw new Error("Aadhar Already Registered , Please try with Diff one .");
            }
          }
        }

        if (docType === "pan") {
          const rawPan = metadata?.panNumber ?? metadata?.pan;
          if (typeof rawPan === "string") {
            const pan = normalizePan(rawPan);
            if (pan && (await isPanAlreadyRegistered(pan, riderId))) {
              throw new Error("PAN Already Registered , Please try with Diff one .");
            }
          }
        }

        if (docType === "dl") {
          const rawDl = metadata?.dlNumber;
          if (typeof rawDl === "string") {
            const dl = normalizeDlNumber(rawDl);
            if (dl && (await isDlAlreadyRegistered(dl, riderId))) {
              throw new Error("Driving License Already Registered , Please try with Diff one .");
            }
          }
        }

        if (docType === "rc") {
          const rawRc = metadata?.rcNumber;
          if (typeof rawRc === "string") {
            const rc = normalizeRcNumber(rawRc);
            if (rc && (await isRcAlreadyRegistered(rc, riderId))) {
              throw new Error("RC Already Registered , Please try with Diff one .");
            }
          }
        }

        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, docType as never)))
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

          const digilockerVerified =
            metadata?.digilockerVerified === true ||
            metadata?.aadhaarMaskingVerified === true ||
            metadata?.verificationMethod === "cashfree_digilocker" ||
            metadata?.verificationMethod === "cashfree_aadhaar_masking" ||
            String(fileUrl || "").includes("digilocker_verified") ||
            String(fileUrl || "").includes("aadhaar_masking_verified");

          const sideVerification = digilockerVerified
            ? {
                front: {
                  verified: true,
                  verificationStatus: "approved" as const,
                  verifiedAt: new Date().toISOString(),
                },
                back: {
                  verified: true,
                  verificationStatus: "approved" as const,
                  verifiedAt: new Date().toISOString(),
                },
              }
            : undefined;

          const nextMetadata = {
            ...(metadata || {}),
            ...(sideVerification ? { sideVerification } : {}),
          };

          const docUpdate: Record<string, unknown> = {
            fileUrl: storedFileUrl,
            r2Key: primaryKey || null,
            extractedName: extractedName || null,
            extractedDob: extractedDob || null,
            metadata: nextMetadata,
            verificationMethod: digilockerVerified ? "APP_VERIFIED" : "MANUAL_UPLOAD",
            updatedAt: new Date(),
          };
          if (digilockerVerified) {
            docUpdate.verified = true;
            docUpdate.verificationStatus = "auto_verified";
            docUpdate.verifiedAt = new Date();
            docUpdate.rejectedReason = null;
            docUpdate.requiresManualReview = false;
          }
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
                metadata: nextMetadata,
                verificationMethod: digilockerVerified ? "APP_VERIFIED" : "MANUAL_UPLOAD",
                verified: digilockerVerified,
                verificationStatus: digilockerVerified ? "auto_verified" : "pending",
                verifiedAt: digilockerVerified ? new Date() : null,
                requiresManualReview: digilockerVerified ? false : undefined,
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

          if (digilockerVerified) {
            try {
              const { maybeAutoVerifyRiderSelfie } = await import(
                "../../lib/rider-selfie-auto-verify.js"
              );
              await maybeAutoVerifyRiderSelfie(riderId);
            } catch (selfieErr) {
              console.warn(
                "[save-document aadhaar] selfie auto-verify failed:",
                (selfieErr as Error).message,
              );
            }
          }

          await deleteReplacedR2Keys(previousR2Keys, nextR2Keys());

          return {
            documentId,
            success: true,
          };
        }

        if (existing.length > 0) {
          const docNumber =
            docType === "dl" && typeof metadata?.dlNumber === "string"
              ? normalizeDlNumber(metadata.dlNumber)
              : docType === "rc" && typeof metadata?.rcNumber === "string"
                ? normalizeRcNumber(metadata.rcNumber)
                : docType === "pan" && typeof metadata?.panNumber === "string"
                  ? normalizePan(metadata.panNumber)
                  : null;
          const prevMeta =
            existing[0]!.metadata && typeof existing[0]!.metadata === "object"
              ? (existing[0]!.metadata as Record<string, unknown>)
              : {};
          const prevMethod = String(existing[0]!.verificationMethod || "").toUpperCase();
          const keepElectronic =
            existing[0]!.verified === true &&
            (prevMethod === "APP_VERIFIED" ||
              prevMethod.startsWith("CASHFREE_") ||
              prevMethod === "RAZORPAY_BANK" ||
              String(existing[0]!.verificationStatus || "").toLowerCase() === "auto_verified");
          const mergedMeta = {
            ...prevMeta,
            ...(metadata && typeof metadata === "object" ? metadata : {}),
            // Keep prior auto mismatch evidence for admin when rider uploads photos.
            ...(prevMeta.autoVerification && !keepElectronic
              ? { autoVerification: prevMeta.autoVerification, crossCheckFailed: true }
              : {}),
            ...(keepElectronic
              ? { photoAttachedAt: new Date().toISOString() }
              : { manualSubmissionAt: new Date().toISOString() }),
          };
          await db
            .update(riderDocuments)
            .set({
              fileUrl: storedFileUrl,
              r2Key: primaryKey || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              ...(docNumber ? { docNumber } : {}),
              metadata: mergedMeta,
              ...(keepElectronic
                ? {}
                : {
                    verificationMethod: "MANUAL_UPLOAD" as const,
                    requiresManualReview: true,
                    verified: false,
                    verificationStatus: "pending" as const,
                  }),
              updatedAt: new Date(),
            })
            .where(eq(riderDocuments.id, existing[0]!.id));
          documentId = existing[0]!.id;
        } else {
          const docNumber =
            docType === "dl" && typeof metadata?.dlNumber === "string"
              ? normalizeDlNumber(metadata.dlNumber)
              : docType === "rc" && typeof metadata?.rcNumber === "string"
                ? normalizeRcNumber(metadata.rcNumber)
                : docType === "pan" && typeof metadata?.panNumber === "string"
                  ? normalizePan(metadata.panNumber)
                  : null;
          const [newDoc] = await db
            .insert(riderDocuments)
            .values({
              riderId,
              docType: docType as never,
              fileUrl: storedFileUrl,
              r2Key: primaryKey || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              docNumber: docNumber || null,
              metadata: {
                ...(metadata && typeof metadata === "object" ? metadata : {}),
                manualSubmissionAt: new Date().toISOString(),
              },
              verificationMethod: "MANUAL_UPLOAD",
              requiresManualReview: true,
              verified: false,
              verificationStatus: "pending",
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

          // If Aadhaar (+ PAN when present) already electronic, auto-verify selfie.
          try {
            const { maybeAutoVerifyRiderSelfie } = await import(
              "../../lib/rider-selfie-auto-verify.js"
            );
            await maybeAutoVerifyRiderSelfie(riderId);
          } catch (selfieErr) {
            console.warn(
              "[save-document] selfie auto-verify failed:",
              (selfieErr as Error).message,
            );
          }
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

  // Update rider onboarding stage (safe client transitions only)
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
          400: z.object({
            error: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { riderId, stage } = req.body as {
        riderId: number;
        stage: "MOBILE_VERIFIED" | "KYC" | "PAYMENT" | "APPROVAL" | "ACTIVE";
      };
      const db = getDb();

      const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }
      const rider = riderRows[0]!;

      const { isAllowedClientStageTransition } = await import(
        "../../lib/rider-onboarding-stage-machine.js"
      );
      const { isOnboardingDocumentsCompleteForPayment } = await import(
        "../../lib/rider-onboarding-progress.js"
      );
      const docsReady =
        stage === "PAYMENT" ? await isOnboardingDocumentsCompleteForPayment(riderId) : false;

      if (
        !isAllowedClientStageTransition(rider.onboardingStage, stage, {
          docsReadyForPayment: docsReady,
        })
      ) {
        return (reply as any).code(400).send({
          error: `Illegal onboarding stage transition ${rider.onboardingStage} → ${stage}`,
        });
      }

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
    waitingEarning: z.number().optional(),
    surgeEarning: z.number().optional(),
    appliedSurges: z
      .array(z.object({ name: z.string(), amount: z.number() }))
      .optional(),
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
    pickupAcknowledged: z.boolean().optional(),
    pickupAcknowledgedAt: z.string().nullable().optional(),
    pickupWaitStartedAt: z.string().nullable().optional(),
    pickupWaitSeconds: z.number().nullable().optional(),
    pickupWaitFinalized: z.boolean().optional(),
    preparedAt: z.string().nullable().optional(),
    pickupTimerStartedAt: z.string().nullable().optional(),
    pickupTimerBudgetSeconds: z.number().nullable().optional(),
    pickupDurationSeconds: z.number().nullable().optional(),
    prepReadyByAt: z.string().nullable().optional(),
    acceptedAt: z.string().nullable().optional(),
    preparingAt: z.string().nullable().optional(),
    preparationTimeMinutes: z.number().nullable().optional(),
    prepDelayMinutes: z.number().nullable().optional(),
    customerName: z.string().nullable().optional(),
    customerPhone: z.string().nullable().optional(),
    customerPrimaryName: z.string().nullable().optional(),
    customerPrimaryPhone: z.string().nullable().optional(),
    customerAlternateName: z.string().nullable().optional(),
    customerAlternatePhone: z.string().nullable().optional(),
    pickupAddressGeocoded: z.string().optional(),
    dropAddressGeocoded: z.string().optional(),
    foodItems: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          variantName: z.string().nullable().optional(),
          customization: z.string().nullable().optional(),
        })
      )
      .optional(),
    deliveryInstructions: z.string().nullable().optional(),
    requiresUtensils: z.boolean().optional(),
    restaurantPhone: z.string().nullable().optional(),
    merchantFeedbackSubmitted: z.boolean().optional(),
    customerFeedbackSubmitted: z.boolean().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  adminRiderPaymentClearedAt: z.string().nullable().optional(),
  walletCreditPending: z.boolean().optional(),
  customerRating: z.number().nullable().optional(),
  passengerRating: z.number().nullable().optional(),
  cancellationPenaltyApplied: z.boolean().optional(),
  cancellationPenaltyAmount: z.number().nullable().optional(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
    "/food-pickup-verification-settings",
    {
      schema: {
        response: {
          200: z.object({
            barcodeEnabled: z.boolean(),
            otpEnabled: z.boolean(),
            verificationRequired: z.boolean(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { loadFoodPickupVerificationSettings } = await import(
        "../../lib/food-pickup-verification-settings.js"
      );
      return await loadFoodPickupVerificationSettings();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { getActiveOrdersForRider } = await import("./rider.orders.service.js");
      return getActiveOrdersForRider(riderId);
    }
  );

  app.get(
    "/orders/ride-payment-holds",
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              orderId: z.string(),
              formattedOrderId: z.string().nullable(),
              totalEarning: z.number(),
              passengerFare: z.number(),
              completedAt: z.string(),
            })
          ),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { getRidePaymentHoldsForRider } = await import("./rider.orders.service.js");
      return getRidePaymentHoldsForRider(riderId);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
          return (reply as any).status(code).send({ error: err.message || "Reject failed" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/orders/:id/offer-missed",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z
          .object({
            reason: z.string().optional(),
          })
          .optional(),
        response: {
          200: z.object({ ok: z.literal(true), recorded: z.boolean() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { reason?: string };
      try {
        const { missOrderOfferForRider } = await import("./rider.orders.service.js");
        return await missOrderOfferForRider(riderId, id, { reason: body.reason });
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const code = err.statusCode ?? 500;
        if (code >= 400 && code < 500) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (reply as any).status(code).send({ error: err.message || "Offer missed failed" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/dispatch-offer-stats",
    {
      schema: {
        response: {
          200: z.object({
            riderId: z.number(),
            offersTotal: z.number(),
            offersAccepted: z.number(),
            offersRejected: z.number(),
            offersMissed: z.number(),
            acceptRate: z.number().nullable(),
            lastOfferAt: z.string().nullable(),
            lastAcceptedAt: z.string().nullable(),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { getRiderDispatchOfferStats } = await import(
        "../../lib/rider-dispatch-assignment-audit.js"
      );
      return getRiderDispatchOfferStats(riderId);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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

  const riderGpsFieldsSchema = z.object({
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
  });
  const riderGpsBodySchema = riderGpsFieldsSchema.optional();
  const riderGpsWithTimestampBodySchema = riderGpsFieldsSchema
    .extend({ deviceTimestamp: z.string().optional() })
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
    "/orders/:id/merchant-pickup-feedback",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          rating: z.number().int().min(1).max(5).optional(),
          tags: z.array(z.string().min(1).max(64)).max(12).optional(),
          messages: z.array(z.string().min(1).max(200)).max(12).optional(),
          skipped: z.boolean().optional(),
        }),
        response: {
          200: RiderOrderSummarySchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as {
        rating?: number;
        tags?: string[];
        messages?: string[];
        skipped?: boolean;
      };
      try {
        const { submitRiderMerchantPickupFeedback } = await import("./rider.orders.service.js");
        return await submitRiderMerchantPickupFeedback(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
      }
    }
  );

  app.post(
    "/orders/:id/customer-delivery-feedback",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          rating: z.number().int().min(1).max(5).optional(),
          tags: z.array(z.string().min(1).max(64)).max(12).optional(),
          messages: z.array(z.string().min(1).max(200)).max(12).optional(),
          comment: z.string().max(2000).optional(),
          skipped: z.boolean().optional(),
        }),
        response: {
          200: RiderOrderSummarySchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as {
        rating?: number;
        tags?: string[];
        messages?: string[];
        comment?: string;
        skipped?: boolean;
      };
      try {
        const { submitRiderCustomerDeliveryFeedback } = await import("./rider.orders.service.js");
        return await submitRiderCustomerDeliveryFeedback(riderId, id, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        if (!err.statusCode || err.statusCode >= 500) {
          console.error("[customer-delivery-feedback]", err);
        }
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
          deviceTimestamp: z.string().optional(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        otp: string;
        lat?: number;
        lng?: number;
        deviceTimestamp?: string;
      };
      try {
        const { verifyPickupOtpForRider } = await import("./rider.orders.service.js");
        return await verifyPickupOtpForRider(riderId, id, body.otp, body);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        if (status >= 500) {
          req.log.error({ err, orderId: id, riderId }, "verify-pickup-otp failed");
        }
        if (status === 403) {
          return reply.status(403).send({ error: err.message || "Incorrect OTP" });
        }
        return reply.status(status as 409).send({ error: err.message || "Verification failed" });
      }
    }
  );

  app.post(
    "/orders/:id/acknowledge-food-pickup",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({}).optional(),
        response: {
          200: RiderOrderSummarySchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      try {
        const { acknowledgeFoodPickupForRider } = await import("./rider.orders.service.js");
        return await acknowledgeFoodPickupForRider(riderId, id);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
      }
    }
  );

  app.post(
    "/orders/:id/mark-food-pickup",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: riderGpsWithTimestampBodySchema,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as {
        lat?: number;
        lng?: number;
        deviceTimestamp?: string;
      };
      try {
        const { markFoodPickupWithoutVerificationForRider } = await import(
          "./rider.orders.service.js"
        );
        return await markFoodPickupWithoutVerificationForRider(
          riderId,
          id,
          body,
          body.deviceTimestamp
        );
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        return reply.status(status as 409).send({ error: err.message || "Update failed" });
      }
    }
  );

  app.post(
    "/orders/:id/verify-pickup-barcode",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          barcode: z.string().min(1).max(256),
          lat: z.number().finite().optional(),
          lng: z.number().finite().optional(),
          deviceTimestamp: z.string().optional(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        barcode: string;
        lat?: number;
        lng?: number;
        deviceTimestamp?: string;
      };
      try {
        const { verifyFoodPickupBarcodeForRider } = await import("./rider.orders.service.js");
        return await verifyFoodPickupBarcodeForRider(
          riderId,
          id,
          body.barcode,
          body,
          body.deviceTimestamp
        );
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        const status = err.statusCode ?? 500;
        if (status === 403) {
          return reply.status(403).send({ error: err.message || "Invalid barcode" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
    "/orders/:id/ride/confirm-cash-collected",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            ok: z.literal(true),
            alreadySettled: z.boolean(),
            orderId: z.string(),
            customerBill: z.number(),
            companyReceivable: z.number(),
            walletDebit: z.number(),
            walletBalanceAfter: z.number().nullable(),
            settlementId: z.string(),
          }),
          400: z.object({ error: z.string(), code: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      try {
        const { confirmRideCashCollectionForRider } = await import(
          "../rides/ride-cash-payment.service.js"
        );
        return await confirmRideCashCollectionForRider({
          riderId,
          orderRef: id,
        });
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        const status = err.statusCode ?? 500;
        const payload: { error: string; code?: string } = {
          error: err.message || "Could not confirm cash",
        };
        if (err.code) payload.code = err.code;
        return reply.status(status as 409).send(payload);
      }
    }
  );

  app.post(
    "/orders/:id/ride/toll",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          amount: z.number().positive().max(5000),
          lat: z.number().finite().optional(),
          lng: z.number().finite().optional(),
          note: z.string().max(500).optional(),
          proofUrl: z.string().url().max(2048).optional(),
        }),
        response: {
          200: z.object({
            ok: z.literal(true),
            toll: z.object({
              id: z.number(),
              amount: z.number(),
              totalToll: z.number(),
              createdAt: z.string(),
            }),
          }),
          400: z.object({ error: z.string(), code: z.string().optional() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        amount: number;
        lat?: number;
        lng?: number;
        note?: string;
        proofUrl?: string;
      };
      try {
        const sql = (await import("../../db/client.js")).getSql();
        let orderCoreId: number | null = null;
        const asNum = Number(id);
        if (Number.isFinite(asNum) && asNum > 0) {
          orderCoreId = asNum;
        } else {
          const rows = await sql<Array<{ id: number }>>`
            SELECT id FROM orders_core
            WHERE order_id = ${id} OR formatted_order_id = ${id}
            LIMIT 1
          `;
          orderCoreId = rows[0]?.id != null ? Number(rows[0].id) : null;
        }
        if (orderCoreId == null) {
          return reply.status(404).send({ error: "Order not found" });
        }
        const { addRideTollEvent, sumRideTollAmount } = await import(
          "../rides/pricing/rideToll.service.js"
        );
        const toll = await addRideTollEvent({
          orderCoreId,
          riderId,
          amount: body.amount,
          lat: body.lat,
          lng: body.lng,
          note: body.note,
          proofUrl: body.proofUrl,
        });
        const totalToll = await sumRideTollAmount(orderCoreId);
        // Persist toll total onto billing snapshot for settlement.
        await sql`
          UPDATE orders_core
          SET billing_snapshot = COALESCE(billing_snapshot, '{}'::jsonb) || ${JSON.stringify({
            toll_charge: totalToll,
            toll_charges: totalToll,
          })}::jsonb,
              updated_at = NOW()
          WHERE id = ${orderCoreId}
        `;
        try {
          const { recordRideBillingActivity } = await import(
            "../rides/settlement/rideBillingActivity.js"
          );
          await recordRideBillingActivity({
            orderCoreId,
            riderId,
            eventType: "TOLL_ADDED",
            amount: toll.amount,
            summary: `Toll added ₹${toll.amount}`,
            payload: { tollId: toll.id, totalToll },
            actorType: "rider",
            actorId: String(riderId),
          });
        } catch {
          /* ignore */
        }
        return {
          ok: true as const,
          toll: {
            id: toll.id,
            amount: toll.amount,
            totalToll,
            createdAt: toll.createdAt,
          },
        };
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        const status = err.statusCode ?? 500;
        const payload: { error: string; code?: string } = {
          error: err.message || "Could not add toll",
        };
        if (err.code) payload.code = err.code;
        return reply.status(status as 400).send(payload);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
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
        return (reply as any).status(500).send({ error: safeMessage });
      }
    }
  );

  const partnerChatMessageSchema = z.object({
    id: z.number(),
    senderType: z.enum(["CUSTOMER", "RIDER", "SYSTEM"]),
    body: z.string(),
    createdAt: z.string(),
    isMine: z.boolean(),
  });

  const partnerChatListResponseSchema = z.object({
    messages: z.array(partnerChatMessageSchema),
    chatClosed: z.boolean(),
  });

  const partnerChatSendBodySchema = z.object({
    body: z.string().trim().min(1).max(500),
  });

  const partnerChatUnreadResponseSchema = z.object({
    unreadCount: z.number().int().nonnegative(),
    chatClosed: z.boolean(),
  });

  app.get<{ Params: { id: string } }>(
    "/orders/:id/partner-chat/unread",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: partnerChatUnreadResponseSchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      try {
        const { getOrderPartnerChatUnreadForRider } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await getOrderPartnerChatUnreadForRider(riderId, id);
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        const msg = String(e);
        if (msg.includes("order_partner_chat_messages") && /does not exist|42P01/i.test(msg)) {
          return reply.send({ unreadCount: 0, chatClosed: false });
        }
        throw e;
      }
    }
  );

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    "/orders/:id/partner-chat/messages",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ since: z.string().optional() }),
        response: {
          200: partnerChatListResponseSchema,
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const since = (req.query as { since?: string }).since;
      try {
        const { listOrderPartnerChatForRider } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await listOrderPartnerChatForRider(riderId, id, since);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        if (err.statusCode === 409) {
          return reply.status(409).send({ error: err.message, code: err.code });
        }
        throw e;
      }
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof partnerChatSendBodySchema> }>(
    "/orders/:id/partner-chat/messages",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: partnerChatSendBodySchema,
        response: {
          200: partnerChatMessageSchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = partnerChatSendBodySchema.parse(req.body ?? {});
      try {
        const { sendOrderPartnerChatFromRider } = await import(
          "../../lib/order-partner-chat.service.js"
        );
        return await sendOrderPartnerChatFromRider(riderId, id, body.body);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        if (err.statusCode === 400) {
          return reply.status(400).send({ error: err.message });
        }
        if (err.statusCode === 404) {
          return reply.status(404).send({ error: err.message || "Order not found" });
        }
        if (err.statusCode === 409) {
          return reply.status(409).send({ error: err.message, code: err.code });
        }
        throw e;
      }
    }
  );

  app.get(
    "/orders/:id/cancellation-penalty-preview",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({
          reasonCode: z.string().min(1).max(120),
        }),
        response: {
          200: z.object({
            ok: z.literal(true),
            appliesPenalty: z.boolean(),
            penaltyAmount: z.coerce.number(),
            ledgerTitle: z.string(),
            ledgerDescription: z.string(),
            scenarioCode: z.string().nullable(),
            catalogReasonId: z.coerce.number().nullable(),
            reasonLabel: z.string().nullable(),
            skipped: z.string().optional(),
          }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const qs = req.query as { reasonCode?: string };
      const reasonCode = qs.reasonCode?.trim() ?? "";
      if (!reasonCode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(400).send({ error: "reasonCode is required" });
      }
      const { previewRiderAppCancellationPenalty } = await import(
        "../../lib/rider-cancellation-penalty.service.js"
      );
      try {
        const preview = await previewRiderAppCancellationPenalty({
          riderId,
          orderRef: id,
          reasonCode,
        });
        return { ok: true as const, ...preview };
      } catch (e) {
        req.log.error(e, "cancellation-penalty-preview failed");
        return {
          ok: true as const,
          appliesPenalty: false,
          penaltyAmount: 0,
          ledgerTitle: "",
          ledgerDescription: "",
          scenarioCode: null,
          catalogReasonId: null,
          reasonLabel: null,
          skipped: "preview_failed",
        };
      }
    }
  );

  app.get(
    "/cancellation-reasons",
    {
      schema: {
        querystring: z.object({
          serviceType: z.enum(["food", "person_ride", "parcel", "ride"]).optional(),
          attribute: z.string().max(32).optional(),
        }),
        response: {
          200: z.object({
            ok: z.literal(true),
            reasons: z.array(
              z.object({
                id: z.coerce.number(),
                attribute: z.string(),
                label: z.string(),
                reasonCode: z.string(),
                sortOrder: z.coerce.number(),
                serviceType: z.string().nullable(),
              })
            ),
          }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const qs = req.query as { serviceType?: string; attribute?: string };
      const attribute = qs.attribute?.trim().toUpperCase() || "RIDER";
      const rows = await listRiderAppCancellationReasons({
        serviceType: qs.serviceType,
      });
      const reasons = rows.filter(
        (r) => String(r.attribute ?? "").trim().toUpperCase() === attribute
      );
      return { ok: true as const, reasons };
    }
  );

  app.post(
    "/orders/:id/cancel-assigned",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          reasonCode: z.string().min(1).max(120),
          reasonText: z.string().max(500).optional(),
        }),
        response: {
          200: z.object({
            ok: z.literal(true),
            penaltyApplied: z.boolean().optional(),
            penaltyAmount: z.number().optional(),
          }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const riderId = parseRiderIdFromAuth(req.auth!.sub);
      if (riderId == null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).status(403).send({ error: "Invalid rider session" });
      }
      const { id } = req.params as { id: string };
      const body = req.body as { reasonCode: string; reasonText?: string };
      try {
        const { cancelAssignedOrderForRider } = await import("./rider.orders.service.js");
        return await cancelAssignedOrderForRider(riderId, id, body);
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


