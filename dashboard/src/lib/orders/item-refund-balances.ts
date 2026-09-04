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

/**
 * Order-level refunds (full CTC / no item rows) often leave item totals lower than
 * `orderAlreadyRefunded`. Spread the gap across item CTC caps so Remaining rows
 * match the order banner remaining.
 */
export function mergeOrderAlreadyIntoItemTotals(args: {
  itemCaps: Map<number, number>;
  alreadyById: Map<number, number>;
  orderAlreadyRefunded: number;
}): Map<number, number> {
  const result = new Map<number, number>();
  for (const [id, cap] of args.itemCaps) {
    if (!(cap > 0)) continue;
    result.set(id, Math.min(cap, Math.max(0, round2(args.alreadyById.get(id) ?? 0))));
  }

  let attributed = 0;
  for (const v of result.values()) attributed = round2(attributed + v);
  const unattributed = round2(
    Math.max(0, Math.max(0, round2(args.orderAlreadyRefunded)) - attributed)
  );
  if (unattributed <= MONEY_EPS) return result;

  const rooms = [...result.entries()]
    .map(([id, already]) => {
      const cap = args.itemCaps.get(id) ?? 0;
      return { id, room: Math.max(0, round2(cap - already)) };
    })
    .filter((r) => r.room > MONEY_EPS);

  if (rooms.length === 0) return result;

  const roomSum = rooms.reduce((s, r) => s + r.room, 0);
  if (roomSum <= MONEY_EPS) return result;

  let allocated = 0;
  for (let i = 0; i < rooms.length; i++) {
    const { id, room } = rooms[i];
    const share =
      i === rooms.length - 1
        ? round2(Math.min(room, unattributed - allocated))
        : round2(Math.min(room, unattributed * (room / roomSum)));
    allocated = round2(allocated + share);
    result.set(id, round2((result.get(id) ?? 0) + share));
  }
  return result;
}

export { MONEY_EPS as ITEM_REFUND_MONEY_EPS };
