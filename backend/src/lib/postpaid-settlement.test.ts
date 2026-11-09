import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePostpaidSettlement,
  journalAccountNet,
  toPaise,
  type PostpaidService,
} from "./postpaid-settlement.js";

const SERVICES: PostpaidService[] = ["person_ride", "parcel"];
const rs = (rupees: number) => rupees * 100;

// Spec matrix A — cash. [customer payable, rider entitlement, wallet Δ] in ₹.
const CASH_MATRIX: Array<[number, number, number]> = [
  [70, 50, -20],
  [30, 50, 20],
  [50, 50, 0],
  [0, 50, 50],
  [100, 80, -20],
  [80, 100, 20],
  [1, 50, 49],
];

for (const service of SERVICES) {
  for (const [payable, entitlement, delta] of CASH_MATRIX) {
    test(`${service} cash: payable ₹${payable}, entitlement ₹${entitlement} → wallet ${delta >= 0 ? "+" : ""}₹${delta}`, () => {
      const r = computePostpaidSettlement({
        service,
        method: "cash",
        customerPayablePaise: rs(payable),
        riderEntitlementPaise: rs(entitlement),
        collectedPaise: rs(payable),
      });
      assert.equal(r.cashCollectedPaise, rs(payable));
      assert.equal(r.platformCollectedPaise, 0);
      assert.equal(r.walletDeltaPaise, rs(delta));
      assert.equal(r.walletCreditPaise, Math.max(0, rs(delta)));
      assert.equal(r.walletDebitPaise, Math.max(0, -rs(delta)));
      // Cash in hand + wallet movement = exactly the entitlement.
      assert.equal(r.cashCollectedPaise + r.walletDeltaPaise, rs(entitlement));
      // The cash itself never reaches the wallet.
      assert.ok(r.walletCreditPaise < rs(payable) || payable < entitlement);
      assert.deepEqual(r.warnings, []);
    });
  }
}

// Spec matrix B — online. [customer payment, rider entitlement, wallet credit] in ₹.
const ONLINE_MATRIX: Array<[number, number, number]> = [
  [70, 50, 50],
  [30, 50, 50],
  [50, 50, 50],
  [0, 50, 50],
  [100, 80, 80],
  [80, 100, 100],
];

for (const service of SERVICES) {
  for (const [paid, entitlement, credit] of ONLINE_MATRIX) {
    test(`${service} online: paid ₹${paid}, entitlement ₹${entitlement} → wallet +₹${credit}`, () => {
      const r = computePostpaidSettlement({
        service,
        method: "online",
        customerPayablePaise: rs(paid),
        riderEntitlementPaise: rs(entitlement),
        collectedPaise: rs(paid),
      });
      assert.equal(r.walletCreditPaise, rs(credit));
      assert.equal(r.walletDebitPaise, 0);
      assert.equal(r.cashCollectedPaise, 0);
      assert.equal(r.platformCollectedPaise, rs(paid));
      assert.equal(r.outstandingPaise, 0);
      // Platform result = what it collected − what it paid the rider.
      assert.equal(r.platformNetPaise, rs(paid) - rs(entitlement));
    });
  }
}

test("zero payable (100% offer): no fake customer payment, rider gets the full entitlement", () => {
  for (const method of ["cash", "online"] as const) {
    const r = computePostpaidSettlement({
      service: "person_ride",
      method,
      customerPayablePaise: 0,
      riderEntitlementPaise: rs(50),
      collectedPaise: 0,
      discountPaise: rs(50),
    });
    assert.equal(r.walletCreditPaise, rs(50));
    assert.equal(r.promotionalSubsidyPaise, rs(50));
    assert.equal(r.platformCommissionPaise, 0);
    assert.equal(journalAccountNet(r.journal, "GATEWAY_CLEARING"), 0);
    assert.equal(journalAccountNet(r.journal, "CASH_WITH_RIDER"), 0);
  }
});

test("C − R is not all commission: tax is carved out as a liability", () => {
  // ₹70 invoice incl. ₹3.33 GST, rider earns ₹50.
  const r = computePostpaidSettlement({
    service: "person_ride",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
    taxPaise: 333,
  });
  assert.equal(r.walletDebitPaise, 2000);
  assert.equal(r.taxPaise, 333);
  assert.equal(r.platformCommissionPaise, 1667);
  assert.equal(journalAccountNet(r.journal, "TAX_LIABILITY"), -333);
  assert.equal(journalAccountNet(r.journal, "PLATFORM_COMMISSION_REVENUE"), -1667);
});

test("offer below entitlement: subsidy includes the tax the platform still owes", () => {
  // ₹30 invoice incl. ₹1.43 GST; rider earns ₹50. Platform pays ₹20 + owes ₹1.43.
  const r = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 3000,
    riderEntitlementPaise: 5000,
    collectedPaise: 3000,
    taxPaise: 143,
    discountPaise: 4000,
  });
  assert.equal(r.walletCreditPaise, 2000);
  assert.equal(r.promotionalSubsidyPaise, 2143);
  assert.equal(r.platformCommissionPaise, 0);
  assert.equal(r.platformNetPaise, -2143);
});

test("tip is the rider's: it is paid once and never commissioned", () => {
  // ₹80 invoice = ₹70 fare + ₹10 tip; rider entitlement ₹60 = ₹50 earning + ₹10 tip.
  const r = computePostpaidSettlement({
    service: "person_ride",
    method: "online",
    customerPayablePaise: 8000,
    riderEntitlementPaise: 6000,
    collectedPaise: 8000,
    tipPaise: 1000,
  });
  assert.equal(r.walletCreditPaise, 6000);
  assert.equal(r.platformCommissionPaise, 2000);
  assert.equal(journalAccountNet(r.journal, "TIP_PAYABLE"), 0, "tip payable is fully discharged");
  const tipCredits = r.journal.filter((l) => l.account === "TIP_PAYABLE" && l.direction === "credit");
  assert.equal(tipCredits.length, 1);
  assert.equal(tipCredits[0]!.amountPaise, 1000);
});

test("a tip paid separately is not mistaken for a subsidy", () => {
  // Invoice ₹70 (no tip); rider ₹60 = ₹50 + ₹10 tip paid through a separate tip payment.
  const r = computePostpaidSettlement({
    service: "person_ride",
    method: "online",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 6000,
    collectedPaise: 7000,
    tipPaise: 1000,
    tipIncludedInPayable: false,
  });
  assert.equal(r.platformCommissionPaise, 2000);
  assert.equal(r.promotionalSubsidyPaise, 0);
  assert.equal(r.walletCreditPaise, 6000);
});

test("company incentive is an expense, separate from commission", () => {
  // ₹70 invoice; rider ₹60 = ₹50 earning + ₹10 company night incentive.
  const r = computePostpaidSettlement({
    service: "parcel",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 6000,
    collectedPaise: 7000,
    incentivePaise: 1000,
  });
  assert.equal(r.walletDebitPaise, 1000);
  assert.equal(r.platformCommissionPaise, 2000);
  assert.equal(r.incentivePaise, 1000);
  assert.equal(r.platformNetPaise, 1000);
  assert.equal(journalAccountNet(r.journal, "RIDER_INCENTIVE_EXPENSE"), 1000);
});

test("GatiCash part of an online payment is booked against the customer wallet", () => {
  const r = computePostpaidSettlement({
    service: "person_ride",
    method: "online",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 7000,
    walletPaidPaise: 2000,
  });
  assert.equal(journalAccountNet(r.journal, "GATEWAY_CLEARING"), 5000);
  assert.equal(journalAccountNet(r.journal, "CUSTOMER_WALLET_LIABILITY"), 2000);
});

test("cash under-collection stays with the rider and is flagged", () => {
  const r = computePostpaidSettlement({
    service: "person_ride",
    method: "cash",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 6000,
  });
  assert.equal(r.walletDebitPaise, 2000);
  assert.equal(r.warnings.length, 1);
});

test("online under-capture leaves the receivable open", () => {
  const r = computePostpaidSettlement({
    service: "parcel",
    method: "online",
    customerPayablePaise: 7000,
    riderEntitlementPaise: 5000,
    collectedPaise: 5000,
  });
  assert.equal(r.outstandingPaise, 2000);
  assert.equal(journalAccountNet(r.journal, "CUSTOMER_RECEIVABLE"), 2000);
});

test("every journal balances and the wallet account matches the wallet movement", () => {
  const amounts = [0, 1, 99, 3000, 5000, 7000, 10000, 123456];
  for (const method of ["cash", "online"] as const) {
    for (const C of amounts) {
      for (const R of amounts) {
        const tax = Math.floor(C / 21);
        const tip = Math.min(R, Math.floor(C / 10));
        const r = computePostpaidSettlement({
          service: "parcel",
          method,
          customerPayablePaise: C,
          riderEntitlementPaise: R,
          collectedPaise: C,
          taxPaise: tax,
          tipPaise: tip,
          incentivePaise: Math.floor((R - tip) / 5),
        });
        const debits = r.journal.filter((l) => l.direction === "debit").reduce((s, l) => s + l.amountPaise, 0);
        const credits = r.journal.filter((l) => l.direction === "credit").reduce((s, l) => s + l.amountPaise, 0);
        assert.equal(debits, credits);
        assert.equal(journalAccountNet(r.journal, "RIDER_WALLET") + r.walletDeltaPaise, 0);
        assert.equal(journalAccountNet(r.journal, "RIDER_PAYABLE"), 0);
        assert.equal(journalAccountNet(r.journal, "CUSTOMER_RECEIVABLE"), 0);
        // The rider always ends up with exactly R across cash and wallet.
        assert.equal(r.cashCollectedPaise + r.walletDeltaPaise, R);
      }
    }
  }
});

test("rejects fractional paise and negative amounts instead of rounding them", () => {
  assert.throws(() =>
    computePostpaidSettlement({
      service: "person_ride",
      method: "cash",
      customerPayablePaise: 70.5,
      riderEntitlementPaise: 5000,
      collectedPaise: 7000,
    })
  );
  assert.throws(() =>
    computePostpaidSettlement({
      service: "person_ride",
      method: "online",
      customerPayablePaise: 7000,
      riderEntitlementPaise: -1,
      collectedPaise: 7000,
    })
  );
});

test("toPaise converts DB rupee strings exactly", () => {
  assert.equal(toPaise("72.55"), 7255);
  assert.equal(toPaise(42.3), 4230);
  assert.equal(toPaise("0.07"), 7);
  assert.equal(toPaise(null), 0);
  assert.equal(toPaise("abc"), 0);
});
