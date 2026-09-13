/**
 * Super-Admin config for the rider cancellation-rate auto-block, per service.
 * The backend reconciler reads this table and applies/releases blocks accordingly.
 */

import { getSql } from "@/lib/db/client";

export const CANCELLATION_BLOCK_SERVICES = ["food", "parcel", "person_ride"] as const;
export type CancellationBlockService = (typeof CANCELLATION_BLOCK_SERVICES)[number];

export type CancellationBlockConfigRow = {
  serviceType: CancellationBlockService;
  thresholdPct: number;
  minAccepted: number;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

function isService(s: string): s is CancellationBlockService {
  return (CANCELLATION_BLOCK_SERVICES as readonly string[]).includes(s);
}

export async function getCancellationBlockConfig(): Promise<CancellationBlockConfigRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT service_type, threshold_pct::float8 AS threshold_pct, min_accepted, enabled,
           updated_by, updated_at
    FROM rider_cancellation_block_config
    WHERE service_type IN ('food','parcel','person_ride')
  `) as unknown as {
    service_type: string;
    threshold_pct: number;
    min_accepted: number;
    enabled: boolean;
    updated_by: string | null;
    updated_at: string | Date | null;
  }[];

  const byService = new Map<CancellationBlockService, CancellationBlockConfigRow>();
  for (const r of rows) {
    if (!isService(r.service_type)) continue;
    byService.set(r.service_type, {
      serviceType: r.service_type,
      thresholdPct: Number(r.threshold_pct),
      minAccepted: Number(r.min_accepted),
      enabled: r.enabled === true,
      updatedBy: r.updated_by ?? null,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : (r.updated_at ?? null),
    });
  }
  // Always return all three services (seed defaults for any missing row).
  return CANCELLATION_BLOCK_SERVICES.map(
    (s) =>
      byService.get(s) ?? {
        serviceType: s,
        thresholdPct: 0,
        minAccepted: 20,
        enabled: false,
        updatedBy: null,
        updatedAt: null,
      }
  );
}

export type CancellationBlockConfigUpdate = {
  serviceType: CancellationBlockService;
  thresholdPct: number;
  minAccepted: number;
  enabled: boolean;
};

export async function upsertCancellationBlockConfig(
  updates: CancellationBlockConfigUpdate[],
  updatedBy: string
): Promise<void> {
  const sql = getSql();
  for (const u of updates) {
    if (!isService(u.serviceType)) continue;
    const threshold = Math.min(100, Math.max(0, Number(u.thresholdPct)));
    const minAccepted = Math.max(0, Math.trunc(Number(u.minAccepted)));
    await sql`
      INSERT INTO rider_cancellation_block_config
        (service_type, threshold_pct, min_accepted, enabled, updated_by, updated_at)
      VALUES (${u.serviceType}, ${threshold}, ${minAccepted}, ${Boolean(u.enabled)}, ${updatedBy}, now())
      ON CONFLICT (service_type) DO UPDATE SET
        threshold_pct = EXCLUDED.threshold_pct,
        min_accepted = EXCLUDED.min_accepted,
        enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;
  }
}
