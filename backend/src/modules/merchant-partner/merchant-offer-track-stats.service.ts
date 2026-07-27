/**
 * Per-offer track-card stats from offer_order_applications + orders_food.
 * Populates gross_sales / discount_given / orders_delivered for offer list UIs
 * (merchant app + partnersite) — offer_metadata alone is never written at redeem time.
 */

export type MerchantOfferTrackStat = {
  offerPk: number;
  orders: number;
  gross: number;
  discount: number;
  effectiveDiscountPct: number;
};

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

function parseNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lifetime performance per merchant_offer id for a store.
 * Includes all applied orders (not only DELIVERED) so Discount matches current_uses;
 * Gross uses food item totals when available on the linked order.
 */
export async function loadMerchantOfferTrackStats(
  sql: Sql,
  storeId: number,
  offerPks: number[],
): Promise<Map<number, MerchantOfferTrackStat>> {
  const out = new Map<number, MerchantOfferTrackStat>();
  if (!offerPks.length) return out;

  try {
    const rows = (await sql`
      SELECT
        oa.merchant_offer_id AS offer_pk,
        oc.id AS core_order_pk,
        of.id AS food_row_id,
        COALESCE(
          NULLIF(of.food_items_total_value, 0),
          NULLIF(oc.item_total, 0),
          NULLIF(oc.grand_total, 0),
          0
        )::numeric AS gross,
        COALESCE(oa.discount_amount, 0)::numeric AS discount
      FROM offer_order_applications oa
      INNER JOIN merchant_offers mo ON mo.id = oa.merchant_offer_id
      LEFT JOIN orders_core oc
        ON oc.id = oa.order_id
        OR oc.order_id = ('GM' || oa.order_id::text)
      LEFT JOIN orders_food of
        ON of.merchant_store_id = ${storeId}
        AND (
          of.order_id = oc.id
          OR of.core_order_id = oc.order_id
          OR of.id = oa.order_id
        )
      WHERE mo.store_id = ${storeId}
        AND oa.merchant_offer_id = ANY(${offerPks})
        AND oa.offer_source = 'MERCHANT'
    `) as Array<{
      offer_pk: number | string;
      core_order_pk: number | string | null;
      food_row_id: number | string | null;
      gross: unknown;
      discount: unknown;
    }>;

    type Acc = {
      discount: number;
      orders: Set<string>;
      orderGross: Map<string, number>;
    };
    const byOffer = new Map<number, Acc>();

    for (const r of rows) {
      const offerPk = Number(r.offer_pk);
      if (!Number.isFinite(offerPk) || offerPk < 1) continue;
      let acc = byOffer.get(offerPk);
      if (!acc) {
        acc = { discount: 0, orders: new Set(), orderGross: new Map() };
        byOffer.set(offerPk, acc);
      }
      const disc = parseNum(r.discount);
      acc.discount += disc;
      const oid = String(r.core_order_pk ?? r.food_row_id ?? `${offerPk}-${acc.orders.size}`);
      acc.orders.add(oid);
      const g = parseNum(r.gross);
      if (g > 0) {
        const prev = acc.orderGross.get(oid) ?? 0;
        if (g > prev) acc.orderGross.set(oid, g);
      }
    }

    // Fallback: usages table when applications join misses orders
    const missing = offerPks.filter((id) => {
      const a = byOffer.get(id);
      return !a || a.discount <= 0 || a.orderGross.size === 0;
    });
    if (missing.length > 0) {
      try {
        const usageRows = (await sql`
          SELECT
            u.offer_id AS offer_pk,
            u.order_id AS usage_order_id,
            COALESCE(u.discount_amount, 0)::numeric AS discount,
            COALESCE(u.is_reversed, false) AS is_reversed,
            COALESCE(
              NULLIF(of.food_items_total_value, 0),
              NULLIF(oc.item_total, 0),
              NULLIF(oc.grand_total, 0),
              0
            )::numeric AS gross,
            oc.id AS core_order_pk
          FROM merchant_offer_usages u
          LEFT JOIN orders_core oc
            ON oc.id = u.order_id
            OR oc.order_id = ('GM' || u.order_id::text)
          LEFT JOIN orders_food of
            ON of.merchant_store_id = ${storeId}
            AND (
              of.order_id = oc.id
              OR of.core_order_id = oc.order_id
              OR of.id = u.order_id
            )
          WHERE u.offer_id = ANY(${missing})
        `) as Array<{
          offer_pk: number | string;
          usage_order_id: number | string | null;
          discount: unknown;
          is_reversed: boolean;
          gross: unknown;
          core_order_pk: number | string | null;
        }>;

        for (const u of usageRows) {
          if (u.is_reversed) continue;
          const offerPk = Number(u.offer_pk);
          if (!Number.isFinite(offerPk)) continue;
          let acc = byOffer.get(offerPk);
          const fillDiscount = !acc || acc.discount <= 0;
          if (!acc) {
            acc = { discount: 0, orders: new Set(), orderGross: new Map() };
            byOffer.set(offerPk, acc);
          }
          const oid = String(u.core_order_pk ?? u.usage_order_id ?? `u-${offerPk}-${acc.orders.size}`);
          acc.orders.add(oid);
          if (fillDiscount) {
            acc.discount += parseNum(u.discount);
          }
          const g = parseNum(u.gross);
          if (g > 0) {
            const prev = acc.orderGross.get(oid) ?? 0;
            if (g > prev) acc.orderGross.set(oid, g);
          }
        }
      } catch {
        /* usages table optional */
      }
    }

    for (const [offerPk, acc] of byOffer) {
      let gross = 0;
      acc.orderGross.forEach((g) => {
        gross += g;
      });
      const discount = Math.round(acc.discount * 100) / 100;
      gross = Math.round(gross * 100) / 100;
      const orders = acc.orders.size;
      const effectiveDiscountPct =
        gross > 0 && discount > 0 ? Math.round((discount / gross) * 1000) / 10 : 0;
      out.set(offerPk, { offerPk, orders, gross, discount, effectiveDiscountPct });
    }
  } catch {
    /* table / join may fail on older DBs — leave empty map */
  }

  return out;
}

/** Merge track stats into offer_metadata for existing track-card readers. */
export function mergeOfferTrackStatsIntoMetadata(
  meta: Record<string, unknown>,
  stat: MerchantOfferTrackStat | undefined,
  currentUses?: number | null,
): Record<string, unknown> {
  if (!stat) return meta;
  const orders = Math.max(stat.orders, Number(currentUses ?? 0) || 0);
  let eff = stat.effectiveDiscountPct;
  if ((!eff || eff <= 0) && stat.gross > 0 && stat.discount > 0) {
    eff = Math.round((stat.discount / stat.gross) * 1000) / 10;
  }
  return {
    ...meta,
    gross_sales: stat.gross,
    discount_given: stat.discount,
    orders_delivered: orders,
    ...(eff > 0 ? { effective_discount_pct: eff } : {}),
  };
}
