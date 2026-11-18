import { test } from "node:test";
import assert from "node:assert/strict";
import type { TFunction } from "i18next";
import type { RiderLedgerEntry, RiderLedgerJob } from "@/src/services/api/riderApi";
import {
  isSettlementLedgerEntry,
  isZeroWalletJobEntry,
  ledgerJobBreakdownLine,
  ledgerStatusLabel,
  ledgerTransactionTitle,
} from "./ledgerDisplay";

/** i18next stand-in: returns the default text with {{vars}} filled in. */
const t = ((_key: string, def: string, vars?: Record<string, unknown>) =>
  String(def).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars?.[k] ?? ""))) as unknown as TFunction;

function entry(job: RiderLedgerJob | null, over: Partial<RiderLedgerEntry> = {}): RiderLedgerEntry {
  return {
    id: 1,
    entryType: "earning",
    flow: "credit",
    category: "ride",
    description: "",
    amount: 0,
    balance: null,
    ref: null,
    refType: null,
    serviceType: "person_ride",
    orderPublicId: "GM10000437",
    createdAt: new Date("2026-11-18T10:00:00Z").toISOString(),
    rejectionReason: null,
    settlementKind: null,
    job,
    ...over,
  };
}

const job = (over: Partial<RiderLedgerJob>): RiderLedgerJob => ({
  settlementId: "s1",
  serviceType: "person_ride",
  paymentMethod: "cash",
  cashCollected: true,
  cashAmount: 58.28,
  customerPayable: 58.28,
  paidOnline: 0,
  riderEarning: 44.28,
  walletChange: -14,
  kind: "cash_platform_share",
  explanation: "",
  ...over,
});

test("cash C > R: cash collected, earned, wallet minus", () => {
  const e = entry(job({}), { entryType: "cod_order", flow: "debit", amount: 14, settlementKind: "cash_platform_share" });
  assert.equal(ledgerJobBreakdownLine(e, t), "Cash collected ₹58.28 · Earned ₹44.28 · Wallet −₹14.00");
  assert.equal(isZeroWalletJobEntry(e), false);
  assert.equal(isSettlementLedgerEntry(e), true);
});

test("cash C = R: a ₹0 row that still shows the cash and says 'No change'", () => {
  const e = entry(
    job({ cashAmount: 41, customerPayable: 41, riderEarning: 41, walletChange: 0, kind: "cash_no_change" }),
    { id: -177, entryType: "cash_collection" }
  );
  assert.equal(isZeroWalletJobEntry(e), true);
  assert.equal(ledgerStatusLabel(e, t), "No change");
  assert.equal(ledgerTransactionTitle(e, t), "Cash Ride · Cash Collected");
  assert.equal(ledgerJobBreakdownLine(e, t), "Cash collected ₹41.00 · Earned ₹41.00 · No wallet change");
  assert.equal(isSettlementLedgerEntry(e), true, "opens the breakdown sheet");
});

test("cash C < R: partial cash + company credit", () => {
  const e = entry(job({ cashAmount: 30, customerPayable: 30, riderEarning: 41, walletChange: 11, kind: "cash_top_up" }), {
    amount: 11,
    settlementKind: "cash_top_up",
  });
  assert.equal(ledgerJobBreakdownLine(e, t), "Cash collected ₹30.00 · Earned ₹41.00 · Wallet +₹11.00");
});

test("online and free ride lines", () => {
  const online = entry(
    job({ paymentMethod: "online", cashCollected: false, cashAmount: 0, paidOnline: 58.28, walletChange: 44.28, kind: "online_earning" }),
    { amount: 44.28 }
  );
  assert.equal(ledgerJobBreakdownLine(online, t), "Paid online ₹58.28 · Earned ₹44.28 · Wallet +₹44.28");
  const free = entry(
    job({ paymentMethod: "offer", cashCollected: false, cashAmount: 0, customerPayable: 0, riderEarning: 45, walletChange: 45, kind: "free_ride" }),
    { amount: 45 }
  );
  assert.equal(ledgerJobBreakdownLine(free, t), "Offer — customer paid ₹0 · Earned ₹45.00 · Wallet +₹45.00");
  assert.equal(ledgerTransactionTitle(free, t), "Free Ride · Earning Credited");
});

test("rows without a job are untouched", () => {
  const e = entry(null, { amount: 20 });
  assert.equal(ledgerJobBreakdownLine(e, t), null);
  assert.equal(isZeroWalletJobEntry(e), false);
});
