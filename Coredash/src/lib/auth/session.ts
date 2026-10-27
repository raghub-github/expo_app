import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getSql, safeQuery } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  COREDASH_ACCESS_COOKIE,
  NOT_AUTHORIZED,
  isCoredashAuthCookie,
  isSuperAdminRole,
} from "@/lib/auth/access";
import { logAuthEvent } from "@/lib/auth/log";

export type CoreUser = {
  authId: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  systemUserId: number;
};

export class CoreAuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "CoreAuthError";
    this.status = status;
  }
}

async function hasSuperAdminAssignment(systemUserId: number): Promise<boolean> {
  const sql = getSql();
  const rows = await safeQuery(
    "sa-roles",
    () =>
      sql<{ ok: number }[]>`
        SELECT 1::int AS ok
        FROM user_roles ur
        INNER JOIN system_roles sr ON sr.id = ur.role_id
        WHERE ur.system_user_id = ${systemUserId}
          AND COALESCE(ur.is_active, true) = true
          AND ur.revoked_at IS NULL
          AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
          AND (
            upper(replace(sr.role_type::text, '-', '_')) IN ('SUPER_ADMIN', 'SUPERADMIN')
            OR upper(replace(sr.role_id, '-', '_')) IN ('SUPER_ADMIN', 'SUPERADMIN')
          )
        LIMIT 1
      `,
    []
  );
  return Boolean(rows[0]);
}

export async function systemUserIsSuperAdmin(systemUserId: number, primaryRole: string): Promise<boolean> {
  if (isSuperAdminRole(primaryRole)) return true;
  return hasSuperAdminAssignment(systemUserId);
}

export async function findActiveSuperAdminByEmail(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  const sql = getSql();
  const rows = await safeQuery(
    "sa-by-email",
    () =>
      sql<{ id: number; primary_role: string; status: string }[]>`
        SELECT id, primary_role::text AS primary_role, status::text AS status
        FROM system_users
        WHERE lower(trim(email)) = ${email} AND deleted_at IS NULL
        LIMIT 1
      `,
    []
  );
  const row = rows[0];
  if (!row) return null;
  if (String(row.status || "").toUpperCase() !== "ACTIVE") return null;
  if (!(await systemUserIsSuperAdmin(Number(row.id), row.primary_role))) return null;
  return row;
}

export type CoreSessionResult =
  | { ok: true; user: CoreUser }
  | { ok: false; status: 401 | 403 };

const SESSION_CACHE_MS = 60_000;
const SESSION_CACHE_MAX = 500;
const sessionCache = new Map<string, { at: number; result: CoreSessionResult }>();
/** Collapse parallel avatar/API auth storms onto one Supabase+DB round-trip per caller. */
const sessionInflight = new Map<string, Promise<CoreSessionResult>>();

/**
 * Cache key = access uid + a hash of the Supabase auth cookies that uid was
 * verified with.
 *
 * Keying on `coredash_access` alone is NOT safe: that cookie holds the plain
 * Supabase user id (see api/auth/set-cookie), so anyone who learns the uid
 * could present it with no auth token at all and get a warm `{ ok: true }`
 * entry straight back — a full super-admin bypass for the cache lifetime.
 * Folding the auth token into the key means a hit requires actually holding
 * the credential, while a returning admin still reuses their own entry.
 */
function sessionCacheKey(
  authCookies: { name: string; value: string }[],
  accessUid: string
): string {
  if (!accessUid) return "";
  const material = authCookies
    .filter((c) => isCoredashAuthCookie(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`)
    .join("\n");
  // No auth cookie → nothing binds the uid to a credential, so never cache.
  if (!material) return "";
  return `${accessUid}:${createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

/** Token refreshes mint new keys; drop expired entries so the map can't grow forever. */
function pruneSessionCache(now: number): void {
  if (sessionCache.size <= SESSION_CACHE_MAX) return;
  for (const [key, entry] of sessionCache) {
    if (now - entry.at >= SESSION_CACHE_MS) sessionCache.delete(key);
  }
}

async function resolveCoreSessionUncached(
  accessUid: string,
  cacheKey: string
): Promise<CoreSessionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id || !user.email) {
    return { ok: false, status: 401 };
  }

  if (accessUid !== user.id) {
    logAuthEvent("ACCESS_COOKIE_MISMATCH", {
      userId: user.id,
      reason: accessUid ? "bound_uid_mismatch" : "missing_access_cookie",
    });
    return { ok: false, status: 401 };
  }

  const email = user.email;
  const sql = getSql();
  const rows = await safeQuery(
    "system-user",
    () =>
      sql<
        { id: number; full_name: string; primary_role: string; status: string }[]
      >`
        SELECT id, full_name, primary_role::text AS primary_role, status::text AS status
        FROM system_users
        WHERE lower(trim(email)) = ${email.trim().toLowerCase()}
          AND deleted_at IS NULL
        LIMIT 1
      `,
    []
  );

  const row = rows[0];
  if (!row) {
    logAuthEvent("FORBIDDEN", { userId: user.id, email, reason: "no_system_user" });
    return { ok: false, status: 403 };
  }
  const status = String(row.status || "").toUpperCase();
  if (status && status !== "ACTIVE") {
    logAuthEvent("FORBIDDEN", { userId: user.id, email, reason: "inactive" });
    return { ok: false, status: 403 };
  }
  if (!(await systemUserIsSuperAdmin(Number(row.id), row.primary_role))) {
    logAuthEvent("FORBIDDEN", { userId: user.id, email, reason: "not_super_admin" });
    return { ok: false, status: 403 };
  }

  const ok: CoreSessionResult = {
    ok: true,
    user: {
      authId: user.id,
      email: user.email,
      fullName: row.full_name || user.email.split("@")[0],
      role: row.primary_role || "USER",
      status: row.status || "ACTIVE",
      systemUserId: Number(row.id),
    },
  };
  if (cacheKey) {
    const at = Date.now();
    pruneSessionCache(at);
    sessionCache.set(cacheKey, { at, result: ok });
  }
  return ok;
}

export async function resolveCoreSession(): Promise<CoreSessionResult> {
  const cookieStore = await cookies();
  const accessUid = cookieStore.get(COREDASH_ACCESS_COOKIE)?.value ?? "";
  const cacheKey = sessionCacheKey(cookieStore.getAll(), accessUid);
  if (cacheKey) {
    const cached = sessionCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return cached.result;
    const pending = sessionInflight.get(cacheKey);
    if (pending) return pending;
    const run = resolveCoreSessionUncached(accessUid, cacheKey).finally(() => {
      sessionInflight.delete(cacheKey);
    });
    sessionInflight.set(cacheKey, run);
    return run;
  }
  return resolveCoreSessionUncached(accessUid, "");
}

export async function getCurrentCoreUser(): Promise<CoreUser | null> {
  const result = await resolveCoreSession();
  return result.ok ? result.user : null;
}

export async function requireCoreUser(): Promise<CoreUser> {
  const result = await resolveCoreSession();
  if (!result.ok) {
    throw new CoreAuthError(result.status, result.status === 403 ? NOT_AUTHORIZED : "UNAUTHORIZED");
  }
  return result.user;
}
