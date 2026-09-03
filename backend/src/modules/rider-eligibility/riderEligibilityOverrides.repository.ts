/**
 * Active admin ELIGIBILITY_OVERRIDE lookup (§31). Deploy-safe: tolerates the table not
 * existing yet (returns none) so the engine keeps working before the migration is applied.
 */
import { getSql } from "../../db/client.js";
import type { EligibilityOverride, EligibilityService } from "./eligibilityEngine.js";

export type OverrideRow = {
  id: number;
  riderId: number;
  serviceType: EligibilityService;
  reason: string;
  createdByLabel: string | null;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
};

function mapRow(r: Record<string, unknown>): OverrideRow {
  return {
    id: Number(r.id),
    riderId: Number(r.rider_id),
    serviceType: String(r.service_type) as EligibilityService,
    reason: String(r.reason ?? ""),
    createdByLabel: r.created_by_label == null ? null : String(r.created_by_label),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    createdAt: String(r.created_at ?? ""),
  };
}

/** All non-deleted overrides for a rider (active + inactive), newest first — for the admin UI. */
export async function listOverridesForRider(riderId: number): Promise<OverrideRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, rider_id, service_type, reason, created_by_label, is_active,
           effective_from, effective_to, created_at
    FROM rider_eligibility_overrides
    WHERE rider_id = ${riderId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return (Array.isArray(rows) ? rows : []).map(mapRow);
}

export async function insertOverride(args: {
  riderId: number;
  service: EligibilityService;
  reason: string;
  createdByLabel: string | null;
  effectiveTo: string | null;
}): Promise<OverrideRow> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO rider_eligibility_overrides
      (rider_id, service_type, reason, created_by_label, is_active, effective_from, effective_to)
    VALUES (${args.riderId}, ${args.service}, ${args.reason}, ${args.createdByLabel}, true, now(), ${args.effectiveTo})
    RETURNING id, rider_id, service_type, reason, created_by_label, is_active,
              effective_from, effective_to, created_at
  `) as Record<string, unknown>[];
  return mapRow((Array.isArray(rows) ? rows : [])[0] as Record<string, unknown>);
}

/** Revoke (soft-delete + deactivate) an override. Returns true if a row was affected. */
export async function revokeOverride(id: number, riderId: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE rider_eligibility_overrides
    SET is_active = false, deleted_at = now(), updated_at = now()
    WHERE id = ${id} AND rider_id = ${riderId} AND deleted_at IS NULL
    RETURNING id
  `) as Record<string, unknown>[];
  return (Array.isArray(rows) ? rows : []).length > 0;
}

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
