import { getSql } from "../../db/client.js";

export type GeoPricingDeliveryResult = {
  total: number;
  raw: unknown;
};

/**
 * Resolves customer delivery fee from `pricing_rules` (rule_type customer_delivery_fee)
 * via DB function `pricing_rules_resolve_totals`. Returns null if pincode unknown or no rule.
 */
export async function resolveGeoCustomerDeliveryFee(params: {
  pincode: string;
  /** FOOD | PARCEL | RIDE */
  serviceTypeUpper: string;
  distanceKm: number;
  orderValue: number;
  waitingMin?: number;
  at?: Date;
}): Promise<GeoPricingDeliveryResult | null> {
  const pc = params.pincode.trim();
  if (!pc || pc.length < 3) return null;

  const svc = params.serviceTypeUpper.trim().toUpperCase();
  const geoService = svc === "PARCEL" ? "parcel" : svc === "RIDE" ? "ride" : "food";

  const ctx = {
    distance_km: params.distanceKm,
    order_value: params.orderValue,
    waiting_min: params.waitingMin ?? 0,
    at: (params.at ?? new Date()).toISOString(),
  };

  try {
    const sql = getSql();
    const ctxJson = JSON.stringify(ctx);
    const [row] = await sql<[{ pricing_rules_resolve_totals: unknown }]>`
      SELECT pricing_rules_resolve_totals(
        ${pc},
        ${geoService}::geo_service,
        'customer_delivery_fee'::pricing_rule_type,
        ${ctxJson}::jsonb
      ) AS pricing_rules_resolve_totals
    `;
    const raw = row?.pricing_rules_resolve_totals;
    if (raw == null || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.found === false) return null;
    const totals = o.totals as Record<string, unknown> | undefined;
    const totalRaw = totals?.total;
    const n = typeof totalRaw === "number" ? totalRaw : typeof totalRaw === "string" ? parseFloat(totalRaw) : NaN;
    if (!Number.isFinite(n) || n < 0) return null;
    return { total: n, raw };
  } catch {
    return null;
  }
}
