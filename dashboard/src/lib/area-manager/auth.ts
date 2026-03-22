/**
 * Area Manager auth and scope helpers.
 * Resolve current area manager from session; enforce role and ownership.
 * Do NOT modify login/signup/OTP - use existing session only.
 */

import { getDb } from "@/lib/db/client";
import { areaManagers, systemUsers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isSuperAdmin } from "@/lib/permissions/engine";

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
  const systemUser = await getSystemUserByEmail(email ?? undefined);
  if (!systemUser) return null;

  const superAdmin = await isSuperAdmin(supabaseAuthId, email ?? "");
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
    // Return a virtual "area manager" with id 0 so callers can still scope by role
    // but no area_manager_id filter (or use systemUserId as scope). Prefer creating area_managers row.
    return null;
  }

  return null;
}

/**
 * Require area manager auth for API routes.
 * Returns { resolved } or { error: NextResponse }.
 * Use: const result = await requireAreaManagerApiAuth(request); if (result.error) return result.error;
 */
export async function requireAreaManagerApiAuth(
  getAuthUser: () => Promise<{ id: string; email?: string } | null>
): Promise<
  | { resolved: ResolvedAreaManager; error?: never }
  | { error: Response; resolved?: never }
> {
  const user = await getAuthUser();
  if (!user?.email) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Not authenticated", code: "SESSION_REQUIRED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const resolved = await getAreaManagerFromAuth(user.id, user.email);
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
 */
export function requireRiderManager(
  resolved: ResolvedAreaManager
): Response | null {
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
