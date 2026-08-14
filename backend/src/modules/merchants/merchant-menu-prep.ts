/**
 * Average preparation time derived from merchant_menu_items.preparation_time_minutes.
 */
import { getSql } from "../../db/client.js";

export function averagePrepMinutesFromValues(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / valid.length);
}

export function averagePrepMinutesFromMenuItemRows(
  items: Array<{ preparation_time_minutes?: number | null | undefined }>
): number | null {
  return averagePrepMinutesFromValues(
    items
      .map((item) => Number(item.preparation_time_minutes))
      .filter((v) => Number.isFinite(v) && v > 0)
  );
}

/** Menu-item average first; fall back to merchant_stores.avg_preparation_time_minutes; then add kitchen buffer. */
export function normalizePreparationBufferMinutes(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(120, Math.floor(n)));
}

export function resolveStorePrepMinutesForEta(
  menuAvgPrep: number | null | undefined,
  storeAvgPrep: number | null | undefined,
  preparationBufferMinutes: number | null | undefined = 0
): number | null {
  let base: number | null = null;
  if (menuAvgPrep != null && Number.isFinite(menuAvgPrep) && menuAvgPrep > 0) {
    base = Math.round(menuAvgPrep);
  } else if (storeAvgPrep != null && (storeAvgPrep as unknown) !== "") {
    const n = Number(storeAvgPrep);
    if (Number.isFinite(n) && n > 0) base = Math.round(n);
  }
  if (base == null) return null;
  const buffer = normalizePreparationBufferMinutes(preparationBufferMinutes);
  if (buffer <= 0) return base;
  return Math.min(180, base + buffer);
}

/** Batch preparation_buffer_minutes per store internal id (defaults to 0). */
export async function getPreparationBufferMinutesForStores(
  storeInternalIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const pg = getSql();
  try {
    const rows = await pg<Array<{ store_id: number; preparation_buffer_minutes: number | null }>>`
      SELECT store_id::int AS store_id,
             COALESCE(preparation_buffer_minutes, 0)::int AS preparation_buffer_minutes
      FROM merchant_store_settings
      WHERE store_id = ANY(${ids}::int[])
    `;
    for (const row of rows) {
      map.set(row.store_id, normalizePreparationBufferMinutes(row.preparation_buffer_minutes));
    }
  } catch (err) {
    console.warn("[merchants] getPreparationBufferMinutesForStores failed", {
      err: (err as Error).message,
    });
  }
  return map;
}

/** Batch avg prep per store internal id (active, approved menu items only). */
export async function getAverageMenuPrepMinutesForStores(
  storeInternalIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const pg = getSql();
  try {
    const rows = await pg<Array<{ store_id: number; avg_prep: number | string | null }>>`
      SELECT m.store_id::int AS store_id,
             ROUND(AVG(m.preparation_time_minutes))::int AS avg_prep
      FROM merchant_menu_items m
      WHERE m.store_id = ANY(${ids}::int[])
        AND COALESCE(m.is_deleted, FALSE) = FALSE
        AND m.is_active = TRUE
        AND m.approval_status::text IN ('APPROVED', 'PENDING')
        AND m.preparation_time_minutes IS NOT NULL
        AND m.preparation_time_minutes > 0
      GROUP BY m.store_id
    `;
    for (const row of rows) {
      const avg = Number(row.avg_prep);
      if (Number.isFinite(avg) && avg > 0) map.set(row.store_id, Math.round(avg));
    }
  } catch (err) {
    console.warn("[merchants] getAverageMenuPrepMinutesForStores failed", {
      err: (err as Error).message,
    });
  }
  return map;
}
