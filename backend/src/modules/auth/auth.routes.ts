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
import { sendOtpViaMsg91 } from "../../services/otp/msg91.js";
import { issueSupabaseCompatibleJwt } from "./jwt.js";
import { verifyFirebaseIdToken } from "./firebaseAdmin.js";
import { getDb, getSql } from "../../db/client.js";
import { riders, userProfiles, customers } from "../../db/schema.js";
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
   * Merchant partner Google sign-in: verify Google id_token, lookup by owner_email, return JWT + partner.
   */
  app.post(
    "/google",
    {
      schema: {
        body: z.object({ idToken: z.string().min(10), deviceId: z.string().min(6) }),
        response: {
          200: z.object({
            accessToken: z.string(),
            expiresAt: z.number(),
            role: z.string(),
            userId: z.string(),
            partner: z.object({
              parent: z.any(),
              childStores: z.array(z.any()),
            }),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          404: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const { idToken, deviceId } = z.object({ idToken: z.string(), deviceId: z.string() }).parse(req.body);
      try {
        const tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );
        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          req.log?.info?.({ status: tokenRes.status, err: errText }, "Google tokeninfo failed");
          return reply.code(400).send({ error: "invalid_google_token", message: "Google sign-in failed. Try again." });
        }
        const tokenData = (await tokenRes.json()) as { email?: string; sub?: string };
        const email = tokenData?.email?.trim();
        if (!email) {
          return reply.code(400).send({ error: "no_email", message: "Google account email not found." });
        }

        const sql = getSql();
        const tableCheck = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'merchant_parents'
          );
        `;
        if (!tableCheck[0]?.exists) {
          return reply.code(400).send({ error: "partner_not_found", message: "Partner registration is not available." });
        }

        const parentRows = await sql`
          SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
          FROM merchant_parents
          WHERE LOWER(TRIM(owner_email)) = LOWER(TRIM(${email}))
          LIMIT 1
        `;
        const parentRow = parentRows[0];
        if (!parentRow) {
          return reply.code(404).send({
            error: "partner_not_found",
            message: "No partner account found for this Google email. Sign up at partner.gatimitra.com",
          });
        }

        const parentId = Number(parentRow.id);
        const parentMerchantId = String(parentRow.parent_merchant_id);

        const storeRows = await sql`
          SELECT ms.id, ms.store_id, ms.store_name, ms.full_address, ms.approval_status,
                 msrp.current_step, msrp.total_steps, msrp.registration_status
          FROM merchant_stores ms
          LEFT JOIN merchant_store_registration_progress msrp ON msrp.store_id = ms.id AND msrp.parent_id = ${parentId}
          WHERE ms.parent_id = ${parentId}
          ORDER BY ms.created_at ASC
        `;

        let subscriptionRows: Array<{ store_id: number; payment_status: string; subscription_status: string }> = [];
        try {
          subscriptionRows = (await sql`
            SELECT store_id, payment_status, subscription_status
            FROM merchant_subscriptions
            WHERE merchant_id = ${parentId}
          `) as any;
        } catch {
          // table may not exist
        }

        const subByStore = new Map<number, { payment_status: string; subscription_status: string }>();
        for (const row of Array.isArray(subscriptionRows) ? subscriptionRows : []) {
          const sid = row?.store_id != null ? Number(row.store_id) : null;
          if (sid != null) subByStore.set(sid, { payment_status: String(row?.payment_status ?? "PENDING"), subscription_status: String(row?.subscription_status ?? "INACTIVE") });
        }

        const childStores = (storeRows as any[]).map((s) => {
          const step = s?.current_step != null ? Number(s.current_step) : 1;
          const total = s?.total_steps != null ? Number(s.total_steps) : 9;
          const sub = s?.id != null ? subByStore.get(Number(s.id)) : null;
          const paymentStatus = sub?.payment_status === "PAID" ? "Completed" : "Pending";
          return {
            id: s?.id,
            store_id: s?.store_id,
            store_name: s?.store_name,
            full_address: s?.full_address,
            approval_status: s?.approval_status ?? "DRAFT",
            current_step: step,
            total_steps: total,
            registration_status: s?.registration_status,
            payment_status: paymentStatus,
          };
        });

        const expiresInSec = 60 * 60 * 24 * 7;
        const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
        const accessToken = await issueSupabaseCompatibleJwt({
          jwtSecret: env.SUPABASE_JWT_SECRET,
          sub: parentMerchantId,
          role: "merchant",
          phoneE164: "", // not used for Google
          deviceId,
          exp: expiresAt,
        });

        const parent = {
          id: parentId,
          parent_merchant_id: parentMerchantId,
          parent_name: parentRow.parent_name,
          owner_name: parentRow.owner_name,
          owner_email: parentRow.owner_email ?? undefined,
          brand_name: parentRow.brand_name ?? undefined,
          registered_phone: parentRow.registered_phone,
        };

        req.log?.info?.({ parentMerchantId, email }, "Merchant partner signed in with Google");
        return reply.send({
          accessToken,
          expiresAt,
          role: "merchant",
          userId: parentMerchantId,
          partner: { parent, childStores },
        });
      } catch (err: any) {
        req.log?.error?.({ err }, "Google auth failed");
        return reply.code(500).send({ error: "google_auth_failed", message: err?.message ?? "Google sign-in failed." });
      }
    }
  );

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

      // 6-digit OTP (SMS standard; MSG91 and partnersite use 6).
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(requestId, {
        phoneE164,
        otp,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        attempts: 0,
      });

      // Send SMS via MSG91 when configured (same provider as partnersite).
      if (env.MSG91_AUTH_KEY) {
        const sendResult = await sendOtpViaMsg91({
          authKey: env.MSG91_AUTH_KEY,
          phoneE164,
          otp,
          templateId: env.MSG91_TEMPLATE_ID,
          senderId: env.MSG91_SENDER_ID,
          otpExpirySec: expiresInSec,
        });
        if (!sendResult.ok) {
          req.log?.warn?.({ phoneE164, requestId, err: sendResult.error }, "MSG91 send failed");
          // Do not fail the request – dev can still use OTP from logs; prod may retry or show generic error
        }
      }

      // Log OTP in dev so you can copy and sign in when SMS is not configured or fails.
      req.log?.info?.({ phoneE164, requestId, otp }, "OTP generated");
      if (env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("\n  [OTP] Phone:", phoneE164, "| OTP:", otp, "| RequestId:", requestId, "\n");
      }

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
      const body = OtpVerifySchema.parse(req.body) as OtpVerify & { appType?: string };
      const { requestId, phoneE164, deviceId, otp } = body;

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

      // Merchant partner app: look up merchant_parents by phone, return JWT + parent + child stores
      if (body.appType === "merchant") {
        try {
          const tableCheck = await sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'merchant_parents'
            );
          `;
          if (!tableCheck[0]?.exists) {
            return reply.code(400).send({ error: "partner_not_found", message: "Partner registration is not available." });
          }

          const normalizedPhone = phoneE164.replace(/\D/g, "");
          const parentRows = await sql`
            SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
            FROM merchant_parents
            WHERE registered_phone = ${phoneE164}
               OR registered_phone_normalized = ${normalizedPhone}
               OR registered_phone LIKE ${"%" + normalizedPhone.slice(-10)}
            LIMIT 1
          `;
          const parentRow = parentRows[0];
          if (!parentRow) {
            return reply.code(404).send({ error: "partner_not_found", message: "No partner account found for this phone. Sign up at partner.gatimitra.com" });
          }

          const parentId = Number(parentRow.id);
          const parentMerchantId = String(parentRow.parent_merchant_id);

          const storeRows = await sql`
            SELECT ms.id, ms.store_id, ms.store_name, ms.full_address, ms.approval_status,
                   msrp.current_step, msrp.total_steps, msrp.registration_status
            FROM merchant_stores ms
            LEFT JOIN merchant_store_registration_progress msrp ON msrp.store_id = ms.id AND msrp.parent_id = ${parentId}
            WHERE ms.parent_id = ${parentId}
            ORDER BY ms.created_at ASC
          `;

          let subscriptionRows: Array<{ store_id: number; payment_status: string; subscription_status: string }> = [];
          try {
            subscriptionRows = await sql`
              SELECT store_id, payment_status, subscription_status
              FROM merchant_subscriptions
              WHERE merchant_id = ${parentId}
            ` as any;
          } catch {
            // merchant_subscriptions may not exist
          }

          const subByStore = new Map<number, { payment_status: string; subscription_status: string }>();
          for (const row of Array.isArray(subscriptionRows) ? subscriptionRows : []) {
            const sid = row?.store_id != null ? Number(row.store_id) : null;
            if (sid != null) subByStore.set(sid, { payment_status: String(row?.payment_status ?? "PENDING"), subscription_status: String(row?.subscription_status ?? "INACTIVE") });
          }

          const childStores = (storeRows as any[]).map((s) => {
            const step = s?.current_step != null ? Number(s.current_step) : 1;
            const total = s?.total_steps != null ? Number(s.total_steps) : 9;
            const sub = s?.id != null ? subByStore.get(Number(s.id)) : null;
            const paymentStatus = sub?.payment_status === "PAID" ? "Completed" : "Pending";
            return {
              id: s?.id,
              store_id: s?.store_id,
              store_name: s?.store_name,
              full_address: s?.full_address,
              approval_status: s?.approval_status ?? "DRAFT",
              operational_status: s?.operational_status,
              current_step: step,
              total_steps: total,
              registration_status: s?.registration_status,
              payment_status: paymentStatus,
            };
          });

          const expiresInSec = 60 * 60 * 24 * 7; // 7 days
          const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
          const accessToken = await issueSupabaseCompatibleJwt({
            jwtSecret: env.SUPABASE_JWT_SECRET,
            sub: parentMerchantId,
            role: "merchant",
            phoneE164,
            deviceId,
            exp: expiresAt,
          });

          const parent = {
            id: parentId,
            parent_merchant_id: parentMerchantId,
            parent_name: parentRow.parent_name,
            owner_name: parentRow.owner_name,
            owner_email: parentRow.owner_email ?? undefined,
            brand_name: parentRow.brand_name ?? undefined,
            registered_phone: parentRow.registered_phone,
          };

          req.log?.info?.({ parentMerchantId, phoneE164 }, "Merchant partner signed in successfully");
          return reply.send({
            accessToken,
            expiresAt,
            role: "merchant",
            userId: parentMerchantId,
            partner: { parent, childStores },
          });
        } catch (merchantErr: any) {
          req.log?.error?.({ err: merchantErr }, "Merchant OTP verify failed");
          if (merchantErr?.statusCode) throw merchantErr;
          return reply.code(500).send({ error: "partner_lookup_failed", message: merchantErr?.message ?? "Could not load partner account." });
        }
      }

      // Customer app: find or create in customers table and return JWT with customer_id (GM100001, ...)
      if (body.appType === "customer") {
        try {
          const tableCheck = await sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'customers'
            );
          `;
          if (!tableCheck[0]?.exists) {
            throw new Error("Database table 'customers' does not exist. Run migration: backend/drizzle/0066_customers_table_full_ddl.sql");
          }

          const existing = await db
            .select()
            .from(customers)
            .where(eq(customers.primaryMobile, phoneE164))
            .limit(1);

          let customerUserId: string;
          if (existing.length > 0) {
            customerUserId = existing[0]!.customerId;
          } else {
            const normalizedMobile = phoneE164.replace(/\D/g, "");
            const placeholderId = `GM_PENDING_${normalizedMobile}`;
            const [inserted] = await db
              .insert(customers)
              .values({
                customerId: placeholderId,
                fullName: "Pending",
                primaryMobile: phoneE164,
                primaryMobileNormalized: normalizedMobile,
              })
              .returning({ id: customers.id });
            if (!inserted) throw new Error("Failed to create customer");
            const id = inserted.id;
            customerUserId = `GM${100000 + id}`;
            await db
              .update(customers)
              .set({
                customerId: customerUserId,
                primaryMobileNormalized: normalizedMobile,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, id));
          }

          const normalizedMobile = phoneE164.replace(/\D/g, "");
          await db
            .update(customers)
            .set({
              lastLoginAt: new Date(),
              lastActivityAt: new Date(),
              updatedAt: new Date(),
              primaryMobileNormalized: normalizedMobile,
            })
            .where(eq(customers.customerId, customerUserId));

          const expiresInSec = 60 * 60 * 24 * 365; // 1 year
          const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
          const accessToken = await issueSupabaseCompatibleJwt({
            jwtSecret: env.SUPABASE_JWT_SECRET,
            sub: customerUserId,
            role: "customer",
            phoneE164,
            deviceId,
            exp: expiresAt,
          });
          req.log?.info?.(
            { userId: customerUserId, phoneE164 },
            "Customer signed in successfully; profile saved in customers"
          );
          return {
            accessToken,
            expiresAt,
            role: "customer",
            userId: customerUserId,
          };
        } catch (customerError: any) {
          req.log?.error?.({ err: customerError }, "Customer OTP verify failed");
          throw customerError;
        }
      }

      // Rider flow
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
        if (checkError?.message?.includes("does not exist")) {
          throw checkError;
        }
        console.warn("Could not verify table existence:", checkError?.message);
      }

      let userId: string;
      let riderId: number;
      
      try {
        const existingRider = await db.select().from(riders).where(eq(riders.mobile, phoneE164)).limit(1);

        if (existingRider.length > 0) {
          riderId = existingRider[0]!.id;
          userId = `usr_${riderId}`;
        } else {
          const newRider = await db.insert(riders).values({
            mobile: phoneE164,
            countryCode: "+91",
            defaultLanguage: "en",
            onboardingStage: "MOBILE_VERIFIED",
            kycStatus: "PENDING",
            status: "INACTIVE",
          }).returning({ id: riders.id });
          
          riderId = newRider[0]!.id;
          userId = `usr_${riderId}`;
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

  /**
   * Exchange a Supabase access token (from Supabase Auth phone OTP) for a backend customer session.
   * This lets the customer app use Supabase Send SMS hook for OTP delivery
   * while backend remains the session authority.
   */
  app.post(
    "/supabase/exchange-customer",
    {
      schema: {
        body: z.object({
          accessToken: z.string().min(10),
          phoneE164: z.string().min(10),
          deviceId: z.string().min(1),
        }),
        response: {
          200: SessionSchema,
          400: z.object({ error: z.string() }),
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { accessToken, phoneE164, deviceId } = req.body as {
        accessToken: string;
        phoneE164: string;
        deviceId: string;
      };

      // Validate the Supabase token using the service role client
      const { getSupabase } = await import("../../lib/supabase.js");
      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData?.user) {
        return reply.code(401).send({ error: "Invalid or expired Supabase token" });
      }

      const sbPhone = userData.user.phone ?? "";
      const normalizePhone = (p: string) => p.replace(/[\s+\-]/g, "");
      if (normalizePhone(sbPhone) !== normalizePhone(phoneE164)) {
        return reply.code(400).send({ error: "Phone mismatch between Supabase user and request" });
      }

      const db = getDb();
      const sql = getSql();

      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'customers'
        );
      `;
      if (!tableCheck[0]?.exists) {
        throw new Error("Database table 'customers' does not exist.");
      }

      const existing = await db
        .select()
        .from(customers)
        .where(eq(customers.primaryMobile, phoneE164))
        .limit(1);

      let customerUserId: string;
      if (existing.length > 0) {
        customerUserId = existing[0]!.customerId;
      } else {
        const normalizedMobile = phoneE164.replace(/\D/g, "");
        const placeholderId = `GM_PENDING_${normalizedMobile}`;
        const [inserted] = await db
          .insert(customers)
          .values({
            customerId: placeholderId,
            fullName: "Pending",
            primaryMobile: phoneE164,
            primaryMobileNormalized: normalizedMobile,
          })
          .returning({ id: customers.id });
        if (!inserted) throw new Error("Failed to create customer");
        const id = inserted.id;
        customerUserId = `GM${100000 + id}`;
        await db
          .update(customers)
          .set({ customerId: customerUserId, primaryMobileNormalized: normalizedMobile, updatedAt: new Date() })
          .where(eq(customers.id, id));
      }

      const normalizedMobile = phoneE164.replace(/\D/g, "");
      await db
        .update(customers)
        .set({
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
          primaryMobileNormalized: normalizedMobile,
        })
        .where(eq(customers.customerId, customerUserId));

      const expiresInSec = 60 * 60 * 24 * 365;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
      const jwtToken = await issueSupabaseCompatibleJwt({
        jwtSecret: env.SUPABASE_JWT_SECRET,
        sub: customerUserId,
        role: "customer",
        phoneE164,
        deviceId,
        exp: expiresAt,
      });

      req.log?.info?.({ userId: customerUserId, phoneE164 }, "Customer signed in via Supabase OTP exchange");
      return {
        accessToken: jwtToken,
        expiresAt,
        role: "customer",
        userId: customerUserId,
      };
    },
  );

  /**
   * Exchange a Supabase access token (from Supabase Auth phone OTP) for a backend merchant partner session.
   * This lets the merchant app use Supabase Send SMS hook for OTP delivery while backend issues the session
   * and attaches parent + child store information.
   */
  app.post(
    "/supabase/exchange-merchant",
    {
      schema: {
        body: z.object({
          accessToken: z.string().min(10),
          phoneE164: z.string().min(10).optional(),
          deviceId: z.string().min(1),
        }),
        response: {
          200: z.object({
            accessToken: z.string(),
            expiresAt: z.number(),
            role: z.string(),
            userId: z.string(),
            partner: z.object({
              parent: z.any(),
              childStores: z.array(z.any()),
            }),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          401: z.object({ error: z.string(), message: z.string().optional() }),
          404: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const { accessToken, phoneE164, deviceId } = req.body as {
        accessToken: string;
        phoneE164?: string;
        deviceId: string;
      };

      // Validate the Supabase token using the service role client
      const { getSupabase } = await import("../../lib/supabase.js");
      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData?.user) {
        return reply.code(401).send({ error: "invalid_supabase_token", message: "Invalid or expired Supabase token" });
      }

      const db = getDb();
      const sql = getSql();

      try {
        const tableCheck = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'merchant_parents'
          );
        `;
        if (!tableCheck[0]?.exists) {
          return reply.code(400).send({ error: "partner_not_found", message: "Partner registration is not available." });
        }

        let parentRows: any[];
        if (phoneE164 && phoneE164.length >= 10) {
          const sbPhone = userData.user.phone ?? "";
          const normalizePhone = (p: string) => p.replace(/[\s+\-]/g, "");
          if (normalizePhone(sbPhone) !== normalizePhone(phoneE164)) {
            return reply.code(400).send({ error: "phone_mismatch", message: "Phone mismatch between Supabase user and request" });
          }
          const normalizedPhone = phoneE164.replace(/\D/g, "");
          parentRows = await sql`
            SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
            FROM merchant_parents
            WHERE registered_phone = ${phoneE164}
               OR registered_phone_normalized = ${normalizedPhone}
               OR registered_phone LIKE ${"%" + normalizedPhone.slice(-10)}
            LIMIT 1
          `;
        } else {
          const email = (userData.user.email ?? "").trim().toLowerCase();
          if (!email) {
            return reply.code(400).send({ error: "no_email", message: "Google sign-in did not return an email. Use Phone Login or try another account." });
          }
          parentRows = await sql`
            SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
            FROM merchant_parents
            WHERE LOWER(TRIM(owner_email)) = ${email}
            LIMIT 1
          `;
        }

        const parentRow = parentRows[0];
        if (!parentRow) {
          return reply.code(404).send({
            error: "partner_not_found",
            message: "No partner account found for this account. Sign up at partner.gatimitra.com",
          });
        }

        const parentId = Number(parentRow.id);
        const parentMerchantId = String(parentRow.parent_merchant_id);

        const storeRows = await sql`
          SELECT ms.id, ms.store_id, ms.store_name, ms.full_address, ms.approval_status,
                 msrp.current_step, msrp.total_steps, msrp.registration_status
          FROM merchant_stores ms
          LEFT JOIN merchant_store_registration_progress msrp ON msrp.store_id = ms.id AND msrp.parent_id = ${parentId}
          WHERE ms.parent_id = ${parentId}
          ORDER BY ms.created_at ASC
        `;

        let subscriptionRows: Array<{ store_id: number; payment_status: string; subscription_status: string }> = [];
        try {
          subscriptionRows = (await sql`
            SELECT store_id, payment_status, subscription_status
            FROM merchant_subscriptions
            WHERE merchant_id = ${parentId}
          `) as any;
        } catch {
          // merchant_subscriptions may not exist
        }

        const subByStore = new Map<number, { payment_status: string; subscription_status: string }>();
        for (const row of Array.isArray(subscriptionRows) ? subscriptionRows : []) {
          const sid = row?.store_id != null ? Number(row.store_id) : null;
          if (sid != null) {
            subByStore.set(sid, {
              payment_status: String(row?.payment_status ?? "PENDING"),
              subscription_status: String(row?.subscription_status ?? "INACTIVE"),
            });
          }
        }

        const childStores = (storeRows as any[]).map((s) => {
          const step = s?.current_step != null ? Number(s.current_step) : 1;
          const total = s?.total_steps != null ? Number(s.total_steps) : 9;
          const sub = s?.id != null ? subByStore.get(Number(s.id)) : null;
          const paymentStatus = sub?.payment_status === "PAID" ? "Completed" : "Pending";
          return {
            id: s?.id,
            store_id: s?.store_id,
            store_name: s?.store_name,
            full_address: s?.full_address,
            approval_status: s?.approval_status ?? "DRAFT",
            operational_status: s?.operational_status,
            current_step: step,
            total_steps: total,
            registration_status: s?.registration_status,
            payment_status: paymentStatus,
          };
        });

        const expiresInSec = 60 * 60 * 24 * 7; // 7 days
        const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
        const jwtToken = await issueSupabaseCompatibleJwt({
          jwtSecret: env.SUPABASE_JWT_SECRET,
          sub: parentMerchantId,
          role: "merchant",
          phoneE164: phoneE164 ?? parentRow.registered_phone ?? "",
          deviceId,
          exp: expiresAt,
        });

        const parent = {
          id: parentId,
          parent_merchant_id: parentMerchantId,
          parent_name: parentRow.parent_name,
          owner_name: parentRow.owner_name,
          owner_email: parentRow.owner_email ?? undefined,
          brand_name: parentRow.brand_name ?? undefined,
          registered_phone: parentRow.registered_phone,
        };

        req.log?.info?.({ parentMerchantId, phoneE164, email: userData.user.email }, "Merchant partner signed in via Supabase exchange");
        return reply.send({
          accessToken: jwtToken,
          expiresAt,
          role: "merchant",
          userId: parentMerchantId,
          partner: { parent, childStores },
        });
      } catch (err: any) {
        req.log?.error?.({ err }, "Merchant Supabase OTP exchange failed");
        if (err?.statusCode) throw err;
        return reply.code(500).send({ error: "partner_lookup_failed", message: err?.message ?? "Could not load partner account." });
      }
    },
  );

  /**
   * Verify MSG91 access token and issue session
   * This endpoint is called after client-side OTP verification using MSG91 SDK
   */
  app.post(
    "/msg91/verify-token",
    {
      schema: {
        body: z.object({
          authToken: z.string().min(10),
          phoneE164: z.string(),
          deviceId: z.string(),
        }),
        response: {
          200: SessionSchema,
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { authToken, phoneE164, deviceId } = req.body;

      try {
        // Verify MSG91 access token using MSG91 Widget API
        // MSG91 Widget OTP verification endpoint
        const verifyUrl = "https://control.msg91.com/api/v5/otp/verify-token";
        
        if (!env.MSG91_AUTH_KEY) {
          console.error("MSG91_AUTH_KEY not configured");
          return reply.code(500).send({ error: "OTP service not configured" });
        }

        const verifyResponse = await fetch(verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authkey": env.MSG91_AUTH_KEY,
          },
          body: JSON.stringify({
            authkey: env.MSG91_AUTH_KEY,
            token: authToken,
          }),
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json().catch(() => ({}));
          console.error("MSG91 token verification failed:", errorData);
          return reply.code(400).send({ error: "invalid_token" });
        }

        const verifyData = await verifyResponse.json();
        
        // Check if token is valid
        // MSG91 response format may vary, check for success indicators
        if (verifyData.type !== "success" && verifyData.status !== "success") {
          return reply.code(400).send({ error: "invalid_token" });
        }

        // Extract phone number from MSG91 response if available
        // For widget OTP, phone verification might be implicit in the token
        // We'll trust the phoneE164 from the client since the token was verified
        const verifiedPhone = verifyData.phone || verifyData.mobile;
        
        // If phone is returned, verify it matches
        if (verifiedPhone) {
          const normalizePhone = (phone: string) => phone.replace(/[\s+]/g, "");
          if (normalizePhone(verifiedPhone) !== normalizePhone(phoneE164)) {
            return reply.code(400).send({ error: "phone_mismatch" });
          }
        }

        // Token is valid - proceed with session creation
        const db = getDb();

        // Find or create rider by mobile number
        let userId: string;
        let riderId: number;

        try {
          const existingRider = await db
            .select()
            .from(riders)
            .where(eq(riders.mobile, phoneE164))
            .limit(1);

          if (existingRider.length > 0) {
            riderId = existingRider[0]!.id;
            userId = `usr_${riderId}`;
          } else {
            // Create new rider
            const newRider = await db
              .insert(riders)
              .values({
                mobile: phoneE164,
                countryCode: "+91",
                defaultLanguage: "en",
                onboardingStage: "MOBILE_VERIFIED",
                kycStatus: "PENDING",
                status: "INACTIVE",
              })
              .returning({ id: riders.id });

            riderId = newRider[0]!.id;
            userId = `usr_${riderId}`;
          }
        } catch (dbError: any) {
          console.error("Database error during MSG91 token verify:", dbError);
          const errorMessage = dbError?.message || "Database error";
          return reply.code(500).send({ error: errorMessage });
        }

        const expiresInSec = 60 * 60 * 6; // 6 hours
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
      } catch (error: any) {
        console.error("MSG91 token verification error:", error);
        return reply.code(500).send({
          error: error?.message || "Failed to verify token",
        });
      }
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


