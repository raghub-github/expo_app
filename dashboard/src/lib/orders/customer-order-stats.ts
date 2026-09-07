/** Customer lifetime order stats for the standalone order page (Nth / T-D / T-C). */

export type CustomerOrderStats = {
  ordinal: number | null;
  deliveredCount: number | null;
  cancelledCount: number | null;
};

export type NthOrderBannerInfo = {
  ordinal: number | null;
  customerName: string | null;
};

export const EMPTY_NTH_ORDER_BANNER: NthOrderBannerInfo = {
  ordinal: null,
  customerName: null,
};

export const EMPTY_CUSTOMER_ORDER_STATS: CustomerOrderStats = {
  ordinal: null,
  deliveredCount: null,
  cancelledCount: null,
};

function toCount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readCustomerOrderStats(row: Record<string, unknown> | null | undefined): CustomerOrderStats {
  if (!row) return EMPTY_CUSTOMER_ORDER_STATS;
  return {
    ordinal: toCount(row.customerOrderOrdinal ?? row.customer_order_ordinal),
    deliveredCount: toCount(row.customerDeliveredCount ?? row.customer_delivered_count),
    cancelledCount: toCount(row.customerCancelledCount ?? row.customer_cancelled_count),
  };
}

export function formatOrderOrdinalSuffix(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const mod100 = v % 100;
  const mod10 = v % 10;
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) return `${v}st`;
    if (mod10 === 2) return `${v}nd`;
    if (mod10 === 3) return `${v}rd`;
  }
  return `${v}th`;
}
