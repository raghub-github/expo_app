import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { getEnv } from "../config/env.js";
import { getDb, getSql, withSqlRetry, isDbConnectionError } from "../db/client.js";
import { isTransientDbError, hasTransientDbCause } from "../lib/db/is-transient-db-error.js";
import { DbSlotTimeoutError } from "../lib/db/db-slot.js";
import { customers } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type AuthContext = {
  sub: string;
  role: string;
  phone?: string;
  device_id?: string;
  /** customers.id — populated for customer JWTs to avoid per-route PK lookups */
  customerPk?: number;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

type AuthPluginOpts = {
  required?: boolean;
};

type CustomerSessionCacheEntry = {
  invalidBeforeSec: number;
  customerPk: number | null;
  checkedAt: number;
};

const customerSessionCache = new Map<string, CustomerSessionCacheEntry>();
const CUSTOMER_SESSION_CACHE_MS = 45_000;
/** When DB is contended, keep serving last-known session state a bit longer. */
const CUSTOMER_SESSION_STALE_MS = 5 * 60_000;

/** Throw (don't reply.send) so route Zod response schemas don't reject auth errors. */
export class AuthHttpError extends Error {
  statusCode: number;
  errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = "AuthHttpError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function throwAuthError(statusCode: number, errorCode: string, message: string): never {
  throw new AuthHttpError(statusCode, errorCode, message);
}

type MerchantDeviceSessionCacheEntry = {
  valid: boolean;
  checkedAt: number;
};

const merchantDeviceSessionCache = new Map<string, MerchantDeviceSessionCacheEntry>();
const MERCHANT_DEVICE_SESSION_CACHE_MS = 45_000;
const MERCHANT_DEVICE_SESSION_STALE_MS = 5 * 60_000;

function readMerchantDeviceSessionCache(
  sub: string,
  deviceId: string,
  maxAgeMs = MERCHANT_DEVICE_SESSION_CACHE_MS
): boolean | null {
  const cached = merchantDeviceSessionCache.get(`${sub}:${deviceId}`);
  if (!cached || Date.now() - cached.checkedAt > maxAgeMs) return null;
  return cached.valid;
}

function writeMerchantDeviceSessionCache(sub: string, deviceId: string, valid: boolean): void {
  merchantDeviceSessionCache.set(`${sub}:${deviceId}`, { valid, checkedAt: Date.now() });
}

function readCustomerSessionCache(
  sub: string,
  iat: number,
  maxAgeMs = CUSTOMER_SESSION_CACHE_MS
): CustomerSessionCacheEntry | "revoked" | null {
  const cached = customerSessionCache.get(sub);
  if (!cached || Date.now() - cached.checkedAt > maxAgeMs) return null;
  if (cached.invalidBeforeSec > 0 && iat > 0 && iat < cached.invalidBeforeSec) return "revoked";
  return cached;
}

function isDbUnavailable(err: unknown): boolean {
  return (
    err instanceof DbSlotTimeoutError ||
    isTransientDbError(err) ||
    isDbConnectionError(err) ||
    hasTransientDbCause(err)
  );
}

const authPlugin: FastifyPluginAsync<AuthPluginOpts> = async (app, opts) => {
  const env = getEnv();
  const currentKey = createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8"));
  const previousKey = env.SUPABASE_JWT_SECRET_PREVIOUS
    ? createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET_PREVIOUS, "utf-8"))
    : null;
  const required = opts.required ?? true;

  async function verifyWithRotation(token: string) {
    try {
      return await jwtVerify(token, currentKey);
    } catch (e) {
      if (!previousKey) throw e;
      return await jwtVerify(token, previousKey);
    }
  }

  app.addHook("preHandler", async (req) => {
    // Route-level opt-out for endpoints that must be public even inside an
    // auth-encapsulated scope (e.g. provider webhooks that use their own
    // HMAC signature — Razorpay, Cashfree). Because this plugin is wrapped
    // with fp() its hook propagates to the whole parent scope, so any route
    // that must bypass JWT verification declares `config: { skipAuth: true }`
    // and this early-return keeps the request unauth'd.
    const routeCfg = req.routeOptions?.config as { skipAuth?: boolean } | undefined;
    if (routeCfg?.skipAuth === true) return;

    const header = req.headers.authorization;
    if (!header) {
      if (!required) return;
      throwAuthError(401, "missing_authorization", "Authentication required");
    }
    const m = /^Bearer\s+(.+)$/.exec(header!);
    if (!m) {
      if (!required) return;
      throwAuthError(401, "invalid_authorization", "Invalid authorization header");
    }

    const token = m![1]!;

    try {
      const { payload } = await verifyWithRotation(token);
      const role = String((payload as any).role ?? "");
      const sub = String(payload.sub ?? "");

      req.auth = {
        sub,
        role,
        phone: typeof (payload as any).phone === "string" ? (payload as any).phone : undefined,
        device_id: typeof (payload as any).device_id === "string" ? (payload as any).device_id : undefined,
      };

      if (!req.auth.sub || !req.auth.role) {
        if (!required) return;
        throwAuthError(401, "invalid_token", "Invalid token");
      }

      if (role === "customer") {
        const iat = typeof (payload as any).iat === "number" ? (payload as any).iat : 0;
        const cached = readCustomerSessionCache(sub, iat);
        if (cached === "revoked") {
          throwAuthError(401, "session_revoked", "Signed out from all devices.");
        }
        if (cached) {
          if (cached.customerPk != null) req.auth!.customerPk = cached.customerPk;
        } else {
          try {
            // Intentionally NOT wrapped in withDbSlot: every authenticated request
            // hits this path. Queuing behind heavy route work caused cascading
            // database_slot_timeout 503s ("Database is busy") while JWT was fine.
            await withSqlRetry(async () => {
              const db = getDb();
              const rows = await db
                .select({
                  sessionsInvalidBefore: customers.sessionsInvalidBefore,
                  id: customers.id,
                })
                .from(customers)
                .where(eq(customers.customerId, sub))
                .limit(1);
              const row = rows[0];
              const invalidBeforeSec = row?.sessionsInvalidBefore
                ? Math.floor(row.sessionsInvalidBefore.getTime() / 1000)
                : 0;
              const customerPk = row?.id ?? null;
              customerSessionCache.set(sub, {
                invalidBeforeSec,
                customerPk,
                checkedAt: Date.now(),
              });
              if (customerPk != null) req.auth!.customerPk = customerPk;
              if (invalidBeforeSec > 0 && iat > 0 && iat < invalidBeforeSec) {
                throwAuthError(401, "session_revoked", "Signed out from all devices.");
              }
            });
          } catch (sessionErr) {
            if (sessionErr instanceof AuthHttpError) throw sessionErr;
            if (!isDbUnavailable(sessionErr)) throw sessionErr;
            const stale = readCustomerSessionCache(sub, iat, CUSTOMER_SESSION_STALE_MS);
            if (stale === "revoked") {
              throwAuthError(401, "session_revoked", "Signed out from all devices.");
            }
            if (stale && stale.customerPk != null) {
              req.auth!.customerPk = stale.customerPk;
            }
            req.log?.warn?.(
              { err: sessionErr, sub },
              "[auth] customer session check skipped — DB unavailable after JWT verify"
            );
          }
        }
      }

      if (role === "merchant" || role === "rider") {
        const deviceId = typeof (payload as any).device_id === "string" ? (payload as any).device_id : undefined;
        if (deviceId) {
          const cachedValid = readMerchantDeviceSessionCache(sub, deviceId);
          if (cachedValid === false) {
            throwAuthError(401, "session_revoked", "Signed out from this device.");
          } else if (cachedValid !== true) {
            try {
              await withSqlRetry(async () => {
                const sql = getSql();
                const rows = await sql`
              SELECT id
              FROM user_device_sessions
              WHERE user_id = ${sub} AND device_id = ${deviceId} AND is_active = TRUE
              LIMIT 1
            `;
                if (!rows[0]) {
                  writeMerchantDeviceSessionCache(sub, deviceId, false);
                  throwAuthError(401, "session_revoked", "Signed out from this device.");
                }
                writeMerchantDeviceSessionCache(sub, deviceId, true);
              });
              void withSqlRetry(async () => {
                const sql = getSql();
                await sql`
              UPDATE user_device_sessions
              SET last_active = now()
              WHERE user_id = ${sub} AND device_id = ${deviceId} AND is_active = TRUE
            `;
              }).catch(() => undefined);
            } catch (sessionErr) {
              if (sessionErr instanceof AuthHttpError) throw sessionErr;
              if (!isDbUnavailable(sessionErr)) throw sessionErr;
              const staleValid = readMerchantDeviceSessionCache(
                sub,
                deviceId,
                MERCHANT_DEVICE_SESSION_STALE_MS
              );
              if (staleValid === false) {
                throwAuthError(401, "session_revoked", "Signed out from this device.");
              }
              req.log?.warn?.(
                { err: sessionErr, sub, deviceId },
                "[auth] device session check skipped — DB unavailable after JWT verify"
              );
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof AuthHttpError) throw err;
      if (!required) return;
      // JWT already failed (or unexpected error). Do not map slot timeouts here —
      // session-check DB unavailability is handled above with fail-open / stale cache.
      throwAuthError(401, "invalid_token", "Invalid token");
    }
  });
};

export const auth = fp(authPlugin, { name: "auth" });
