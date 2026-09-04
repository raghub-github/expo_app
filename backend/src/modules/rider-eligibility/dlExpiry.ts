/**
 * Pure DL-expiry lifecycle logic (§18–§21). Deterministic + unit-tested; the scheduled
 * notification job and any status display consume these. Eligibility itself already treats
 * an expired DL as EXPIRED (via rider_documents.expiry_date), so this module is only about
 * the WARNING lifecycle + which pre-expiry window is due to notify.
 */

export type DlExpiryStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";

export const DEFAULT_DL_EXPIRY_WARNING_DAYS = [30, 15, 7, 3, 1];

/** Parse a "30,15,7,3,1" config into a sorted-desc, de-duped, positive window list. */
export function parseWarningWindows(raw?: string | null): number[] {
  if (!raw) return [...DEFAULT_DL_EXPIRY_WARNING_DAYS];
  const parsed = String(raw)
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => b - a) : [...DEFAULT_DL_EXPIRY_WARNING_DAYS];
}

/** Whole days from `now` until `expiry` (negative once expired). Null if unparseable. */
export function daysUntil(expiry: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!expiry) return null;
  const t = expiry instanceof Date ? expiry.getTime() : new Date(String(expiry)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now.getTime()) / 86_400_000);
}

export function dlExpiryStatus(
  expiry: Date | string | null | undefined,
  now: Date = new Date(),
  windows: number[] = DEFAULT_DL_EXPIRY_WARNING_DAYS
): DlExpiryStatus {
  const d = daysUntil(expiry, now);
  if (d == null) return "UNKNOWN";
  if (d < 0) return "EXPIRED";
  const maxWindow = windows.length ? Math.max(...windows) : 0;
  return d <= maxWindow ? "EXPIRING_SOON" : "VALID";
}

/**
 * Warning windows whose threshold has been CROSSED (daysRemaining <= window) but not yet
 * notified. The job sends ONE notification for the most urgent (smallest) and records ALL of
 * them, so a job that missed an earlier threshold catches up without re-notifying later. Once
 * expired (daysRemaining < 0) this returns [] — expiry is handled by eligibility, not a warning.
 */
export function crossedUnnotifiedWindows(
  daysRemaining: number,
  windows: number[],
  alreadyNotified: number[]
): number[] {
  if (daysRemaining < 0) return [];
  const notified = new Set(alreadyNotified);
  return windows.filter((w) => daysRemaining <= w && !notified.has(w)).sort((a, b) => a - b);
}
