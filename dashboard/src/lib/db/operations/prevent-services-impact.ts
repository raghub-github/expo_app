/**
 * Approximate impact counts for a Prevent Services rule (Super Admin visibility).
 * Merchants: delivery circle overlaps the block (food-ish services only).
 * Riders: on-duty with live GPS inside the blocked radius.
 */

import { getSql } from "../client";
import type { PreventServiceCode } from "./prevent-services-shared";

export type PreventRuleImpactCounts = {
  affectedMerchants: number;
  affectedRiders: number;
};

export async function countImpactForRule(args: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  blockedServices: PreventServiceCode[];
}): Promise<PreventRuleImpactCounts> {
  try {
    const sql = getSql();
    const lat = args.latitude;
    const lng = args.longitude;
    const radiusM = args.radiusMeters;
    const foodish = args.blockedServices.some(
      (c) => c === "food" || c === "grocery" || c === "pharmacy"
    );

    const [merchantRow] = foodish
      ? await sql<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n
          FROM merchant_stores ms
          WHERE COALESCE(ms.is_active, true) = true
            AND ms.latitude IS NOT NULL
            AND ms.longitude IS NOT NULL
            AND (
              6371000.0 * 2 * ASIN(
                SQRT(
                  POWER(SIN(RADIANS(ms.latitude::float8 - ${lat}) / 2), 2) +
                  COS(RADIANS(${lat})) * COS(RADIANS(ms.latitude::float8)) *
                  POWER(SIN(RADIANS(ms.longitude::float8 - ${lng}) / 2), 2)
                )
              )
            ) < (
              COALESCE(NULLIF(ms.delivery_radius_km::float8, 0), 8) * 1000
              + ${radiusM}
            )
        `
      : [{ n: 0 }];

    const [riderRow] = await sql<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT rcl.rider_id)::int AS n
      FROM rider_current_locations rcl
      INNER JOIN riders r ON r.id = rcl.rider_id
      INNER JOIN LATERAL (
        SELECT dl.status
        FROM duty_logs dl
        WHERE dl.rider_id = rcl.rider_id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE r.deleted_at IS NULL
        AND r.status = 'ACTIVE'
        AND ld.status = 'ON'
        AND rcl.last_seen_at > NOW() - INTERVAL '15 minutes'
        AND (
          6371000.0 * 2 * ASIN(
            SQRT(
              POWER(SIN(RADIANS(rcl.lat - ${lat}) / 2), 2) +
              COS(RADIANS(${lat})) * COS(RADIANS(rcl.lat)) *
              POWER(SIN(RADIANS(rcl.lng - ${lng}) / 2), 2)
            )
          )
        ) <= ${radiusM}
    `;

    return {
      affectedMerchants: Number(merchantRow?.n ?? 0) || 0,
      affectedRiders: Number(riderRow?.n ?? 0) || 0,
    };
  } catch {
    return { affectedMerchants: 0, affectedRiders: 0 };
  }
}

export async function getPreventSignalVersion(): Promise<number> {
  try {
    const sql = getSql();
    const [row] = await sql<Array<{ version: number | string }>>`
      SELECT version FROM public.prevent_service_signals WHERE id = 1 LIMIT 1
    `;
    return Number(row?.version ?? 0) || 0;
  } catch {
    return 0;
  }
}
