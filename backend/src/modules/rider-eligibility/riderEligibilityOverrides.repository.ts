/**
 * Active admin ELIGIBILITY_OVERRIDE lookup (§31). Deploy-safe: tolerates the table not
 * existing yet (returns none) so the engine keeps working before the migration is applied.
 */
import { getSql } from "../../db/client.js";
import type { EligibilityOverride, EligibilityService } from "./eligibilityEngine.js";

export async function loadActiveOverridesForRider(
  riderId: number
): Promise<Partial<Record<EligibilityService, EligibilityOverride>>> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT service_type, reason, approved_by, effective_from, effective_to
      FROM rider_eligibility_overrides
      WHERE rider_id = ${riderId}
        AND is_active = true
        AND deleted_at IS NULL
        AND (effective_from IS NULL OR effective_from <= now())
        AND (effective_to IS NULL OR effective_to >= now())
      ORDER BY created_at DESC
    `) as Array<{
      service_type: string;
      reason: string;
      approved_by: number | null;
      effective_from: string | null;
      effective_to: string | null;
    }>;

    const out: Partial<Record<EligibilityService, EligibilityOverride>> = {};
    for (const r of rows) {
      const svc = r.service_type as EligibilityService;
      if (out[svc]) continue; // newest wins (ORDER BY created_at DESC)
      out[svc] = {
        reason: r.reason,
        approvedBy: r.approved_by == null ? null : String(r.approved_by),
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
      };
    }
    return out;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).toLowerCase();
    if (msg.includes("does not exist") || msg.includes("relation")) return {};
    // Never let overrides wedge eligibility — treat any failure as "no overrides".
    return {};
  }
}
