/**
 * Pure Force Assignment radius helpers (no DB).
 * Auto-dispatch Wave-1 radius must never be used here.
 */

/** Max merchant-centric radius for Force Assignment / admin rider picker. */
export const ADMIN_SELECTABLE_MAX_RADIUS_KM = 10;

/**
 * Resolve Force Assignment / admin hard-assign radius in meters.
 * Never falls back to auto-dispatch Wave-1 — missing/invalid → admin max (10 km).
 */
export function resolveForceAssignmentRadiusMeters(radiusKm?: number | null): number {
  const raw =
    radiusKm != null && Number.isFinite(Number(radiusKm))
      ? Number(radiusKm)
      : ADMIN_SELECTABLE_MAX_RADIUS_KM;
  const clampedKm = Math.min(ADMIN_SELECTABLE_MAX_RADIUS_KM, Math.max(0.5, raw));
  return Math.round(clampedKm * 1000);
}
