import { jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
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
import { deliverSupabaseOtpViaMsg91 } from "../../services/otp/msg91DeliverSupabaseOtp.js";
import { issueSupabaseCompatibleJwt } from "./jwt.js";
import { verifyFirebaseIdToken } from "./firebaseAdmin.js";
import { getDb, getSql } from "../../db/client.js";
import { riders, userProfiles, customers } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { persistRiderDeviceSession } from "../../lib/rider-app-session.js";
import { resolveRiderLoginGeoForSession, type RiderLoginGeo } from "../../lib/login-geo.js";

const RiderLoginGeoSchema = z
  .object({
    state: z.string().max(128).optional(),
    district: z.string().max(128).optional(),
    town: z.string().max(128).optional(),
    village: z.string().max(128).optional(),
  })
  .optional();

async function riderSessionLoginGeo(
  req: { headers: Record<string, unknown>; ip?: string },
  clientGeo?: RiderLoginGeo | null,
) {
  const ip = riderLoginIp(req);
  return resolveRiderLoginGeoForSession({
    ip,
    headers: req.headers,
    clientGeo,
  });
}

const RiderLoginDeviceMetaSchema = z
  .object({
    deviceType: z.string().max(64).optional(),
    deviceModel: z.string().max(128).optional(),
    os: z.string().max(32).optional(),
    osVersion: z.string().max(64).optional(),
    appVersion: z.string().max(32).optional(),
  })
  .optional();

function riderLoginIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null;
}

function riderLoginLocation(req: { headers: Record<string, unknown> }): string | null {
  const city = (req.headers["x-vercel-ip-city"] as string) ?? null;
  const country = (req.headers["x-vercel-ip-country"] as string) ?? null;
  return city && country ? `${city}, ${country}` : city ?? country ?? null;
}

const RIDER_REFRESH_CLOCK_TOLERANCE_SEC = 60 * 60 * 24 * 30; // allow refresh up to 30d after JWT exp

async function verifyRiderJwtForRefresh(token: string): Promise<{
  sub: string;
  role: string;
  phoneE164: string;
  deviceId: string;
}> {
  const env = getEnv();
  const currentKey = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8"));
  const previousKey = env.SUPABASE_JWT_SECRET_PREVIOUS
    ? createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET_PREVIOUS, "utf-8"))
    : null;
  const opts = { clockTolerance: RIDER_REFRESH_CLOCK_TOLERANCE_SEC };

  let payload;
  try {
    ({ payload } = await jwtVerify(token, currentKey, opts));
  } catch (e) {
    if (!previousKey) throw e;
    ({ payload } = await jwtVerify(token, previousKey, opts));
  }

  const role = String((payload as { role?: string }).role ?? "");
  const sub = String(payload.sub ?? "");
  const phoneE164 =
    typeof (payload as { phone?: string }).phone === "string"
      ? (payload as { phone: string }).phone
      : "";
  const deviceId =
    typeof (payload as { device_id?: string }).device_id === "string"
      ? (payload as { device_id: string }).device_id
      : "";

  if (!sub || role !== "rider" || !phoneE164 || !deviceId) {
    throw Object.assign(new Error("invalid_token"), { statusCode: 401 });
  }

  return { sub, role, phoneE164, deviceId };
}

function headersToRecord(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

/** Ensures JWT device_id always has a matching active row (reactivates if user logs in again). */
async function persistMerchantDeviceSessionForMerchant(
  sql: ReturnType<typeof getSql>,
  args: {
    userId: string;
    parentStoreId: number;
    childStoreId: number | null;
    deviceId: string;
    loginMethod: "google" | "phone";
    ip: string | null;
    location: string | null;
  }
): Promise<void> {
  const { userId, parentStoreId, childStoreId, deviceId, loginMethod, ip, location } = args;
  const updated = await sql`
    UPDATE user_device_sessions
    SET
      is_active = TRUE,
      last_active = now(),
      parent_store_id = ${parentStoreId},
      child_store_id = ${childStoreId},
      device_type = 'mobile',
      device_name = ${deviceId},
      os = 'android',
      ip_address = ${ip},
      location = ${location},
      login_method = ${loginMethod}
    WHERE user_id = ${userId} AND device_id = ${deviceId}
    RETURNING id
  `;
  const touched = Array.isArray(updated) ? updated.length : 0;
  if (touched > 0) return;

  await sql`
    INSERT INTO user_device_sessions (
      user_id,
      parent_store_id,
      child_store_id,
      device_type,
      device_name,
      os,
      ip_address,
      location,
      login_method,
      device_id
    )
    VALUES (
      ${userId},
      ${parentStoreId},
      ${childStoreId},
      'mobile',
      ${deviceId},
      'android',
      ${ip},
      ${location},
      ${loginMethod},
      ${deviceId}
    )
  `;
}

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
   * Supabase Auth "Send SMS" hook — same contract as partnersite `/api/auth/send-sms`.
   * Point Supabase Dashboard → Auth → Hooks → Send SMS to:
   * `https://<your-public-api-host>/v1/auth/supabase-send-sms` (use ngrok in local dev).
   * Requires `MSG91_*` and optional `SUPABASE_SEND_SMS_HOOK_SECRET` (must match Supabase).
   */
  app.post(
    "/supabase-send-sms",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      try {
        const rawBody = (request as { rawBody?: string }).rawBody;
        const raw = typeof rawBody === "string" ? rawBody : "";
        if (!raw) {
          return reply.code(400).send({ error: "empty_body" });
        }

        if (!env.MSG91_AUTH_KEY) {
          request.log.error("[supabase-send-sms] MSG91_AUTH_KEY not configured");
          return reply.code(503).send({ error: "SMS not configured" });
        }

        let body: Record<string, unknown>;
        const hasWebhookHeaders = Boolean(
          request.headers["webhook-id"] &&
            request.headers["webhook-signature"] &&
            request.headers["webhook-timestamp"]
        );
        const headerMap = headersToRecord(request.headers as Record<string, unknown>);

        if (env.SUPABASE_SEND_SMS_HOOK_SECRET && hasWebhookHeaders) {
          try {
            const secret = env.SUPABASE_SEND_SMS_HOOK_SECRET.trim().replace(/^v1,/i, "");
            const wh = new Webhook(secret);
            body = wh.verify(raw, headerMap) as Record<string, unknown>;
          } catch (err) {
            if (err instanceof WebhookVerificationError) {
              request.log.warn({ err: err.message }, "[supabase-send-sms] webhook verify failed");
              return reply.code(401).send({ error: "Unauthorized" });
            }
            throw err;
          }
        } else if (env.SUPABASE_SEND_SMS_HOOK_SECRET && !hasWebhookHeaders) {
          return reply.code(401).send({ error: "Hook requires Standard Webhooks headers" });
        } else {
          try {
            body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return reply.code(400).send({ error: "Invalid JSON" });
          }
        }

        const phone =
          (body.user as { phone?: string } | undefined)?.phone ??
          (body.phone as string | undefined) ??
          "";
        const otp =
          (body.sms as { otp?: string } | undefined)?.otp ??
          (body.otp as string | undefined) ??
          (body.token as string | undefined) ??
          "";

        const phoneTrimmed = String(phone).trim();
        const otpTrimmed = String(otp).trim();
        if (!phoneTrimmed || !otpTrimmed) {
          return reply.code(400).send({ error: "Missing phone or otp" });
        }

        const delivered = await deliverSupabaseOtpViaMsg91(env, phoneTrimmed, otpTrimmed);
        if (!delivered.ok) {
          request.log.error({ err: delivered.error }, "[supabase-send-sms] MSG91 delivery failed");
          return reply.code(502).send({ error: "sms_delivery_failed", message: delivered.error });
        }

        request.log.info({ phoneTail: phoneTrimmed.slice(-4) }, "[supabase-send-sms] delivered");
        return reply.send({ success: true });
      } catch (e) {
        request.log.error({ err: e }, "[supabase-send-sms] internal error");
        return reply.code(500).send({ error: "Internal error" });
      }
    },
  );

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
          500: z.object({ error: z.string(), message: z.string() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
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
                 ms.banner_url,
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
            banner_url: s?.banner_url ?? null,
            approval_status: s?.approval_status ?? "DRAFT",
            current_step: step,
            total_steps: total,
            registration_status: s?.registration_status,
            payment_status: paymentStatus,
          };
        });

        const ip =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? (req.ip ?? null);
        const city = (req.headers["x-vercel-ip-city"] as string) ?? null;
        const country = (req.headers["x-vercel-ip-country"] as string) ?? null;
        const location =
          city && country ? `${city}, ${country}` : city ?? country ?? null;
        const firstStore = (storeRows as any[])[0];
        const parentStoreId = firstStore ? Number(firstStore.parent_id ?? parentId) : parentId;
        const childStoreId = firstStore ? Number(firstStore.id) : null;

        try {
          await persistMerchantDeviceSessionForMerchant(sql, {
            userId: parentMerchantId,
            parentStoreId,
            childStoreId,
            deviceId,
            loginMethod: "google",
            ip,
            location,
          });
        } catch (sessErr: any) {
          req.log?.error?.({ err: sessErr }, "Merchant Google login: device session persist failed");
          return reply.code(503).send({
            error: "device_session_unavailable",
            message: "Could not start your session on this device. Please try again.",
          });
        }

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

      const expiresInSec = 60 * 60 * 24 * 7; // 7 days — aligned with merchant/rider app session TTL
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
    async (req, reply) => {
      const { phoneE164 } = OtpRequestSchema.parse(req.body);
      const requestId = ulid();
      const expiresInSec = env.MSG91_OTP_EXPIRY_SEC;
      const phoneTail = phoneE164.replace(/\D/g, "").slice(-4);

      req.log?.info?.({ phoneE164, phoneTail, requestId }, "[OTP] Requested");

      // 6-digit OTP (SMS standard; MSG91 and partnersite use 6).
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(requestId, {
        phoneE164,
        otp,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        attempts: 0,
      });

      req.log?.info?.({ requestId, expiresInSec }, "[OTP] Generated");

      // Send SMS via MSG91 — dedicated OTP APIs first (v5/otp, sendotp.php), not Flow template.
      const delivered = await deliverSupabaseOtpViaMsg91(env, phoneE164, otp, { preferLegacyOtpApi: true });
      const smsSent = delivered.ok;
      if (!smsSent) {
        otpStore.delete(requestId);
        req.log?.warn?.(
          { phoneE164, phoneTail, requestId, err: delivered.error, attempts: delivered.attempts },
          "[OTP] SMS Failed",
        );
        if (env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("\n  [OTP] SMS NOT sent:", delivered.error, "\n");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (reply as any).code(503).send({
          error: "sms_delivery_failed",
          message:
            "Could not send OTP by SMS. Check MSG91_AUTH_KEY, template/flow IDs, and sender ID on the API server.",
        });
      }

      req.log?.info?.({ phoneE164, phoneTail, requestId, channel: delivered.channel }, "[OTP] SMS Sent");
      if (env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(
          "\n  [OTP] Phone:",
          phoneE164,
          "| OTP:",
          otp,
          "| RequestId:",
          requestId,
          `| SMS: sent (${delivered.channel})`,
          "\n",
        );
      }

      return {
        requestId,
        expiresInSec,
        smsSent: true,
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
          404: z.object({ error: z.string(), message: z.string() }).optional(),
          429: z.object({ error: z.string() }),
          500: z.object({ error: z.string(), message: z.string().optional() }).optional(),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const body = OtpVerifySchema.parse(req.body) as OtpVerify & { appType?: string };
      const { requestId, phoneE164, deviceId, otp } = body;
      const appType = body.appType ?? "unknown";
      const phoneTail = phoneE164.replace(/\D/g, "").slice(-4);

      req.log?.info?.({ requestId, appType, phoneTail }, "[OTP] Verify attempted");

      const entry = otpStore.get(requestId);
      if (!entry) {
        req.log?.warn?.({ requestId, appType }, "[OTP] Verify failed — invalid request id");
        return reply.code(400).send({ error: "invalid_request_id" });
      }
      if (entry.phoneE164 !== phoneE164) {
        req.log?.warn?.({ requestId, appType }, "[OTP] Verify failed — phone mismatch");
        return reply.code(400).send({ error: "phone_mismatch" });
      }
      if (Date.now() > entry.expiresAtMs) {
        otpStore.delete(requestId);
        req.log?.warn?.({ requestId, appType }, "[OTP] Expired");
        return reply.code(400).send({ error: "otp_expired" });
      }

      entry.attempts += 1;
      if (entry.attempts > 5) {
        otpStore.delete(requestId);
        req.log?.warn?.({ requestId, appType }, "[OTP] Verify failed — too many attempts");
        return reply.code(429).send({ error: "too_many_attempts" });
      }

      if (entry.otp !== otp) {
        req.log?.warn?.({ requestId, appType, attempt: entry.attempts }, "[OTP] Verify failed — invalid code");
        return reply.code(400).send({ error: "invalid_otp" });
      }
      otpStore.delete(requestId);

      req.log?.info?.({ requestId, appType, phoneTail }, "[OTP] Verified");

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
                   ms.banner_url,
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
            banner_url: s?.banner_url ?? null,
              approval_status: s?.approval_status ?? "DRAFT",
              operational_status: s?.operational_status,
              current_step: step,
              total_steps: total,
              registration_status: s?.registration_status,
              payment_status: paymentStatus,
            };
          });

          const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? (req.ip ?? null);
          const city = (req.headers["x-vercel-ip-city"] as string) ?? null;
          const country = (req.headers["x-vercel-ip-country"] as string) ?? null;
          const location =
            city && country ? `${city}, ${country}` : city ?? country ?? null;
          const firstStore = (storeRows as any[])[0];
          const parentStoreId = firstStore ? Number(firstStore.parent_id ?? parentId) : parentId;
          const childStoreId = firstStore ? Number(firstStore.id) : null;

          try {
            await persistMerchantDeviceSessionForMerchant(sql, {
              userId: parentMerchantId,
              parentStoreId,
              childStoreId,
              deviceId,
              loginMethod: "phone",
              ip,
              location,
            });
          } catch (sessErr: any) {
            req.log?.error?.({ err: sessErr }, "Merchant OTP login: device session persist failed");
            return reply.code(503).send({
              error: "device_session_unavailable",
              message: "Could not start your session on this device. Please try again.",
            });
          }

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
                trustScore: "5",
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

      const ip = riderLoginIp(req);
      const loginGeo = await riderSessionLoginGeo(req);

      try {
        await persistRiderDeviceSession(sql, {
          userId,
          deviceId,
          loginMethod: "phone",
          ip,
          loginGeo,
        });
      } catch (sessErr: unknown) {
        req.log?.error?.({ err: sessErr }, "Rider OTP login: device session persist failed");
        return reply.code(503).send({
          error: "device_session_unavailable",
          message: "Could not start your session on this device. Please try again.",
        });
      }

      const expiresInSec = 60 * 60 * 24 * 7; // 7 days — aligned with merchant app session TTL
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
   * Exchange a Supabase access token (from Supabase Auth phone OTP) for a backend rider session.
   * Same production pattern as customer/merchant: Supabase OTP → Send SMS hook → MSG91 → exchange.
   */
  app.post(
    "/supabase/exchange-rider",
    {
      schema: {
        body: z.object({
          accessToken: z.string().min(10),
          phoneE164: z.string().min(10),
          deviceId: z.string().min(1),
          device: RiderLoginDeviceMetaSchema,
          loginGeo: RiderLoginGeoSchema,
        }),
        response: {
          200: SessionSchema,
          400: z.object({ error: z.string() }),
          401: z.object({ error: z.string() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const { accessToken, phoneE164, deviceId, device: deviceMeta, loginGeo: clientLoginGeo } = req.body as {
        accessToken: string;
        phoneE164: string;
        deviceId: string;
        device?: z.infer<typeof RiderLoginDeviceMetaSchema>;
        loginGeo?: RiderLoginGeo;
      };

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

      let userId: string;
      let riderId: number;

      const existingRider = await db.select().from(riders).where(eq(riders.mobile, phoneE164)).limit(1);
      if (existingRider.length > 0) {
        riderId = existingRider[0]!.id;
        userId = `usr_${riderId}`;
      } else {
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

      const ip = riderLoginIp(req);
      const loginGeo = await riderSessionLoginGeo(req, clientLoginGeo);

      try {
        await persistRiderDeviceSession(sql, {
          userId,
          deviceId,
          loginMethod: "phone",
          ip,
          loginGeo,
          device: deviceMeta ?? undefined,
        });
      } catch (sessErr: unknown) {
        req.log?.error?.({ err: sessErr }, "Rider Supabase exchange: device session persist failed");
        return reply.code(503).send({
          error: "device_session_unavailable",
          message: "Could not start your session on this device. Please try again.",
        });
      }

      const expiresInSec = 60 * 60 * 24 * 7;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
      const jwtToken = await issueSupabaseCompatibleJwt({
        jwtSecret: env.SUPABASE_JWT_SECRET,
        sub: userId,
        role: "rider",
        phoneE164,
        deviceId,
        exp: expiresAt,
      });

      req.log?.info?.({ userId, phoneE164 }, "Rider signed in via Supabase OTP exchange");
      return {
        accessToken: jwtToken,
        expiresAt,
        role: "rider",
        userId,
        riderId: riderId.toString(),
      };
    },
  );

  /**
   * Refresh rider session — re-issue JWT when near expiry while device session is still active.
   * Accepts slightly expired tokens (grace window) so riders stay signed in without re-OTP.
   */
  app.post(
    "/rider/refresh-session",
    {
      schema: {
        body: z.object({
          deviceId: z.string().min(1),
        }),
        response: {
          200: SessionSchema,
          401: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const header = req.headers.authorization;
      const m = header ? /^Bearer\s+(.+)$/.exec(header) : null;
      const token = m?.[1]?.trim();
      if (!token) {
        return reply.code(401).send({ error: "missing_authorization" });
      }

      const { deviceId: bodyDeviceId } = req.body as { deviceId: string };
      let claims: Awaited<ReturnType<typeof verifyRiderJwtForRefresh>>;
      try {
        claims = await verifyRiderJwtForRefresh(token);
      } catch {
        return reply.code(401).send({ error: "invalid_token" });
      }

      if (claims.deviceId !== bodyDeviceId.trim()) {
        return reply.code(401).send({ error: "invalid_token", message: "Device mismatch." });
      }

      const sql = getSql();
      const rows = await sql`
        SELECT id
        FROM user_device_sessions
        WHERE user_id = ${claims.sub}
          AND device_id = ${claims.deviceId}
          AND is_active = TRUE
        LIMIT 1
      `;
      if (!rows[0]) {
        return reply.code(401).send({
          error: "session_revoked",
          message: "Signed out from this device.",
        });
      }

      await sql`
        UPDATE user_device_sessions
        SET last_active = now()
        WHERE user_id = ${claims.sub} AND device_id = ${claims.deviceId} AND is_active = TRUE
      `;

      const env = getEnv();
      const expiresInSec = 60 * 60 * 24 * 7;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
      const accessToken = await issueSupabaseCompatibleJwt({
        jwtSecret: env.SUPABASE_JWT_SECRET,
        sub: claims.sub,
        role: "rider",
        phoneE164: claims.phoneE164,
        deviceId: claims.deviceId,
        exp: expiresAt,
      });

      const db = getDb();
      const riderPkFromSub = /^usr_(\d+)$/.exec(claims.sub.trim())?.[1];
      const riderId =
        riderPkFromSub ??
        (
          await db
            .select({ id: riders.id })
            .from(riders)
            .where(eq(riders.mobile, claims.phoneE164))
            .limit(1)
        )[0]?.id?.toString();

      return {
        accessToken,
        expiresAt,
        role: "rider" as const,
        userId: claims.sub,
        ...(riderId ? { riderId } : {}),
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
            trustScore: "5",
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
            supabaseUserId: z.string(),
            partner: z.object({
              parent: z.any(),
              childStores: z.array(z.any()),
            }),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          401: z.object({ error: z.string(), message: z.string().optional() }),
          404: z.object({ error: z.string(), message: z.string().optional() }),
          503: z.object({ error: z.string(), message: z.string().optional() }),
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
                 ms.banner_url,
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
            banner_url: s?.banner_url ?? null,
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

        // Record device session for this merchant user (Supabase exchange).
        try {
          const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
            (req.ip ?? null);
          const city = (req.headers["x-vercel-ip-city"] as string) ?? null;
          const country = (req.headers["x-vercel-ip-country"] as string) ?? null;
          const location =
            city && country ? `${city}, ${country}` : city ?? country ?? null;

          const firstStore = (storeRows as any[])[0];
          const parentStoreId = firstStore ? Number(firstStore.parent_id ?? parentId) : parentId;
          const childStoreId = firstStore ? Number(firstStore.id) : null;
          await sql`
            INSERT INTO user_device_sessions (
              user_id,
              parent_store_id,
              child_store_id,
              device_type,
              device_name,
              os,
              ip_address,
              location,
              login_method,
              device_id
            )
            VALUES (
              ${parentMerchantId},
              ${parentStoreId},
              ${childStoreId},
              'mobile',
              ${deviceId},
              'android',
              ${ip},
              ${location},
              'supabase',
              ${deviceId}
            )
          `;
        } catch {
          // ignore
        }

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
          supabaseUserId: userData.user.id,
          partner: { parent, childStores },
        });
      } catch (err: any) {
        req.log?.error?.({ err }, "Merchant Supabase OTP exchange failed");
        if (err?.statusCode) throw err;
        return reply.code(500 as any).send({ error: "partner_lookup_failed", message: err?.message ?? "Could not load partner account." } as any);
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
          500: z.object({ error: z.string() }).optional(),
        },
      },
    },
    async (req, reply) => {
      const { authToken, phoneE164, deviceId } = req.body as {
        authToken: string;
        phoneE164: string;
        deviceId: string;
      };

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
        const sql = getSql();

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

        const ip = riderLoginIp(req);
        const loginGeo = await riderSessionLoginGeo(req);

        try {
          await persistRiderDeviceSession(sql, {
            userId,
            deviceId,
            loginMethod: "phone",
            ip,
            loginGeo,
          });
        } catch (sessErr: unknown) {
          req.log?.error?.({ err: sessErr }, "Rider MSG91 login: device session persist failed");
          return (reply as any).code(503).send({
            error: "device_session_unavailable",
            message: "Could not start your session on this device. Please try again.",
          });
        }

        const expiresInSec = 60 * 60 * 24 * 7; // 7 days
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

        const { resolveRiderOnboardingStatusForApp } = await import(
          "../../lib/rider-onboarding-status.js"
        );
        const resolved = await resolveRiderOnboardingStatusForApp(rider.id);
        if (!resolved) return { exists: false };

        return {
          exists: true,
          riderId: rider.id.toString(),
          onboardingStatus: resolved.onboardingStatus,
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

        const { resolveRiderOnboardingStatusForApp } = await import(
          "../../lib/rider-onboarding-status.js"
        );
        const resolved = await resolveRiderOnboardingStatusForApp(rider.id);
        if (!resolved) return { exists: false, userId };

        return {
          exists: true,
          riderId: rider.id.toString(),
          userId,
          onboardingStatus: resolved.onboardingStatus,
          approvalStatus: resolved.approvalStatus,
        };
      },
    );

  });
}


