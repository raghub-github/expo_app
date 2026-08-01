import { DASHBOARD_DEFINITIONS } from "@/components/users/DashboardAccessSelector";

export type EffectiveAccessLevel =
  | "FULL_ACCESS"
  | "PARTIAL_ACCESS"
  | "VIEW_ONLY"
  | "OWN_RECORD"
  | "OVERALL_RECORD"
  | "RESTRICTED";

const ACCESS_LEVEL_LABELS: Record<EffectiveAccessLevel, string> = {
  FULL_ACCESS: "Full Access",
  PARTIAL_ACCESS: "Partial Access",
  VIEW_ONLY: "View Only",
  OWN_RECORD: "Own Record",
  OVERALL_RECORD: "Overall User Record",
  RESTRICTED: "Restricted",
};

/**
 * Compute real access level from selected access-point groups for a dashboard.
 * Does not trust the stored access_level column (historically always FULL_ACCESS).
 */
export function computeEffectiveAccessLevel(
  dashboardType: string,
  selectedGroups: string[]
): EffectiveAccessLevel {
  const type = String(dashboardType || "").toUpperCase();
  const groups = [...new Set(selectedGroups.map((g) => String(g).trim()).filter(Boolean))];

  if (type === "ANALYTICS") {
    if (groups.includes("ANALYTICS_OVERALL")) return "OVERALL_RECORD";
    if (groups.includes("ANALYTICS_OWN")) return "OWN_RECORD";
    return "OWN_RECORD";
  }

  const def = (DASHBOARD_DEFINITIONS as Record<string, { accessPoints: Array<{ group: string }> }>)[
    type
  ];
  const definedGroups = (def?.accessPoints ?? []).map((p) => p.group);

  // Dashboards with no configurable points: presence = full access to that dashboard.
  if (definedGroups.length === 0) {
    return "FULL_ACCESS";
  }

  if (groups.length === 0) {
    return "VIEW_ONLY";
  }

  const selectedDefined = groups.filter((g) => definedGroups.includes(g));
  if (selectedDefined.length === 0) {
    return "RESTRICTED";
  }

  if (selectedDefined.length >= definedGroups.length) {
    return "FULL_ACCESS";
  }

  const onlyView = selectedDefined.every(
    (g) => g.endsWith("_VIEW") || g.includes("_VIEW_") || g === "ORDER_VIEW" || g === "CUSTOMER_VIEW" || g === "MERCHANT_VIEW" || g === "RIDER_VIEW"
  );
  if (onlyView) return "VIEW_ONLY";

  return "PARTIAL_ACCESS";
}

export function formatAccessLevelLabel(level: string | null | undefined): string {
  const key = String(level || "").toUpperCase().replace(/\s+/g, "_") as EffectiveAccessLevel;
  if (key in ACCESS_LEVEL_LABELS) return ACCESS_LEVEL_LABELS[key];
  return String(level || "Unknown").replace(/_/g, " ");
}

/** Build accessLevel for each dashboard when saving grants. */
export function buildDashboardAccessPayload(
  selectedDashboards: string[],
  selectedAccessPoints: Record<string, string[]>
): Array<{ dashboardType: string; accessLevel: EffectiveAccessLevel }> {
  return selectedDashboards.map((dashboardType) => ({
    dashboardType,
    accessLevel: computeEffectiveAccessLevel(
      dashboardType,
      selectedAccessPoints[dashboardType] || []
    ),
  }));
}
