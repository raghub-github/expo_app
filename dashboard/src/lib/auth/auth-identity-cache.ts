/**
 * Process-local map: Supabase Auth UUID → dashboard identity.
 * Cookie JWTs often omit email; system_users.system_user_id is SUPER_ADMIN001,
 * not the Auth UUID — so permission checks must remember email from login.
 */
export const DASHBOARD_IDENTITY_EMAIL_COOKIE = "gm_auth_email";

const TTL_MS = 30 * 60 * 1000;
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

type CachedDashboardIdentity = {
  email: string;
  systemUserNumericId: number;
  primaryRole: string;
  until: number;
};

const byAuthId = new Map<string, CachedDashboardIdentity>();

export function rememberDashboardIdentity(
  authId: string,
  identity: { email: string; systemUserNumericId: number; primaryRole: string }
): void {
  const id = authId.trim();
  const email = identity.email.trim().toLowerCase();
  if (!id || !email.includes("@")) return;
  byAuthId.set(id, {
    email,
    systemUserNumericId: identity.systemUserNumericId,
    primaryRole: identity.primaryRole,
    until: Date.now() + TTL_MS,
  });
  if (byAuthId.size > 500) {
    const now = Date.now();
    for (const [k, v] of byAuthId.entries()) {
      if (now > v.until) byAuthId.delete(k);
    }
  }
}

export function dashboardIdentityEmailCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}

export function peekDashboardIdentity(authId: string | null | undefined): CachedDashboardIdentity | null {
  const id = String(authId || "").trim();
  if (!id) return null;
  const row = byAuthId.get(id);
  if (!row) return null;
  if (Date.now() > row.until) {
    byAuthId.delete(id);
    return null;
  }
  return row;
}
