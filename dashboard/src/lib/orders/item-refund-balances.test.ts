import { describe, expect, it } from "vitest";
import {
  itemRefundBalances,
  mergeOrderAlreadyIntoItemTotals,
} from "./item-refund-balances";

describe("mergeOrderAlreadyIntoItemTotals", () => {
  it("spreads unattributed order refunds so item remaining matches order remaining", () => {
    const caps = new Map([[538, 143.01]]);
    const alreadyById = new Map([[538, 34.71]]);
    // Order already refunded ~71.51 → remaining 71.50 on 143.01 CTC
    const merged = mergeOrderAlreadyIntoItemTotals({
      itemCaps: caps,
      alreadyById,
      orderAlreadyRefunded: 71.51,
    });
    const bal = itemRefundBalances({
      itemId: 538,
      originalTotal: 143.01,
      alreadyById: merged,
    });
    expect(bal.alreadyRefunded).toBeCloseTo(71.51, 2);
    expect(bal.remainingRefundable).toBeCloseTo(71.5, 2);
  });

  it("leaves item totals alone when they already cover order refunds", () => {
    const caps = new Map([
      [1, 100],
      [2, 50],
    ]);
    const alreadyById = new Map([
      [1, 40],
      [2, 20],
    ]);
    const merged = mergeOrderAlreadyIntoItemTotals({
      itemCaps: caps,
      alreadyById,
      orderAlreadyRefunded: 60,
    });
    expect(merged.get(1)).toBe(40);
    expect(merged.get(2)).toBe(20);
  });
});
