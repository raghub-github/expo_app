import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  RiderLocationPingResponseSchema,
  RiderLocationPingSchema,
  RiderProfileSchema,
  type RiderLocationPing,
} from "@gatimitra/contracts";
import { desc, eq, and, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { auth } from "../../plugins/auth.js";
import { getDb } from "../../db/client.js";
import {
  riderLocationEvents,
  riders,
  riderDocuments,
  blacklistHistory,
  dutyLogs,
  riderLiveLocations,
  riderLocationHistory,
  orderRiderTracking,
} from "../../db/schema.js";
import { scoreLocationPing, type LocationPoint } from "./fraud.js";
import { getR2SignedUrl, deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";
import { getEnv } from "../../config/env.js";

export async function riderRoutes(app: FastifyInstance) {
  // All rider endpoints require rider auth (later: enforce role claim).
  await app.register(auth, { required: true });

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

      await db
        .insert(riderLiveLocations)
        .values({
          riderId,
          latitude: String(body.lat),
          longitude: String(body.lng),
          speedKmh: body.speed != null ? String(body.speed) : null,
          heading: body.heading != null ? String(body.heading) : null,
          accuracyMeters: body.accuracy != null ? String(body.accuracy) : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: riderLiveLocations.riderId,
          set: {
            latitude: String(body.lat),
            longitude: String(body.lng),
            speedKmh: body.speed != null ? String(body.speed) : null,
            heading: body.heading != null ? String(body.heading) : null,
            accuracyMeters: body.accuracy != null ? String(body.accuracy) : null,
            updatedAt: now,
          },
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
        response: { 200: RiderProfileSchema },
      },
    },
    async (req) => {
      // TODO: Fetch from DB using Drizzle + RLS-safe patterns.
      // Placeholder response for end-to-end wiring (app auth + me call).
      const riderId = `rid_${req.auth!.sub}`;
      return {
        riderId,
        name: "Rider",
        city: "Unknown",
        preferredLanguage: "en",
        approvalStatus: "DRAFT",
      };
    },
  );

  // Update duty status (go online/offline). When going online, blacklisted services are excluded so rider can only be online for allowed services.
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
      const requestedServices = body.serviceTypes ?? ["food", "parcel", "person_ride"];
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
            onboardingStatus: z.string(),
            approvalStatus: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.params as { riderId: string };
      const db = getDb();

      // Convert string riderId to integer if needed, or query by mobile if it's a phone-based ID
      const riderRows = await db.select().from(riders).where(eq(riders.id, parseInt(riderId) || 0)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      const rider = riderRows[0]!;
      
      // Map onboardingStage enum to response format
      const onboardingStatusMap: Record<string, string> = {
        "MOBILE_VERIFIED": "not_started",
        "KYC": "in_progress",
        "PAYMENT": "in_progress",
        "APPROVAL": "pending_approval",
        "ACTIVE": "approved",
      };

      // Map kycStatus enum to response format
      const approvalStatusMap: Record<string, string> = {
        "PENDING": "DRAFT",
        "REVIEW": "DRAFT",
        "APPROVED": "APPROVED",
        "REJECTED": "REJECTED",
      };

      return {
        riderId: rider.id.toString(),
        onboardingStatus: onboardingStatusMap[rider.onboardingStage] || "not_started",
        approvalStatus: approvalStatusMap[rider.kycStatus] || "DRAFT",
      };
    },
  );

  // Save document to rider_documents table
  app.post(
    "/onboarding/save-document",
    {
      schema: {
        body: z.object({
          riderId: z.number(),
          docType: z.enum(["aadhaar", "pan", "dl", "rc", "selfie"]),
          fileUrl: z.string(), // Signed URL from R2
          r2Key: z.string().optional(), // R2 storage key - allows URL regeneration
          extractedName: z.string().optional(),
          extractedDob: z.string().optional(), // ISO date string
          metadata: z.record(z.string(), z.unknown()).optional(),
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
      const { riderId, docType, fileUrl, r2Key, extractedName, extractedDob, metadata } = req.body as {
        riderId: number;
        docType: "aadhaar" | "pan" | "dl" | "rc" | "selfie";
        fileUrl: string;
        r2Key?: string;
        extractedName?: string;
        extractedDob?: string;
        metadata?: Record<string, unknown>;
      };
      const db = getDb();

      // Extract R2 key for rollback if needed
      const keyForRollback = r2Key || extractKeyFromSignedUrl(fileUrl);

      try {
        // Verify rider exists
        const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
        if (riderRows.length === 0) {
          throw new Error("Rider not found");
        }

        // Check if document already exists for this rider and type
        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, docType)))
          .limit(1);

        let documentId: number;

        if (existing.length > 0) {
          // Update existing document
          await db
            .update(riderDocuments)
            .set({
              fileUrl,
              r2Key: r2Key || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              metadata: metadata || null,
            })
            .where(eq(riderDocuments.id, existing[0]!.id));
          documentId = existing[0]!.id;
        } else {
          // Insert new document
          const [newDoc] = await db
            .insert(riderDocuments)
            .values({
              riderId,
              docType,
              fileUrl,
              r2Key: r2Key || null,
              extractedName: extractedName || null,
              extractedDob: extractedDob || null,
              metadata: metadata || null,
            })
            .returning({ id: riderDocuments.id });
          documentId = newDoc!.id;
        }

        // If Aadhaar document, update rider table with name and DOB
        if (docType === "aadhaar" && (extractedName || extractedDob)) {
          const updateData: { name?: string; dob?: string } = {};
          if (extractedName) updateData.name = extractedName;
          if (extractedDob) {
            const d = new Date(extractedDob);
            updateData.dob = Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
          }
          
          await db
            .update(riders)
            .set({
              ...updateData,
              updatedAt: new Date(),
            })
            .where(eq(riders.id, riderId));
        }

        return {
          documentId,
          success: true,
        };
      } catch (error) {
        // Rollback: Delete from R2 if DB save failed
        if (keyForRollback) {
          try {
            await deleteFromR2(keyForRollback);
            console.log(`[Rollback] Deleted R2 file: ${keyForRollback}`);
          } catch (rollbackError) {
            console.error(`[Rollback] Failed to delete R2 file ${keyForRollback}:`, rollbackError);
            // Don't throw - we want the original error to be returned
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
}


