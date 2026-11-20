/**
 * End-to-end: getRiderAccountRestrictions — the snapshot that dispatch, the duty
 * toggle, app banners and withdrawals all read — must apply ONE wallet rule:
 * active while balance > floor (Super Admin, default −₹200).
 *
 * The DB is a fake that answers by table; the policy loader and the background
 * resync are stubbed. Nothing real is touched.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as schema from "../db/schema.js";

type Block = { serviceType: string; reason: string };

function fakeDb(opts: { balance: number; blocks: Block[]; status?: string }) {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === schema.riders) return [{ status: opts.status ?? "ACTIVE" }];
    if (table === schema.riderWallet) {
      return [
        {
          riderId: 1001,
          totalBalance: String(opts.balance),
          penaltiesFood: "0",
          penaltiesParcel: "0",
          penaltiesPersonRide: "0",
        },
      ];
    }
    if (table === schema.riderNegativeWalletBlocks) return opts.blocks;
    if (table === schema.riderPenalties) return [{ total: "0" }];
    return []; // blacklist_history, duty logs, …
  };
  const chain = (table: unknown) => {
    const rows = rowsFor(table);
    const c: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy", "groupBy"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject);
    return c;
  };
  return { select: () => ({ from: (table: unknown) => chain(table) }) };
}

async function restrictionsFor(
  t: TestContext,
  opts: { balance: number; blocks?: Block[]; floor?: number; status?: string }
) {
  const resyncs: number[] = [];
  const db = fakeDb({ balance: opts.balance, blocks: opts.blocks ?? [], status: opts.status });
  t.mock.module("../db/client.js", {
    namedExports: { getDb: () => db, getSql: () => async () => [] },
  });
  t.mock.module("../modules/rides/settlement/rideSettlement.repository.js", {
    namedExports: {
      loadRideWalletPolicy: async () => ({
        serviceNegativeThreshold: 50,
        globalBlockThreshold: opts.floor ?? -200,
        cashSettlementEnabled: true,
        autoUnblockOnZero: true,
        commissionOnToll: false,
      }),
    },
  });
  t.mock.module("./rider-negative-wallet-blocks.js", {
    namedExports: {
      NEGATIVE_WALLET_THRESHOLD: 50,
      GLOBAL_BLOCK_THRESHOLD: -200,
      applyFifoAllocation: async () => undefined,
      syncNegativeWalletBlocks: async (riderId: number) => {
        resyncs.push(riderId);
      },
    },
  });
  const m = await import(`./rider-account-restrictions.js?v=${Math.random()}`);
  const r = await m.getRiderAccountRestrictions(1001);
  await new Promise((res) => setImmediate(res));
  await new Promise((res) => setImmediate(res));
  return { r, resyncs };
}

test("GMR1001 at ₹0 (after withdrawing the whole wallet) is NOT restricted", async (t) => {
  const { r } = await restrictionsFor(t, { balance: 0 });
  assert.equal(r.accountRestricted, false);
  assert.deepEqual(r.blacklistBlockedServices, []);
  assert.equal(r.globalWalletBlock, false);
  assert.equal(r.walletMinBalance.restricted, false);
  assert.equal(r.walletFloor.blocked, false);
});

for (const balance of [190, 4, -1, -150, -199.99]) {
  test(`balance ₹${balance} (above −₹200) keeps every service open`, async (t) => {
    const { r } = await restrictionsFor(t, { balance });
    assert.equal(r.accountRestricted, false);
    assert.deepEqual(r.blacklistBlockedServices, []);
    assert.equal(r.allServicesBlacklisted, false);
  });
}

test("balance −₹200 → every service paused, with the exact unlock amount", async (t) => {
  const { r } = await restrictionsFor(t, { balance: -200, blocks: [{ serviceType: "food", reason: "global_emergency" }] });
  assert.equal(r.globalWalletBlock, true);
  assert.equal(r.allServicesBlacklisted, true);
  assert.deepEqual([...r.blacklistBlockedServices].sort(), ["food", "parcel", "person_ride"]);
  assert.equal(r.walletFloor.unlockAmount, 1);
  assert.equal(r.penaltyDutyStopped, true, "global floor breach stops duty");
});

test("balance −₹350 → paused; recharge ₹151 to unlock, ₹350 clears dues", async (t) => {
  const { r } = await restrictionsFor(t, { balance: -350 });
  assert.equal(r.globalWalletBlock, true);
  assert.equal(r.walletFloor.unlockAmount, 151);
  assert.equal(r.walletFloor.clearDuesAmount, 350);
});

test("recharged from −₹250 to −₹150 with a stale global row → unblocked now, resync queued", async (t) => {
  const stale = ["food", "parcel", "person_ride"].map((s) => ({ serviceType: s, reason: "global_emergency" }));
  const { r, resyncs } = await restrictionsFor(t, { balance: -150, blocks: stale });
  assert.equal(r.globalWalletBlock, false);
  assert.equal(r.accountRestricted, false);
  assert.deepEqual(r.blacklistBlockedServices, []);
  assert.equal(r.penaltyDutyStopped, false);
  assert.deepEqual(resyncs, [1001]);
});

test("the Super Admin floor is honoured (−₹500 keeps −₹300 active; no hardcoded −200)", async (t) => {
  const { r } = await restrictionsFor(t, { balance: -300, floor: -500 });
  assert.equal(r.globalWalletBlock, false);
  assert.equal(r.accountRestricted, false);
});

test("a per-service penalty block still applies while the wallet is negative", async (t) => {
  const { r } = await restrictionsFor(t, {
    balance: -80,
    blocks: [{ serviceType: "food", reason: "negative_wallet" }],
  });
  assert.equal(r.globalWalletBlock, false);
  assert.deepEqual(r.blacklistBlockedServices, ["food"]);
});

test("BLOCKED account status still blocks everything regardless of wallet", async (t) => {
  const { r } = await restrictionsFor(t, { balance: 5000, status: "BLOCKED" });
  assert.equal(r.accountRestricted, true);
  assert.equal(r.allServicesBlacklisted, true);
});
