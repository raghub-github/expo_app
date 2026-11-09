import assert from "node:assert/strict";
import { test } from "node:test";
import type { TransactionSql } from "postgres";
import { applySettlementWalletMovement } from "./postpaid-settlement-posting.js";
import { computePostpaidSettlement } from "./postpaid-settlement.js";

/**
 * In-memory stand-in for one rider's wallet inside a transaction. The INSERT
 * branch reproduces prod's trigger_update_wallet_from_ledger for the two entry
 * types the settlement engine writes:
 *   'earning'    → total_balance += amount
 *   'adjustment' → total_balance += amount (credit when ≥ 0, debit when < 0)
 */
function fakeWallet(opts: { balance: number; negativeUsed?: number; existingRefs?: string[]; trigger?: boolean }) {
  const state = {
    balance: opts.balance,
    negativeUsed: opts.negativeUsed ?? 0,
    refs: new Set(opts.existingRefs ?? []),
    ledger: [] as Array<{ entryType: string; amount: number; balance: number; ref: string }>,
    lockedBeforeWrite: false,
    statements: [] as string[],
  };
  const trigger = opts.trigger !== false;
  const tx = ((stringsOrIdent: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof stringsOrIdent === "string") return { __ident: stringsOrIdent };
    const text = stringsOrIdent.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (text.startsWith("INSERT INTO rider_wallet")) return Promise.resolve([]);
    if (text.includes("FOR UPDATE")) {
      state.lockedBeforeWrite = state.ledger.length === 0;
      return Promise.resolve([{ total_balance: String(state.balance), negative_used: String(state.negativeUsed) }]);
    }
    if (text.startsWith("SELECT 1 AS ok FROM wallet_ledger")) {
      const ref = String(values[1]);
      return Promise.resolve(state.refs.has(ref) ? [{ ok: 1 }] : []);
    }
    if (text.startsWith("INSERT INTO wallet_ledger")) {
      const [, entryType, amount, balance, , ref] = values as [number, string, string, string, string, string];
      state.ledger.push({ entryType, amount: Number(amount), balance: Number(balance), ref });
      state.refs.add(ref);
      if (trigger) state.balance = Math.round((state.balance + Number(amount)) * 100) / 100;
      return Promise.resolve([]);
    }
    if (text.startsWith("UPDATE rider_wallet")) {
      state.negativeUsed = Number(values[1]);
      return Promise.resolve([]);
    }
    if (text.startsWith("SELECT total_balance FROM rider_wallet")) {
      return Promise.resolve([{ total_balance: String(state.balance) }]);
    }
    throw new Error(`unexpected statement: ${text}`);
  }) as unknown as TransactionSql;
  return { tx, state };
}

const refs = { creditRef: "rider_earn:delivery:170", debitRef: "parcel_cash_settle:170" };
const base = {
  riderId: 1001,
  refType: "parcel_settlement",
  creditDescription: "top-up",
  debitDescription: "platform share",
  metadata: { orderCoreId: 170 },
  ...refs,
};

test("cash debit (C ₹70 > R ₹50) posts one negative adjustment that the trigger debits", async () => {
  const settlement = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx, state } = fakeWallet({ balance: 500 });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "parcel", settlement });
  assert.deepEqual(moved, { balanceBefore: 500, balanceAfter: 480, posted: "debit", duplicate: false });
  assert.equal(state.balance, 480);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0]!.entryType, "adjustment");
  assert.equal(state.ledger[0]!.amount, -20, "the ledger row says what happened: a debit");
  assert.equal(state.ledger[0]!.ref, refs.debitRef);
  assert.equal(state.lockedBeforeWrite, true, "wallet row is locked before anything is written");
});

test("the ₹70 cash itself is never written to the wallet", async () => {
  const settlement = computePostpaidSettlement({
    service: "person_ride",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx, state } = fakeWallet({ balance: 100 });
  await applySettlementWalletMovement(tx, { ...base, service: "person_ride", settlement });
  assert.ok(state.ledger.every((l) => Math.abs(l.amount) !== 70));
});

test("cash top-up (C ₹30 < R ₹50) credits ₹20 as an earning on the delivery ref", async () => {
  const settlement = computePostpaidSettlement({
    service: "person_ride",
    method: "cash",
    customerPayablePaise: 3000,
    riderEntitlementPaise: 5000,
    collectedPaise: 3000,
  });
  const { tx, state } = fakeWallet({ balance: 150 });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "person_ride", settlement });
  assert.equal(moved.posted, "credit");
  assert.equal(moved.balanceAfter, 170);
  assert.equal(state.ledger[0]!.entryType, "earning");
  assert.equal(state.ledger[0]!.amount, 20);
  assert.equal(state.ledger[0]!.ref, refs.creditRef);
});

test("equal amounts move nothing but still report the balance", async () => {
  const settlement = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 5000,
    riderEntitlementPaise: 5000,
    collectedPaise: 5000,
  });
  const { tx, state } = fakeWallet({ balance: 260 });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "parcel", settlement });
  assert.deepEqual(moved, { balanceBefore: 260, balanceAfter: 260, posted: "none", duplicate: false });
  assert.equal(state.ledger.length, 0);
});

test("a replayed settlement (ref already in the ledger) posts nothing", async () => {
  const settlement = computePostpaidSettlement({
    service: "parcel",
    method: "online",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx, state } = fakeWallet({ balance: 50, existingRefs: [refs.creditRef] });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "parcel", settlement });
  assert.equal(moved.duplicate, true);
  assert.equal(moved.posted, "none");
  assert.equal(state.ledger.length, 0);
  assert.equal(state.balance, 50);
});

test("three identical completion events settle exactly once", async () => {
  const settlement = computePostpaidSettlement({
    service: "person_ride",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx, state } = fakeWallet({ balance: 300 });
  for (let i = 0; i < 3; i++) {
    await applySettlementWalletMovement(tx, { ...base, service: "person_ride", settlement });
  }
  assert.equal(state.ledger.length, 1);
  assert.equal(state.balance, 280);
});

test("a debit that takes the wallet negative records the service's negative usage", async () => {
  const settlement = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 10000,
    riderEntitlementPaise: 4000,
    collectedPaise: 10000,
  });
  const { tx, state } = fakeWallet({ balance: 25, negativeUsed: 5 });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "parcel", settlement });
  assert.equal(moved.balanceAfter, -35);
  // ₹60 debit from ₹25 → ₹35 newly negative, on top of the ₹5 already used.
  assert.equal(state.negativeUsed, 40);
});

test("fails the settlement if the wallet trigger did not move the balance", async () => {
  const settlement = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx } = fakeWallet({ balance: 500, trigger: false });
  await assert.rejects(
    applySettlementWalletMovement(tx, { ...base, service: "parcel", settlement }),
    /wallet trigger mismatch/
  );
});

test("online settlement credits the full entitlement, never the customer payment", async () => {
  const settlement = computePostpaidSettlement({
    service: "person_ride",
    method: "online",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
  });
  const { tx, state } = fakeWallet({ balance: 0 });
  const moved = await applySettlementWalletMovement(tx, { ...base, service: "person_ride", settlement });
  assert.equal(moved.balanceAfter, 50);
  assert.equal(state.ledger[0]!.amount, 50);
});
