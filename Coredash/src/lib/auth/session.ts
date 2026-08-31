import { cookies } from "next/headers";
import { getSql, safeQuery } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { COREDASH_ACCESS_COOKIE, NOT_AUTHORIZED, isSuperAdminRole } from "@/lib/auth/access";
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

export async function resolveCoreSession(): Promise<CoreSessionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id || !user.email) {
    return { ok: false, status: 401 };
  }

  const cookieStore = await cookies();
  const accessUid = cookieStore.get(COREDASH_ACCESS_COOKIE)?.value ?? "";
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

  return {
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
