/**
 * Cross-app push isolation — defense in depth for foreground presentation.
 *
 * Backend must already send only to the correct FCM/Expo tokens. This helper
 * suppresses display when a payload is explicitly stamped for another app
 * (shared Firebase project / mis-routed campaign).
 *
 * Legacy / operational payloads without appRole/target_app are allowed so
 * Rider dispatch and Merchant new-order alerts keep working.
 */

export type GatiMitraAppAudience = "customer" | "merchant" | "rider";

function readAudienceField(data: Record<string, unknown> | null | undefined): string {
  if (!data || typeof data !== "object") return "";
  for (const key of ["appRole", "app_role", "target_app", "targetApp"]) {
    const v = data[key];
    if (v != null && String(v).trim()) return String(v).trim().toLowerCase();
  }
  return "";
}

/**
 * Returns true when the push is explicitly addressed to a different app.
 * Returns false for missing/unknown/all — do not drop legitimate order alerts.
 */
export function isForeignAppPush(
  data: Record<string, unknown> | null | undefined,
  self: GatiMitraAppAudience,
): boolean {
  const role = readAudienceField(data);
  if (!role || role === "all") return false;
  if (role !== "customer" && role !== "merchant" && role !== "rider") return false;
  return role !== self;
}

/** Foreground presentation when this notification belongs to another app. */
export const FOREIGN_APP_NOTIFICATION_PRESENTATION = {
  shouldShowAlert: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
} as const;
