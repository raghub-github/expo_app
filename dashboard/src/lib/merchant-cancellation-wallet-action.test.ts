import { describe, expect, it } from "vitest";
import {
  resolveAdminCancellationWalletAction,
  resolveMerchantCtmDebitAdjustment,
} from "./merchant-ctm-debit-math";

describe("resolveMerchantCtmDebitAdjustment matrix", () => {
  it.each([
    {
      name: "FULL + credited",
      mode: "full_debit" as const,
      held: 100,
      gross: 100,
      kind: "debit",
      amount: 100,
    },
    {
      name: "FULL + not credited",
      mode: "full_debit" as const,
      held: 0,
      gross: 0,
      kind: "none",
      amount: 0,
    },
    {
      name: "PARTIAL + credited",
      mode: "partial_debit" as const,
      held: 100,
      gross: 100,
      kind: "debit",
      amount: 50,
    },
    {
      name: "PARTIAL + not credited",
      mode: "partial_debit" as const,
      held: 0,
      gross: 0,
      kind: "credit",
      amount: 50,
    },
    {
      name: "NO_DEBIT + credited",
      mode: "no_debit" as const,
      held: 100,
      gross: 100,
      kind: "none",
      amount: 0,
    },
    {
      name: "NO_DEBIT + not credited",
      mode: "no_debit" as const,
      held: 0,
      gross: 0,
      kind: "credit",
      amount: 100,
    },
  ])("$name", ({ mode, held, gross, kind, amount }) => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode,
      ctmAmount: 100,
      currentNetHeld: held,
      grossCredited: gross,
    });
    expect(adj.kind).toBe(kind);
    expect(adj.amount).toBe(amount);
  });

  it("FULL after PARTIAL debits only remaining", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 100,
    });
    expect(adj.kind).toBe("debit");
    expect(adj.amount).toBe(50);
  });

  it("NO_DEBIT credit then FULL reverses 100", () => {
    const afterNoDebit = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    expect(afterNoDebit.kind).toBe("credit");
    expect(afterNoDebit.amount).toBe(100);

    const thenFull = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    expect(thenFull.kind).toBe("debit");
    expect(thenFull.amount).toBe(100);
  });

  it("uses money rounding for 137.50", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 137.5,
      currentNetHeld: 137.5,
      grossCredited: 137.5,
    });
    expect(adj.kind).toBe("debit");
    expect(adj.amount).toBe(68.75);
  });
  it("PARTIAL → NO_DEBIT credits only missing 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 50,
    });
    expect(adj.kind).toBe("credit");
    expect(adj.amount).toBe(50);
  });

  it("FULL → PARTIAL credits 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 100,
    });
    expect(adj.kind).toBe("credit");
    expect(adj.amount).toBe(50);
  });

  it("NO_DEBIT → PARTIAL debits 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    expect(adj.kind).toBe("debit");
    expect(adj.amount).toBe(50);
  });

  it("legacy early-exit class: cancellation marker with missing CTM still credits 100% on NO_DEBIT", () => {
    // hasCancellationLedgerEntry would be true (info / orphan row), but CTM netHeld is 0.
    // Engine must NOT treat "cancellation ledger exists" as CTM settlement complete.
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    expect(adj.kind).toBe("credit");
    expect(adj.amount).toBe(100);
  });

  it("compensation credit for 50% does not suppress NO_DEBIT remaining CTM credit", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 50,
    });
    expect(adj.kind).toBe("credit");
    expect(adj.amount).toBe(50);
  });

  it("idempotent: NO_DEBIT when target already held → none", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    expect(adj.kind).toBe("none");
    expect(adj.amount).toBe(0);
  });
});

describe("legacy resolveAdminCancellationWalletAction", () => {
  it("FULL + not credited is info with 0 (no fake debit)", () => {
    const a = resolveAdminCancellationWalletAction("full_debit", "NOT_CREDITED", 100);
    expect(a.kind).toBe("info");
    expect(a.amount).toBe(0);
  });
});
