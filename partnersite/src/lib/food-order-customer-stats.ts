import { client as sql } from '@/lib/drizzle';

/** Total orders per customer at this store and platform-wide (2 queries). */
export async function loadCustomerOrderCounts(
  storeId: number,
  customerIds: number[]
): Promise<{ storeByCustomer: Map<number, number>; platformByCustomer: Map<number, number> }> {
  const ids = [...new Set(customerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) {
    return { storeByCustomer: new Map(), platformByCustomer: new Map() };
  }

  try {
    const [storeRows, platformRows] = await Promise.all([
      sql<{ customer_id: number; cnt: number }[]>`
        SELECT customer_id, COUNT(*)::int AS cnt
        FROM orders_core
        WHERE merchant_store_id = ${storeId}
          AND customer_id = ANY(${ids}::bigint[])
        GROUP BY customer_id
      `,
      sql<{ customer_id: number; cnt: number }[]>`
        SELECT customer_id, COUNT(*)::int AS cnt
        FROM orders_core
        WHERE customer_id = ANY(${ids}::bigint[])
        GROUP BY customer_id
      `,
    ]);

    return {
      storeByCustomer: new Map(storeRows.map((r) => [Number(r.customer_id), Number(r.cnt)])),
      platformByCustomer: new Map(platformRows.map((r) => [Number(r.customer_id), Number(r.cnt)])),
    };
  } catch (err) {
    console.warn('[food-order-customer-stats] loadCustomerOrderCounts failed:', err);
    return { storeByCustomer: new Map(), platformByCustomer: new Map() };
  }
}

/** Per-order store/platform sequence numbers for the fetched core rows only.
 *  Avoids windowing the entire customer history (was timing out the orders board).
 */
export async function loadOrderOrdinalsByCoreId(
  storeId: number,
  coreIds: number[],
  customerIds: number[]
): Promise<{ storeOrdinalByCoreId: Map<number, number>; platformOrdinalByCoreId: Map<number, number> }> {
  const orderIds = [...new Set(coreIds.filter((id) => Number.isFinite(id) && id > 0))];
  const custIds = [...new Set(customerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (orderIds.length === 0 || custIds.length === 0) {
    return { storeOrdinalByCoreId: new Map(), platformOrdinalByCoreId: new Map() };
  }

  try {
    const rows = await sql<{ id: number; store_ordinal: number; platform_ordinal: number }[]>`
      SELECT
        t.id,
        (
          SELECT COUNT(*)::int
          FROM orders_core o
          WHERE o.merchant_store_id = ${storeId}
            AND o.customer_id = t.customer_id
            AND (
              o.created_at < t.created_at
              OR (o.created_at = t.created_at AND o.id <= t.id)
            )
        ) AS store_ordinal,
        (
          SELECT COUNT(*)::int
          FROM orders_core o
          WHERE o.customer_id = t.customer_id
            AND (
              o.created_at < t.created_at
              OR (o.created_at = t.created_at AND o.id <= t.id)
            )
        ) AS platform_ordinal
      FROM orders_core t
      WHERE t.id = ANY(${orderIds}::bigint[])
        AND t.customer_id = ANY(${custIds}::bigint[])
    `;

    return {
      storeOrdinalByCoreId: new Map(rows.map((r) => [Number(r.id), Number(r.store_ordinal)])),
      platformOrdinalByCoreId: new Map(rows.map((r) => [Number(r.id), Number(r.platform_ordinal)])),
    };
  } catch (err) {
    console.warn('[food-order-customer-stats] loadOrderOrdinalsByCoreId failed:', err);
    return { storeOrdinalByCoreId: new Map(), platformOrdinalByCoreId: new Map() };
  }
}
