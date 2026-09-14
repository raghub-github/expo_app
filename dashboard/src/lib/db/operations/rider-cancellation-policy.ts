/**
 * Super-Admin rider-fault cancellation SLAB policy (per service) — read/write.
 * The backend reconciler reads these tables and the shared engine
 * (@gatimitra/financial-rules) decides blocks, so config and enforcement never diverge.
 */

import { getSql } from "@/lib/db/client";
import {
  validateCancellationSlabs,
  DEFAULT_CANCELLATION_SLABS,
  type CancellationSlab,
} from "@gatimitra/financial-rules";

export const CANCELLATION_POLICY_SERVICES = ["food", "parcel", "person_ride"] as const;
export type CancellationPolicyService = (typeof CANCELLATION_POLICY_SERVICES)[number];

export type CancellationPolicyServiceConfig = {
  serviceType: CancellationPolicyService;
  enabled: boolean;
  policyVersion: number;
  updatedBy: string | null;
  updatedAt: string | null;
  slabs: CancellationSlab[];
};

function isService(s: string): s is CancellationPolicyService {
  return (CANCELLATION_POLICY_SERVICES as readonly string[]).includes(s);
}

function toIso(v: string | Date | null): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function getCancellationPolicy(): Promise<CancellationPolicyServiceConfig[]> {
  const sql = getSql();
  const [headers, slabRows] = await Promise.all([
    sql`
      SELECT service_type, enabled, policy_version, updated_by, updated_at
      FROM rider_cancellation_policy
      WHERE service_type IN ('food','parcel','person_ride')
    ` as unknown as Promise<
      {
        service_type: string;
        enabled: boolean;
        policy_version: number;
        updated_by: string | null;
        updated_at: string | Date | null;
      }[]
    >,
    sql`
      SELECT service_type, slab_number, min_accepted, max_accepted,
             blocking_enabled, threshold_pct::float8 AS threshold_pct
      FROM rider_cancellation_policy_slabs
      WHERE service_type IN ('food','parcel','person_ride')
      ORDER BY service_type, min_accepted
    ` as unknown as Promise<
      {
        service_type: string;
        slab_number: number;
        min_accepted: number;
        max_accepted: number | null;
        blocking_enabled: boolean;
        threshold_pct: number;
      }[]
    >,
  ]);

  const slabsByService = new Map<CancellationPolicyService, CancellationSlab[]>();
  for (const r of slabRows) {
    if (!isService(r.service_type)) continue;
    const list = slabsByService.get(r.service_type) ?? [];
    list.push({
      slabNumber: Number(r.slab_number),
      minAccepted: Number(r.min_accepted),
      maxAccepted: r.max_accepted == null ? null : Number(r.max_accepted),
      blockingEnabled: r.blocking_enabled === true,
      thresholdPct: Number(r.threshold_pct),
    });
    slabsByService.set(r.service_type, list);
  }

  const headerByService = new Map(headers.filter((h) => isService(h.service_type)).map((h) => [h.service_type, h]));

  return CANCELLATION_POLICY_SERVICES.map((service) => {
    const h = headerByService.get(service);
    return {
      serviceType: service,
      enabled: h?.enabled === true,
      policyVersion: Number(h?.policy_version ?? 1),
      updatedBy: h?.updated_by ?? null,
      updatedAt: toIso(h?.updated_at ?? null),
      slabs: slabsByService.get(service) ?? [...DEFAULT_CANCELLATION_SLABS],
    };
  });
}

export type CancellationPolicyUpdate = {
  serviceType: CancellationPolicyService;
  enabled: boolean;
  slabs: CancellationSlab[];
};

export class CancellationPolicyValidationError extends Error {
  constructor(public readonly serviceType: string, public readonly errors: string[]) {
    super(`Invalid slabs for ${serviceType}: ${errors.join("; ")}`);
    this.name = "CancellationPolicyValidationError";
  }
}

/** Validate + persist. Bumps policy_version and replaces the service's slab rows atomically. */
export async function saveCancellationPolicy(
  updates: CancellationPolicyUpdate[],
  updatedBy: string
): Promise<CancellationPolicyServiceConfig[]> {
  const sql = getSql();

  // Validate everything before writing anything.
  for (const u of updates) {
    if (!isService(u.serviceType)) continue;
    const errors = validateCancellationSlabs(u.slabs);
    if (errors.length > 0) throw new CancellationPolicyValidationError(u.serviceType, errors);
  }

  await sql.begin(async (tx) => {
    for (const u of updates) {
      if (!isService(u.serviceType)) continue;
      await tx`
        INSERT INTO rider_cancellation_policy (service_type, enabled, policy_version, updated_by, updated_at)
        VALUES (${u.serviceType}, ${Boolean(u.enabled)}, 1, ${updatedBy}, now())
        ON CONFLICT (service_type) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          policy_version = rider_cancellation_policy.policy_version + 1,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `;
      await tx`DELETE FROM rider_cancellation_policy_slabs WHERE service_type = ${u.serviceType}`;
      for (const slab of u.slabs) {
        await tx`
          INSERT INTO rider_cancellation_policy_slabs
            (service_type, slab_number, min_accepted, max_accepted, blocking_enabled, threshold_pct)
          VALUES (
            ${u.serviceType}, ${Math.trunc(slab.slabNumber)}, ${Math.trunc(slab.minAccepted)},
            ${slab.maxAccepted == null ? null : Math.trunc(slab.maxAccepted)},
            ${Boolean(slab.blockingEnabled)},
            ${Math.min(100, Math.max(0, Number(slab.thresholdPct)))}
          )
        `;
      }
    }
  });

  return getCancellationPolicy();
}
