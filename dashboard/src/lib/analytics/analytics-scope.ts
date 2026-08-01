import { getDb } from "@/lib/db/client";
import { dashboardAccessPoints, type AccessPointGroup } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserPermissions, hasDashboardAccess } from "@/lib/permissions/engine";

export type AnalyticsRecordScope = "OWN" | "OVERALL";

export type AnalyticsCategory = "agents" | "tickets" | "orders" | "sessions";

/**
 * Resolve Analytics record scope for a system user.
 * Super admin → OVERALL. Otherwise ANALYTICS_OVERALL wins over ANALYTICS_OWN.
 * Users with ANALYTICS dashboard but no scope point default to OWN.
 */
export async function resolveAnalyticsRecordScope(
  systemUserId: number,
  options?: { isSuperAdmin?: boolean }
): Promise<AnalyticsRecordScope | null> {
  if (options?.isSuperAdmin) return "OVERALL";

  const hasAnalytics = await hasDashboardAccess(systemUserId, "ANALYTICS");
  if (!hasAnalytics) return null;

  const db = getDb();
  const rows = await db
    .select({ group: dashboardAccessPoints.accessPointGroup })
    .from(dashboardAccessPoints)
    .where(
      and(
        eq(dashboardAccessPoints.systemUserId, systemUserId),
        eq(dashboardAccessPoints.dashboardType, "ANALYTICS"),
        eq(dashboardAccessPoints.isActive, true),
        inArray(dashboardAccessPoints.accessPointGroup, [
          "ANALYTICS_OWN",
          "ANALYTICS_OVERALL",
        ] as AccessPointGroup[])
      )
    );

  const groups = new Set(rows.map((r) => String(r.group)));
  if (groups.has("ANALYTICS_OVERALL")) return "OVERALL";
  if (groups.has("ANALYTICS_OWN")) return "OWN";
  return "OWN";
}

export async function resolveAnalyticsAccessByAuth(
  supabaseAuthId: string,
  email: string
): Promise<{
  systemUserId: number;
  isSuperAdmin: boolean;
  scope: AnalyticsRecordScope;
} | null> {
  const perms = await getUserPermissions(supabaseAuthId, email);
  // UserPermissions has no `exists` field — null means unmapped / inactive account.
  if (!perms?.systemUserId) return null;

  // Super admin always has overall analytics (no dashboard_access row required).
  if (perms.isSuperAdmin) {
    return {
      systemUserId: perms.systemUserId,
      isSuperAdmin: true,
      scope: "OVERALL",
    };
  }

  const scope = await resolveAnalyticsRecordScope(perms.systemUserId, {
    isSuperAdmin: false,
  });
  if (!scope) return null;

  return {
    systemUserId: perms.systemUserId,
    isSuperAdmin: false,
    scope,
  };
}

/** OWN forces self; OVERALL may target any agent (or all when null). */
export function resolveTargetAgentIds(
  scope: AnalyticsRecordScope,
  viewerSystemUserId: number,
  requestedAgentId: number | null
): number[] | null {
  if (scope === "OWN") return [viewerSystemUserId];
  if (requestedAgentId != null && requestedAgentId > 0) return [requestedAgentId];
  return null; // all agents
}

export function parseAnalyticsCategory(raw: string | null | undefined): AnalyticsCategory | null {
  const v = String(raw || "").toLowerCase();
  if (v === "agents" || v === "tickets" || v === "orders" || v === "sessions") {
    return v;
  }
  return null;
}
