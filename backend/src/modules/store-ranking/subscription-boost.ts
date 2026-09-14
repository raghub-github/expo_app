/**
 * Active-subscription → ranking boost, config-driven. A store with a live subscription gets a
 * bounded boost keyed on its plan code (config's subscription_plan_boosts map, e.g. ENTERPRISE→6);
 * the engine then caps it at boostCaps.subscription so paid visibility can NUDGE, never dominate,
 * and NEVER bypasses eligibility (subscription is a boost applied AFTER the hard filter). Plan names
 * are not hardcoded in the algorithm — the map is configuration (§14/§15).
 *
 * "Active" = subscription_status ACTIVE + is_active + not expired. One batched ANY() lookup, no N+1.
 */
import { getSql } from "../../db/client.js";
import type { SubscriptionPlanBoosts } from "./config-store.js";

export async function loadActiveSubscriptionBoosts(
  storeIds: number[],
  planBoosts: SubscriptionPlanBoosts
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = Array.from(new Set(storeIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0 || !planBoosts || Object.keys(planBoosts).length === 0) return out;
  // Normalise the plan-code map to upper-case once for case-insensitive matching.
  const boosts: Record<string, number> = {};
  for (const [k, v] of Object.entries(planBoosts)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) boosts[k.trim().toUpperCase()] = n;
  }
  if (Object.keys(boosts).length === 0) return out;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT DISTINCT ON (store_id) store_id, plan_code_snapshot
      FROM merchant_subscriptions
      WHERE store_id = ANY(${ids})
        AND is_active = true
        AND subscription_status::text = 'ACTIVE'
        AND (expiry_date IS NULL OR expiry_date > now())
      ORDER BY store_id, start_date DESC
    `) as unknown as Array<{ store_id: number; plan_code_snapshot: string | null }>;
    for (const r of rows) {
      const code = String(r.plan_code_snapshot ?? "").trim().toUpperCase();
      const boost = boosts[code] ?? 0;
      if (boost > 0) out.set(Number(r.store_id), boost);
    }
  } catch {
    // Subscriptions unavailable → no boost (fail-open; organic ranking still works).
  }
  return out;
}
