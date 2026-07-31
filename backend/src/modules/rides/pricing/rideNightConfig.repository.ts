/**
 * Load active night charge config for a geo (nearest ancestor via simple
 * city → state fallback; full chain can reuse pricing geo later).
 */

import { getSql } from "../../../db/client.js";
import type { NightChargeConfig } from "./rideNightCharge.js";
import type { ComponentFundingMode } from "./rideWaitingCharge.js";

export type NightConfigRow = NightChargeConfig & {
  id: number;
  geoLevel: string;
  geoRefId: string;
  name: string;
};

function mapRow(r: Record<string, unknown>): NightConfigRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level),
    geoRefId: String(r.geo_ref_id),
    name: String(r.name ?? "Night charge"),
    startTime: String(r.start_time).slice(0, 8),
    endTime: String(r.end_time).slice(0, 8),
    calcType: String(r.calc_type) as NightChargeConfig["calcType"],
    valueNumeric: Number(r.value_numeric ?? 0),
    fundingMode: String(r.funding_mode ?? "CUSTOMER_100") as ComponentFundingMode,
    customerSharePct: Number(r.customer_share_pct ?? 100),
    companySharePct: Number(r.company_share_pct ?? 0),
  };
}

export async function loadActiveNightConfig(args: {
  geoLevel?: string | null;
  geoRefId?: string | null;
  stateRefId?: string | null;
}): Promise<NightConfigRow | null> {
  const sql = getSql();
  try {
    if (args.geoLevel && args.geoRefId) {
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM ride_night_configs
        WHERE is_active = TRUE
          AND geo_level = ${args.geoLevel}
          AND geo_ref_id = ${String(args.geoRefId)}
        ORDER BY priority DESC, id DESC
        LIMIT 1
      `;
      if (rows[0]) return mapRow(rows[0]);
    }
    if (args.stateRefId) {
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM ride_night_configs
        WHERE is_active = TRUE
          AND geo_level = 'state'
          AND geo_ref_id = ${String(args.stateRefId)}
        ORDER BY priority DESC, id DESC
        LIMIT 1
      `;
      if (rows[0]) return mapRow(rows[0]);
    }
  } catch {
    // Table may not exist yet in older envs.
    return null;
  }
  return null;
}
