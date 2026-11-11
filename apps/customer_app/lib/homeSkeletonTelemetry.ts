/**
 * Home skeleton → content telemetry. Logs only — never gates UI.
 * Force hold is opt-in via EXPO_PUBLIC_FORCE_HOME_SKELETON_MS only (never default-on).
 */
import { startupLaunchLog, startupProcessAgeMs } from "@/lib/startupPerf";

export type HomeSkeletonSection =
  | "location"
  | "weather"
  | "promo"
  | "services"
  | "service_image"
  | "brand";

const lastByKey = new Map<string, string>();

function onceKey(section: HomeSkeletonSection, event: string, detail?: string) {
  return `${section}:${event}:${detail ?? ""}`;
}

export function homeSkeletonLog(
  event:
    | "SKELETON_MOUNTED"
    | "SKELETON_VISIBLE"
    | "SKELETON_SKIPPED_CACHE_HIT"
    | "CONTENT_FETCH_STARTED"
    | "CONTENT_RENDERED"
    | "SKELETON_REPLACED",
  section: HomeSkeletonSection,
  reason: string,
  extra?: Record<string, unknown>
) {
  const key = onceKey(section, event, reason);
  if (lastByKey.get(section) === key && event !== "SKELETON_VISIBLE") return;
  lastByKey.set(section, key);
  startupLaunchLog(event, {
    section,
    reason,
    ageMs: startupProcessAgeMs(),
    t: Date.now(),
    ...extra,
  });
}

/**
 * Opt-in QA only. Unset / "0" → never force skeletons (dev or prod).
 * Set EXPO_PUBLIC_FORCE_HOME_SKELETON_MS=N to hold main-content skeletons for N ms.
 */
export function getForcedHomeSkeletonHoldMs(): number {
  const raw = process.env.EXPO_PUBLIC_FORCE_HOME_SKELETON_MS;
  if (raw == null || raw === "" || raw === "0") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8_000) : 0;
}

export function shouldForceHomeSkeletons(splashExitedAtMs: number | null): boolean {
  const hold = getForcedHomeSkeletonHoldMs();
  if (hold <= 0) return false;
  if (splashExitedAtMs == null) return true;
  return Date.now() - splashExitedAtMs < hold;
}
