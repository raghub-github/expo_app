import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  RiderLocationPingResponseSchema,
  RiderLocationPingSchema,
  RiderProfileSchema,
  type RiderLocationPing,
} from "@gatimitra/contracts";
import { desc, eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { auth } from "../../plugins/auth.js";
import { getDb } from "../../db/client.js";
import { riderLocationEvents, riders, riderDocuments } from "../../db/schema.js";
import { scoreLocationPing, type LocationPoint } from "./fraud.js";

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
          extractedName: z.string().optional(),
          extractedDob: z.string().optional(), // ISO date string
          metadata: z.record(z.any()).optional(),
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
      const { riderId, docType, fileUrl, extractedName, extractedDob, metadata } = req.body;
      const db = getDb();

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
            extractedName: extractedName || null,
            extractedDob: extractedDob || null,
            metadata: metadata || null,
            updatedAt: new Date(),
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
            extractedName: extractedName || null,
            extractedDob: extractedDob || null,
            metadata: metadata || null,
            verificationStatus: "PENDING",
          })
          .returning({ id: riderDocuments.id });
        documentId = newDoc!.id;
      }

      // If Aadhaar document, update rider table with name and DOB
      if (docType === "aadhaar" && (extractedName || extractedDob)) {
        const updateData: { name?: string; dob?: Date } = {};
        if (extractedName) updateData.name = extractedName;
        if (extractedDob) updateData.dob = new Date(extractedDob);
        
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
      const { riderId, stage } = req.body;
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
}


