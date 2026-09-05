import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adminCancellationLedgerMetadata,
  isNoDebitMerchantMode,
  resolveAdminCancellationWalletAction,
  resolveMerchantCtmDebitAdjustment,
} from "./merchant-cancellation-wallet-action.js";

describe("merchant CTM debit matrix", () => {
  it("FULL + credited → debit 100%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "debit");
    assert.equal(adj.amount, 100);
  });

  it("FULL + not credited → no transaction", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    assert.equal(adj.kind, "none");
    assert.equal(adj.amount, 0);
  });

  it("PARTIAL + credited → debit 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "debit");
    assert.equal(adj.amount, 50);
  });

  it("PARTIAL + not credited → credit 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 50);
  });

  it("NO_DEBIT + credited → no transaction", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 100,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "none");
    assert.equal(adj.amount, 0);
  });

  it("NO_DEBIT + not credited → credit 100%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 100);
  });

  it("FULL after PARTIAL only debits remaining 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "debit");
    assert.equal(adj.amount, 50);
  });

  it("FULL after FULL → none", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "none");
  });

  it("PARTIAL ₹137.50 → ₹68.75", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 137.5,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 68.75);
  });

  it("CTM ₹0 → none", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "full_debit",
      ctmAmount: 0,
      currentNetHeld: 0,
    });
    assert.equal(adj.kind, "none");
  });
  it("PARTIAL after retaining 50% then NO_DEBIT credits missing 50%", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 50,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 50);
  });

  it("FULL then PARTIAL credits back to 50% keep", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "partial_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 100,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 50);
  });

  it("legacy early-exit class: cancellation marker + missing CTM + NO_DEBIT → +100%", () => {
    // Engine must not treat hasCancellationLedgerEntry as "CTM settled".
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 0,
      grossCredited: 0,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 100);
  });

  it("partial compensation held does not suppress remaining NO_DEBIT CTM credit", () => {
    const adj = resolveMerchantCtmDebitAdjustment({
      mode: "no_debit",
      ctmAmount: 100,
      currentNetHeld: 50,
      grossCredited: 50,
    });
    assert.equal(adj.kind, "credit");
    assert.equal(adj.amount, 50);
  });
});

describe("merchant cancellation no_debit (legacy resolver)", () => {
  it("never returns a wallet debit for no_debit after the order was already credited", () => {
    const action = resolveAdminCancellationWalletAction("no_debit", "ALREADY_CREDITED", 72);
    assert.notEqual(action.kind, "debit");
    assert.equal(action.kind, "info");
    assert.equal(action.amount, 0);
  });

  it("never returns a wallet debit for no_debit when the order was not yet credited", () => {
    const action = resolveAdminCancellationWalletAction("no_debit", "NOT_CREDITED", 72);
    assert.notEqual(action.kind, "debit");
    assert.equal(action.kind, "credit");
    assert.equal(action.amount, 72);
  });

  it("still claws back on full_debit after the order was credited", () => {
    const action = resolveAdminCancellationWalletAction("full_debit", "ALREADY_CREDITED", 72);
    assert.equal(action.kind, "debit");
    assert.equal(action.amount, 72);
  });

  it("FULL + not credited returns info / zero amount (no fake debit)", () => {
    const action = resolveAdminCancellationWalletAction("full_debit", "NOT_CREDITED", 100);
    assert.equal(action.kind, "info");
    assert.equal(action.amount, 0);
  });

  it("PARTIAL + not credited credits 50%", () => {
    const action = resolveAdminCancellationWalletAction("partial_debit", "NOT_CREDITED", 100);
    assert.equal(action.kind, "credit");
    assert.equal(action.amount, 50);
  });

  it("records zero clawback in no_debit metadata", () => {
    const action = resolveAdminCancellationWalletAction("no_debit", "ALREADY_CREDITED", 72);
    const meta = adminCancellationLedgerMetadata({
      action,
      mode: "no_debit",
      scenario: "ALREADY_CREDITED",
      orderCoreId: 1,
      eligibleAmount: 72,
      source: "test",
    });
    assert.equal(meta.clawback_amount, 0);
    assert.equal(meta.balance_impact, "none");
    assert.equal(meta.merchant_keeps_amount, 72);
  });

  it("recognizes no_debit mode strings", () => {
    assert.equal(isNoDebitMerchantMode("no_debit"), true);
    assert.equal(isNoDebitMerchantMode("NO_DEBIT"), true);
    assert.equal(isNoDebitMerchantMode("full_debit"), false);
  });
});
