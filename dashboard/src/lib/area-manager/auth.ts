/**
 * Area Manager auth and scope helpers.
 * Resolve current area manager from session; enforce role and ownership.
 * Do NOT modify login/signup/OTP - use existing session only.
 */

import { getDb } from "@/lib/db/client";
import { areaManagers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { isSuperAdmin } from "@/lib/permissions/engine";
import type { NextRequest } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getAuthUserSafe } from "@/lib/auth/resolve-supabase-user";
import {
  DASHBOARD_IDENTITY_EMAIL_COOKIE,
  peekDashboardIdentity,
  rememberDashboardIdentity,
} from "@/lib/auth/auth-identity-cache";
import {
  isNetworkOrTransientError,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import { cookies, headers } from "next/headers";

export type ManagerType = "MERCHANT" | "RIDER";

export interface AreaManagerRecord {
  id: number;
  userId: number;
  managerType: "MERCHANT" | "RIDER";
  areaCode: string | null;
  localityCode: string | null;
  city: string | null;
  status: string;
}

export interface ResolvedAreaManager {
  areaManager: AreaManagerRecord;
  systemUserId: number;
  primaryRole: string;
  managerType: ManagerType;
  /** True when user is super admin; area_manager_id scope should be skipped (allow all). */
  isSuperAdmin?: boolean;
}

/**
 * Check if primary_role is an area manager role
 */
export function isAreaManagerRole(primaryRole: string): boolean {
  return (
    primaryRole === "AREA_MANAGER_MERCHANT" || primaryRole === "AREA_MANAGER_RIDER"
  );
}

/**
 * Map primary_role to manager type (for fallback when area_managers row is missing)
 */
export function getManagerTypeFromRole(primaryRole: string): ManagerType | null {
  if (primaryRole === "AREA_MANAGER_MERCHANT") return "MERCHANT";
  if (primaryRole === "AREA_MANAGER_RIDER") return "RIDER";
  return null;
}

function isSuperAdminRole(primaryRole: string | null | undefined): boolean {
  const role = String(primaryRole || "").trim().toUpperCase();
  return role === "SUPER_ADMIN" || role === "SUPERADMIN";
}

async function resolveDashboardEmail(user: {
  id: string;
  email?: string | null;
}): Promise<string | undefined> {
  const direct = user.email?.trim();
  if (direct?.includes("@")) return direct;
  const cached = peekDashboardIdentity(user.id)?.email?.trim();
  if (cached?.includes("@")) return cached;
  let fromCookie = "";
  try {
    fromCookie =
      (await cookies()).get(DASHBOARD_IDENTITY_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? "";
  } catch {
    fromCookie = "";
  }
  if (!fromCookie.includes("@")) {
    try {
      const header = (await headers()).get("cookie") ?? "";
      const match = header.match(
        new RegExp(`(?:^|;\\s*)${DASHBOARD_IDENTITY_EMAIL_COOKIE}=([^;]+)`, "i")
      );
      if (match?.[1]) {
        fromCookie = decodeURIComponent(match[1]).trim().toLowerCase();
      }
    } catch {
      fromCookie = "";
    }
  }
  if (fromCookie.includes("@")) {
    rememberDashboardIdentity(user.id, {
      email: fromCookie,
      systemUserNumericId: 0,
      primaryRole: "",
    });
    return fromCookie;
  }
  return undefined;
}

/**
 * Get area manager record by system user id
 */
export async function getAreaManagerByUserId(
  systemUserId: number
): Promise<AreaManagerRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: areaManagers.id,
      userId: areaManagers.userId,
      managerType: areaManagers.managerType,
      areaCode: areaManagers.areaCode,
      localityCode: areaManagers.localityCode,
      city: areaManagers.city,
      status: areaManagers.status,
    })
    .from(areaManagers)
    .where(
      and(eq(areaManagers.userId, systemUserId), eq(areaManagers.status, "ACTIVE"))
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    managerType: row.managerType as "MERCHANT" | "RIDER",
    areaCode: row.areaCode,
    localityCode: row.localityCode,
    city: row.city,
    status: row.status,
  };
}

/**
 * Get area manager record by area manager id (PK)
 */
export async function getAreaManagerById(
  areaManagerId: number
): Promise<AreaManagerRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: areaManagers.id,
      userId: areaManagers.userId,
      managerType: areaManagers.managerType,
      areaCode: areaManagers.areaCode,
      localityCode: areaManagers.localityCode,
      city: areaManagers.city,
      status: areaManagers.status,
    })
    .from(areaManagers)
    .where(eq(areaManagers.id, areaManagerId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    managerType: row.managerType as "MERCHANT" | "RIDER",
    areaCode: row.areaCode,
    localityCode: row.localityCode,
    city: row.city,
    status: row.status,
  };
}

/**
 * Resolve current area manager from Supabase auth (user id + email).
 * Returns null if not authenticated or not an area manager (or super admin can act as any).
 * Super admin: can access area-manager APIs but may not have an area_managers row; callers
 * that need a concrete area_manager_id should treat super admin separately (e.g. allow all or reject).
 */
export async function getAreaManagerFromAuth(
  supabaseAuthId: string,
  email: string | null | undefined
): Promise<ResolvedAreaManager | null> {
  const systemUser = await resolveSystemUserForSupabaseAuth(supabaseAuthId, email);
  if (!systemUser) return null;

  const superAdmin =
    isSuperAdminRole(systemUser.primary_role) ||
    (await isSuperAdmin(supabaseAuthId, email || systemUser.email || ""));
  if (superAdmin) {
    // Super admin can access area-manager APIs; no area scope (list all). Use managerType from role or default MERCHANT for UI.
    const roleType = getManagerTypeFromRole(systemUser.primary_role) ?? "MERCHANT";
    return {
      areaManager: {
        id: 0,
        userId: systemUser.id,
        managerType: roleType,
        areaCode: null,
        localityCode: null,
        city: null,
        status: "ACTIVE",
      },
      systemUserId: systemUser.id,
      primaryRole: systemUser.primary_role,
      managerType: roleType,
      isSuperAdmin: true,
    };
  }

  if (!isAreaManagerRole(systemUser.primary_role)) return null;

  const areaManager = await getAreaManagerByUserId(systemUser.id);
  if (areaManager) {
    return {
      areaManager,
      systemUserId: systemUser.id,
      primaryRole: systemUser.primary_role,
      managerType: areaManager.managerType,
    };
  }

  // Fallback: user has area manager role but no area_managers row yet
  const managerType = getManagerTypeFromRole(systemUser.primary_role);
  if (managerType) {
    return {
      areaManager: {
        id: 0,
        userId: systemUser.id,
        managerType,
        areaCode: null,
        localityCode: null,
        city: null,
        status: "ACTIVE",
      },
      systemUserId: systemUser.id,
      primaryRole: systemUser.primary_role,
      managerType,
    };
  }

  return null;
}

/**
 * Require area manager auth for API routes.
 * Returns { resolved } or { error: NextResponse }.
 * Use: const result = await requireAreaManagerApiAuth(getAuthUser); if (result.error) return result.error;
 *
 * `getAuthUser` may throw `TypeError: fetch failed` when Supabase Auth is unreachable —
 * we catch that and fall back to cookie-session resolve (same as page protection).
 *
 * Do not pass cookie-bound `supabase.auth.getUser()` from OTP routes. That refresh
 * can blank `sb-*` cookies and log the dashboard user out mid-registration.
 * Omit the callback so this uses cookie-safe `getAuthenticatedApiUser`.
 * Pass the incoming NextRequest as the second argument so compile/refresh
 * races do not 401 a live dashboard session.
 */
export async function requireAreaManagerApiAuth(
  getAuthUser?: () => Promise<{ id: string; email?: string } | null>,
  request?: NextRequest
): Promise<
  | { resolved: ResolvedAreaManager; error?: never }
  | { error: Response; resolved?: never }
> {
  let user: { id: string; email?: string } | null = null;
  if (getAuthUser) {
    try {
      user = await getAuthUser();
    } catch (err) {
      if (
        !(isTimeoutOrAbortError(err) || isNetworkOrTransientError(err)) &&
        process.env.NODE_ENV === "development"
      ) {
        console.warn("[requireAreaManagerApiAuth] getAuthUser failed:", err);
      }
      user = null;
    }
  }
  if (!user?.id) {
    const auth = await getAuthenticatedApiUser(request);
    if (auth.ok) {
      user = { id: auth.user.id, email: auth.user.email };
    } else if (auth.status === 503 || auth.status === 499) {
      return { error: authFailureResponse(auth) };
    }
  }
  if (!user?.id) {
    user = await getAuthUserSafe();
  }
  if (!user?.id) {
    let cookieHeader = "";
    try {
      cookieHeader = request?.headers.get("cookie") ?? (await headers()).get("cookie") ?? "";
    } catch {
      cookieHeader = request?.headers.get("cookie") ?? "";
    }
    if (/(?:^|;\s*)sb-/.test(cookieHeader)) {
      return {
        error: new Response(
          JSON.stringify({
            success: false,
            error: "Service temporarily unavailable",
            code: "SERVICE_UNAVAILABLE",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Not authenticated", code: "SESSION_REQUIRED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const email = await resolveDashboardEmail(user);
  let resolved = await getAreaManagerFromAuth(user.id, email || user.email);
  if (!resolved) {
    const fallbackUser = await getAuthUserSafe();
    if (fallbackUser?.id && fallbackUser.id !== user.id) {
      const fallbackEmail = await resolveDashboardEmail(fallbackUser);
      resolved = await getAreaManagerFromAuth(
        fallbackUser.id,
        fallbackEmail || fallbackUser.email
      );
    }
  }
  if (!resolved) {
    return {
      error: new Response(
        JSON.stringify({
          success: false,
          error: "Area manager access required",
          code: "AREA_MANAGER_REQUIRED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { resolved };
}

/**
 * Require merchant area manager (store flow). Returns error response if not MERCHANT type.
 */
export function requireMerchantManager(
  resolved: ResolvedAreaManager
): Response | null {
  if (resolved.isSuperAdmin) return null;
  if (resolved.managerType !== "MERCHANT") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Merchant area manager access required",
        code: "MERCHANT_AM_REQUIRED",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

/**
 * Require rider area manager (rider flow). Returns error response if not RIDER type.
 * Super admins are allowed (global scope; callers already use isSuperAdmin → null areaManagerId).
 */
export function requireRiderManager(
  resolved: ResolvedAreaManager
): Response | null {
  if (resolved.isSuperAdmin) return null;
  if (resolved.managerType !== "RIDER") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Rider area manager access required",
        code: "RIDER_AM_REQUIRED",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
