import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import {
  OtpRequestSchema,
  OtpRequestResponseSchema,
  OtpVerifySchema,
  FirebaseSessionExchangeSchema,
  SessionSchema,
  type FirebaseSessionExchange,
  type OtpVerify,
} from "@gatimitra/contracts";
import { getEnv } from "../../config/env.js";
import { issueSupabaseCompatibleJwt } from "./jwt.js";
import { verifyFirebaseIdToken } from "./firebaseAdmin.js";
import { getDb, getSql } from "../../db/client.js";
import { riders } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";

/**
 * Auth boundary rules:
 * - Mobile app calls backend for OTP and session.
 * - Mobile app NEVER calls MSG91 directly.
 * - Backend issues a Supabase-compatible JWT (for RLS + Realtime) without exposing signing secrets.
 *
 * NOTE: OTP provider is stubbed here; integrate MSG91 in `otp.provider.ts`.
 */
export async function authRoutes(app: FastifyInstance) {
  const env = getEnv();

  // Dev-only in-memory OTP store. In production, use Redis/DB.
  const otpStore = new Map<
    string,
    { phoneE164: string; otp: string; expiresAtMs: number; attempts: number }
  >();

  /**
   * Dev-only auth flow: exchange Firebase ID token (from Firebase Phone Auth)
   * for a backend-issued Supabase-compatible session JWT.
   */
  app.post(
    "/firebase/session",
    {
      schema: {
        body: FirebaseSessionExchangeSchema,
        response: { 200: SessionSchema },
      },
    },
    async (req) => {
      const { idToken, deviceId } = FirebaseSessionExchangeSchema.parse(req.body) as FirebaseSessionExchange;
      const decoded = await verifyFirebaseIdToken(env, idToken);

      const phoneE164 = decoded.phone_number;
      if (!phoneE164) {
        throw new Error("Firebase token missing phone_number claim");
      }

      // In production, derive from DB and map Firebase uid -> userId.
      const userId = `usr_${ulid()}`;

      const expiresInSec = 60 * 60 * 6; // 6 hours (rotate/refresh later)
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;

      const accessToken = await issueSupabaseCompatibleJwt({
        jwtSecret: env.SUPABASE_JWT_SECRET,
        sub: userId,
        role: "rider",
        phoneE164,
        deviceId,
        exp: expiresAt,
      });

      return {
        accessToken,
        expiresAt,
        role: "rider",
        userId,
      };
    },
  );

  app.post(
    "/otp/request",
    {
      schema: {
        body: OtpRequestSchema,
        response: { 200: OtpRequestResponseSchema },
      },
    },
    async (req) => {
      const { phoneE164 } = OtpRequestSchema.parse(req.body);
      const requestId = ulid();
      const expiresInSec = env.MSG91_OTP_EXPIRY_SEC;

      // Generate a 6-digit OTP (dev).
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(requestId, {
        phoneE164,
        otp,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        attempts: 0,
      });

      return {
        requestId,
        expiresInSec,
        otp: env.NODE_ENV === "production" ? undefined : otp,
      };
    },
  );

  app.post(
    "/otp/verify",
    {
      schema: {
        body: OtpVerifySchema,
        response: {
          200: SessionSchema,
          400: z.object({ error: z.string() }),
          429: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { requestId, phoneE164, deviceId, otp } = OtpVerifySchema.parse(req.body) as OtpVerify;

      const entry = otpStore.get(requestId);
      if (!entry) return reply.code(400).send({ error: "invalid_request_id" });
      if (entry.phoneE164 !== phoneE164) return reply.code(400).send({ error: "phone_mismatch" });
      if (Date.now() > entry.expiresAtMs) {
        otpStore.delete(requestId);
        return reply.code(400).send({ error: "otp_expired" });
      }

      entry.attempts += 1;
      if (entry.attempts > 5) {
        otpStore.delete(requestId);
        return reply.code(429).send({ error: "too_many_attempts" });
      }

      if (entry.otp !== otp) return reply.code(400).send({ error: "invalid_otp" });
      otpStore.delete(requestId);

      const db = getDb();
      const sql = getSql();

      // Check if riders table exists first
      try {
        const tableCheck = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'riders'
          );
        `;
        
        if (!tableCheck[0]?.exists) {
          throw new Error("Database table 'riders' does not exist. Please run the database migration: backend/drizzle/0002_enterprise_rider_schema.sql");
        }
      } catch (checkError: any) {
        // If the check itself fails, it might be a connection issue
        if (checkError?.message?.includes("does not exist")) {
          throw checkError;
        }
        // Otherwise, continue - the table might exist but we can't check it
        console.warn("Could not verify table existence:", checkError?.message);
      }

      // Find or create rider by mobile number
      // In this app, everyone is a rider - no separate users table
      let userId: string;
      let riderId: number;
      
      try {
        const existingRider = await db.select().from(riders).where(eq(riders.mobile, phoneE164)).limit(1);

        if (existingRider.length > 0) {
          // Rider exists - use their ID
          riderId = existingRider[0]!.id;
          userId = `usr_${riderId}`; // Generate consistent userId from rider ID for JWT
        } else {
          // Create new rider
          const newRider = await db.insert(riders).values({
            mobile: phoneE164,
            countryCode: "+91",
            defaultLanguage: "en",
            onboardingStage: "MOBILE_VERIFIED",
            kycStatus: "PENDING",
            status: "INACTIVE",
          }).returning({ id: riders.id });
          
          riderId = newRider[0]!.id;
          userId = `usr_${riderId}`; // Generate consistent userId from rider ID for JWT
        }
      } catch (dbError: any) {
        // Log the actual database error for debugging
        // postgres-js errors might have nested error objects
        const actualError = dbError?.cause || dbError?.error || dbError;
        const errorDetails = {
          message: actualError?.message || dbError?.message,
          code: actualError?.code || dbError?.code,
          detail: actualError?.detail || dbError?.detail,
          hint: actualError?.hint || dbError?.hint,
          severity: actualError?.severity || dbError?.severity,
          fullError: dbError,
        };
        console.error("Database error during OTP verify:", errorDetails);
        
        const errorCode = actualError?.code || dbError?.code;
        const errorMessage = actualError?.message || dbError?.message || "Unknown database error";
        
        // Check for common PostgreSQL error codes
        // postgres-js wraps errors, so check both the message and code
        const isTableMissing = errorCode === "42P01" || 
          errorMessage?.toLowerCase().includes("relation") && errorMessage?.toLowerCase().includes("riders") ||
          errorMessage?.toLowerCase().includes("does not exist") && errorMessage?.toLowerCase().includes("riders");
        
        const isColumnMissing = errorCode === "42703" || 
          (errorMessage?.toLowerCase().includes("column") && errorMessage?.toLowerCase().includes("does not exist"));
        
        const isTypeMissing = errorCode === "42804" || 
          (errorMessage?.toLowerCase().includes("type") && errorMessage?.toLowerCase().includes("does not exist")) ||
          (errorMessage?.toLowerCase().includes("enum") && errorMessage?.toLowerCase().includes("does not exist"));
        
        if (isTableMissing) {
          // Table does not exist
          throw new Error("Database table 'riders' does not exist. Please run the database migration. See: backend/drizzle/0002_enterprise_rider_schema.sql");
        } else if (isColumnMissing) {
          // Column does not exist
          throw new Error(`Database column error: ${actualError?.detail || errorMessage}. Please verify the database schema matches the migration.`);
        } else if (isTypeMissing) {
          // Type/enum does not exist
          throw new Error(`Database type/enum error: ${actualError?.detail || errorMessage}. Please ensure all enums are created. Run the migration: backend/drizzle/0002_enterprise_rider_schema.sql`);
        } else {
          // Generic error - check if it's likely a missing table issue
          if (errorMessage?.toLowerCase().includes("failed query") && errorMessage?.toLowerCase().includes("riders")) {
            throw new Error("Database query failed. The 'riders' table may not exist. Please run the database migration: backend/drizzle/0002_enterprise_rider_schema.sql");
          }
          // Generic error - provide detailed message
          throw new Error(`Database error: ${errorMessage}. Error code: ${errorCode || "N/A"}. Please check if the database migration has been run.`);
        }
      }

      const expiresInSec = 60 * 60 * 6; // 6 hours (rotate/refresh later)
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;

      const accessToken = await issueSupabaseCompatibleJwt({
        jwtSecret: env.SUPABASE_JWT_SECRET,
        sub: userId,
        role: "rider",
        phoneE164,
        deviceId,
        exp: expiresAt,
      });

      return {
        accessToken,
        expiresAt,
        role: "rider",
        userId,
        riderId: riderId.toString(),
      };
    },
  );

  // Protected routes (require rider session)
  await app.register(async (protectedApp) => {
    await protectedApp.register(auth, { required: true });

    // Check if mobile number exists and get rider status (backward compatible)
    protectedApp.post(
      "/check-mobile",
      {
        schema: {
          body: z.object({ phoneE164: z.string() }),
          response: {
            200: z.object({
              exists: z.boolean(),
              riderId: z.string().optional(),
              onboardingStatus: z
                .enum(["not_started", "in_progress", "pending_approval", "approved", "rejected"])
                .optional(),
            }),
          },
        },
      },
      async (req) => {
        const { phoneE164 } = z.object({ phoneE164: z.string() }).parse(req.body);
        const db = getDb();

        const riderRows = await db.select().from(riders).where(eq(riders.mobile, phoneE164)).limit(1);
        if (riderRows.length === 0) return { exists: false };

        const rider = riderRows[0]!;

        // Map onboardingStage enum to response format
        const onboardingStatusMap: Record<string, string> = {
          "MOBILE_VERIFIED": "not_started",
          "KYC": "in_progress",
          "PAYMENT": "in_progress",
          "APPROVAL": "pending_approval",
          "ACTIVE": "approved",
        };

        return { 
          exists: true, 
          riderId: rider.id.toString(), 
          onboardingStatus: onboardingStatusMap[rider.onboardingStage] || "not_started",
        };
      },
    );

    // Get current rider status (new endpoint)
    protectedApp.get(
      "/rider-status",
      {
        schema: {
          response: {
            200: z.object({
              exists: z.boolean(),
              riderId: z.string().optional(),
              userId: z.string(),
              onboardingStatus: z
                .enum(["not_started", "in_progress", "pending_approval", "approved", "rejected"])
                .optional(),
              approvalStatus: z.string().optional(),
            }),
          },
        },
      },
      async (req) => {
        const userId = req.auth!.sub;
        const db = getDb();

        // Extract rider ID from userId (format: usr_<riderId>)
        const riderIdMatch = userId.match(/usr_(\d+)/);
        if (!riderIdMatch) return { exists: false, userId };
        
        const riderId = parseInt(riderIdMatch[1]!);
        const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
        if (riderRows.length === 0) return { exists: false, userId };

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
          exists: true, 
          riderId: rider.id.toString(), 
          userId,
          onboardingStatus: onboardingStatusMap[rider.onboardingStage] || "not_started",
          approvalStatus: approvalStatusMap[rider.kycStatus] || "DRAFT",
        };
      },
    );

  });
}


