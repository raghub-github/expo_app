/**
 * Merchant prep performance — rolling stats used to bias future ETA calculations.
 */
import { getSql } from "../../db/client.js";

const PREP_BLEND_CONFIGURED_WEIGHT = 0.35;
const PREP_BLEND_ACTUAL_WEIGHT = 0.65;

export async function recordMerchantPrepCompletion(args: {
  merchantStoreId: number;
  expectedPrepMinutes: number;
  actualPrepMinutes: number;
  wasLate: boolean;
  lateMinutes: number;
}): Promise<void> {
  const sql = getSql();
  const storeId = args.merchantStoreId;
  if (!Number.isFinite(storeId) || storeId < 1) return;

  const actual = Math.max(1, Math.round(args.actualPrepMinutes));
  const expected = Math.max(1, Math.round(args.expectedPrepMinutes));

  const rows = await sql<
    Array<{
      avg_prep_time_actual_minutes: number | null;
      prep_delay_pct: string | null;
      prep_samples_count: number | null;
    }>
  >`
    SELECT avg_prep_time_actual_minutes, prep_delay_pct::text, prep_samples_count
    FROM merchant_stores
    WHERE id = ${storeId}
    LIMIT 1
  `;
  const prev = rows[0];
  if (!prev) return;

  const prevSamples = Math.max(0, Number(prev.prep_samples_count) || 0);
  const prevAvg = prev.avg_prep_time_actual_minutes;
  const newSamples = prevSamples + 1;
  const newAvg =
    prevAvg != null && prevSamples > 0
      ? Math.round((prevAvg * prevSamples + actual) / newSamples)
      : actual;

  const prevDelayPct = prev.prep_delay_pct != null ? Number(prev.prep_delay_pct) : 0;
  const thisLate = args.wasLate ? 100 : 0;
  const newDelayPct =
    prevSamples > 0
      ? Number(((prevDelayPct * prevSamples + thisLate) / newSamples).toFixed(2))
      : thisLate;

  const reliability = Math.max(0, Math.min(1, Number((1 - newDelayPct / 100).toFixed(4))));

  await sql`
    UPDATE merchant_stores
    SET
      avg_prep_time_actual_minutes = ${newAvg},
      prep_delay_pct = ${newDelayPct},
      prep_reliability_score = ${reliability},
      prep_samples_count = ${newSamples},
      updated_at = NOW()
    WHERE id = ${storeId}
  `;
}

/** Blend merchant-entered prep with historical actual average. */
export function blendStorePrepMinutes(configured: number, actualAvg: number | null): number {
  const cfg = Math.max(1, Math.round(configured));
  if (actualAvg == null || !Number.isFinite(actualAvg) || actualAvg < 1) return cfg;
  return Math.round(cfg * PREP_BLEND_CONFIGURED_WEIGHT + actualAvg * PREP_BLEND_ACTUAL_WEIGHT);
}

export async function resolveBlendedStorePrepMinutes(storeId: number): Promise<number> {
  const sql = getSql();
  try {
    const rows = await sql<
      Array<{ configured: number | null; actual: number | null }>
    >`
      SELECT avg_preparation_time_minutes AS configured,
             avg_prep_time_actual_minutes AS actual
      FROM merchant_stores
      WHERE id = ${storeId}
      LIMIT 1
    `;
    const r = rows[0];
    const configured = r?.configured != null ? Number(r.configured) : 18;
    const actual = r?.actual != null ? Number(r.actual) : null;
    if (configured > 0) return blendStorePrepMinutes(configured, actual);
    if (actual != null && actual > 0) return Math.round(actual);
  } catch (e) {
    console.warn("[eta] resolveBlendedStorePrepMinutes failed", {
      storeId,
      err: (e as Error).message,
    });
  }
  return 18;
}
