/**
 * Pure remaining-refund math — safe for client + server.
 * DB aggregation lives in `lib/db/operations/order-refund-item-totals.ts`.
 */

const MONEY_EPS = 0.01;

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function itemRefundBalances(args: {
  itemId: number;
  originalTotal: number;
  alreadyById: Map<number, number> | Record<string, number>;
}): {
  originalTotal: number;
  alreadyRefunded: number;
  remainingRefundable: number;
  alreadyRefundedPct: number;
  fullyRefunded: boolean;
} {
  const originalTotal = Math.max(0, round2(args.originalTotal));
  const alreadyRaw =
    args.alreadyById instanceof Map
      ? (args.alreadyById.get(args.itemId) ?? 0)
      : toNum((args.alreadyById as Record<string, number>)[String(args.itemId)]);
  const alreadyRefunded = Math.min(originalTotal, Math.max(0, round2(alreadyRaw)));
  const remainingRefundable = Math.max(0, round2(originalTotal - alreadyRefunded));
  const alreadyRefundedPct =
    originalTotal > 0 ? Math.min(100, (alreadyRefunded / originalTotal) * 100) : 0;
  return {
    originalTotal,
    alreadyRefunded,
    remainingRefundable,
    alreadyRefundedPct,
    fullyRefunded: remainingRefundable <= MONEY_EPS,
  };
}

export { MONEY_EPS as ITEM_REFUND_MONEY_EPS };
