/**
 * Dashboard Bootstrap API
 * GET /api/auth/bootstrap - Single call returning session + permissions + dashboard-access
 * Reduces 3 round-trips to 1 for instant post-login UI (sidebar, nav, first paint).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getUserPermissions,
  getUserDashboardAccess,
} from "@/lib/permissions/engine";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { toPermissionKeys } from "@/lib/permissions/constants";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { getRedisClient } from "@/lib/redis";
import { getDb } from "@/lib/db/client";
import { dashboardAccessPoints } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];
const BOOTSTRAP_CACHE_TTL_SECONDS = 60; // Redis TTL; in‑memory cache uses a shorter window
const BOOTSTRAP_CACHE_TTL_MS = 10_000; // 10s — avoid duplicate work when client retries or multiple tabs
const bootstrapCache = new Map<string, { body: unknown; ts: number }>();

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

  const entry = bootstrapCache.get(userId);
  if (!entry || Date.now() - entry.ts > BOOTSTRAP_CACHE_TTL_MS) {
    if (entry) bootstrapCache.delete(userId);
    return null;
  }
  return entry.body;
}

async function setCachedBootstrap(userId: string, body: unknown): Promise<void> {
  const redis = getRedisClient();
  const cacheKey = `bootstrap_${userId}`;

  bootstrapCache.set(userId, { body, ts: Date.now() });
  if (bootstrapCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of bootstrapCache.entries()) {
      if (now - v.ts > BOOTSTRAP_CACHE_TTL_MS) bootstrapCache.delete(k);
    }
  }

  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(body), "EX", BOOTSTRAP_CACHE_TTL_SECONDS);
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
    const supabase = await createServerSupabaseClient();

    let user: { id: string; email?: string; [key: string]: unknown } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user ? { ...result.data.user, id: result.data.user.id, email: result.data.user.email } : null;
      userError = result.error ?? null;

      if (!userError && user) break;
      if (userError && isInvalidRefreshToken(userError)) break;
      if (userError && isNetworkOrTransientError(userError) && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
        continue;
      }
      break;
    }

    if (userError || !user) {
      if (userError && isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

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
      await setCachedBootstrap(user.id, unlinkedBody);
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
    const userPerms = await getUserPermissions(user.id, user.email!);

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
        allowedActions: (ap.allowedActions as string[]) ?? [],
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
        await supabase.auth.signOut();
      } catch {
        // ignore
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
