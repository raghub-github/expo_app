/**
 * Dashboard Bootstrap API
 * GET /api/auth/bootstrap - Single call returning session + permissions + dashboard-access
 * Reduces 3 round-trips to 1 for instant post-login UI (sidebar, nav, first paint).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUserPermissions,
  getUserDashboardAccess,
} from "@/lib/permissions/engine";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { toPermissionKeys } from "@/lib/permissions/constants";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  signOutIfSessionDead,
} from "@/lib/auth/session-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRedisClient } from "@/lib/redis";
import { getDb } from "@/lib/db/client";
import { dashboardAccessPoints } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveAllowedActions } from "@/lib/permissions/access-point-defaults";
import {
  bootstrapMemoryCache,
  getBootstrapMemoryTtlMs,
  getBootstrapRedisTtlSeconds,
} from "@/lib/auth/bootstrap-cache";
import {
  rememberDashboardIdentity,
  DASHBOARD_IDENTITY_EMAIL_COOKIE,
  dashboardIdentityEmailCookieOptions,
} from "@/lib/auth/auth-identity-cache";

export const runtime = "nodejs";

async function getCachedBootstrap(userId: string): Promise<unknown | null> {
  const redis = getRedisClient();
  const cacheKey = `bootstrap_${userId}`;

  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      if (raw) {
        return JSON.parse(raw) as unknown;
      }
    } catch {
      // Ignore Redis errors and fall back to in-memory cache.
    }
  }

  const entry = bootstrapMemoryCache.get(userId);
  const ttl = getBootstrapMemoryTtlMs();
  if (!entry || Date.now() - entry.ts > ttl) {
    if (entry) bootstrapMemoryCache.delete(userId);
    return null;
  }
  return entry.body;
}

async function setCachedBootstrap(userId: string, body: unknown): Promise<void> {
  const redis = getRedisClient();
  const cacheKey = `bootstrap_${userId}`;
  const ttlMs = getBootstrapMemoryTtlMs();

  bootstrapMemoryCache.set(userId, { body, ts: Date.now() });
  if (bootstrapMemoryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of bootstrapMemoryCache.entries()) {
      if (now - v.ts > ttlMs) bootstrapMemoryCache.delete(k);
    }
  }

  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(body), "EX", getBootstrapRedisTtlSeconds());
    } catch {
      // Ignore Redis write errors; in-memory cache still works.
    }
  }
}

const ALL_DASHBOARDS = [
  "RIDER", "MERCHANT", "CUSTOMER",
  "ORDER_FOOD", "ORDER_PERSON_RIDE", "ORDER_PARCEL",
  "TICKET", "OFFER", "AREA_MANAGER", "PAYMENT", "SYSTEM", "ANALYTICS",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const user = auth.user;

    const cached = await getCachedBootstrap(user.id);
    if (cached) return NextResponse.json(cached);

    const mapped = await resolveSystemUserForSupabaseAuth(user.id, user.email);
    if (!mapped) {
      // Authenticated in Supabase but no `system_users` row (yet). Return 200 so clients
      // seed cache and show setup messaging — not HTTP 404 (that breaks devtools and retries).
      const unlinkedBody = {
        success: true as const,
        data: {
          session: { user },
          permissions: {
            exists: false,
            systemUserId: null,
            isSuperAdmin: false,
            canTogglePortal: false,
            roles: [] as const,
            permissions: [] as const,
            permissionStrings: [] as const,
            message: "User not found in system_users table",
          },
          dashboardAccess: { dashboards: [], accessPoints: [] },
          systemUser: null as null,
          status: "pending_system_user" as const,
        },
      };
      // Do not cache a miss — cookie JWT often omits email on the first request.
      const response = NextResponse.json(unlinkedBody);
      response.cookies.set("gm_portal_toggle_access", "0", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    // Single permissions call (engine caches per-request)
    const userPerms = await getUserPermissions(user.id, user.email ?? "");

    const permissionsPayload = userPerms
      ? {
          exists: true,
          systemUserId: userPerms.systemUserId,
          isSuperAdmin: userPerms.isSuperAdmin,
          canTogglePortal: userPerms.canTogglePortal,
          roles: userPerms.roles,
          permissions: userPerms.permissions,
          permissionStrings: toPermissionKeys(userPerms.permissions),
        }
      : {
          exists: false,
          systemUserId: null,
          isSuperAdmin: false,
          canTogglePortal: false,
          roles: [],
          permissions: [],
          permissionStrings: [],
          message: "User not found in system_users table",
        };

    const userIsSuperAdmin = userPerms?.isSuperAdmin ?? false;

    let dashboards: Array<{ dashboardType: string; accessLevel: string; isActive: boolean }>;
    let accessPoints: Array<{
      dashboardType: string;
      accessPointGroup: string;
      accessPointName: string;
      allowedActions: string[];
      isActive: boolean;
    }>;

    if (userIsSuperAdmin) {
      dashboards = ALL_DASHBOARDS.map((dt) => ({
        dashboardType: dt,
        accessLevel: "FULL_ACCESS",
        isActive: true,
      }));
      accessPoints = [];
    } else {
      const dashboardRows = await getUserDashboardAccess(mapped.id);
      dashboards = dashboardRows.map((d) => ({
        dashboardType: d.dashboardType,
        accessLevel: d.accessLevel,
        isActive: d.isActive,
      }));
      const db = getDb();
      const accessPointRows = await db
        .select()
        .from(dashboardAccessPoints)
        .where(
          and(
            eq(dashboardAccessPoints.systemUserId, mapped.id),
            eq(dashboardAccessPoints.isActive, true)
          )
        );
      accessPoints = accessPointRows.map((ap) => ({
        dashboardType: ap.dashboardType,
        accessPointGroup: ap.accessPointGroup,
        accessPointName: ap.accessPointName,
        allowedActions: resolveAllowedActions(ap.accessPointGroup, ap.allowedActions),
        isActive: ap.isActive === true,
      }));
    }

    const body = {
      success: true,
      data: {
        session: { user },
        permissions: permissionsPayload,
        dashboardAccess: { dashboards, accessPoints },
        systemUser: {
          id: mapped.id,
          systemUserId: mapped.system_user_id,
          fullName: mapped.full_name,
          email: mapped.email,
        },
        status: "active" as const,
      },
    };
    await setCachedBootstrap(user.id, body);
    const response = NextResponse.json(body);
    if (mapped.email) {
      rememberDashboardIdentity(user.id, {
        email: mapped.email,
        systemUserNumericId: mapped.id,
        primaryRole: mapped.primary_role,
      });
      response.cookies.set(
        DASHBOARD_IDENTITY_EMAIL_COOKIE,
        mapped.email.trim().toLowerCase(),
        dashboardIdentityEmailCookieOptions()
      );
    }
    response.cookies.set("gm_portal_toggle_access", userPerms?.canTogglePortal ? "1" : "0", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    if (isInvalidRefreshToken(error)) {
      try {
        const supabase = await createServerSupabaseClient();
        await signOutIfSessionDead(supabase, error);
      } catch {
        // ignore
      }
      if (isRefreshTokenAlreadyUsed(error)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    console.error("[GET /api/auth/bootstrap] Error:", error);
    return NextResponse.json(
      { success: false, error: "Bootstrap failed" },
      { status: 500 }
    );
  }
}
