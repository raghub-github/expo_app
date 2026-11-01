import test from "node:test";
import assert from "node:assert/strict";
import { computeRideSettlement } from "./rideSettlement.math.js";

const baseComponents = {
  baseFare: 30,
  distanceFare: 350,
  waitingCharge: 0,
  tollCharge: 0,
  platformFee: 20,
  convenienceFee: 5,
  serviceCharge: 0,
  gatewayFee: 0,
  taxTotal: 20,
  couponDiscount: 0,
  companyFundedDiscount: 0,
  tipAmount: 0,
};

// Zero-fee components so the split is a clean percentage of the bill.
const zeroComponents = {
  baseFare: 100,
  distanceFare: 0,
  waitingCharge: 0,
  tollCharge: 0,
  platformFee: 0,
  convenienceFee: 0,
  serviceCharge: 0,
  gatewayFee: 0,
  taxTotal: 0,
  couponDiscount: 0,
  companyFundedDiscount: 0,
  tipAmount: 0,
};

// The rider's spec, verbatim: fare ₹100, rider payout ₹80, commission ₹20.
// CASH  → rider keeps ₹80 cash; wallet is DEBITED ₹20 (commission) only; earning is ₹80.
// ONLINE→ wallet is CREDITED ₹80 (earning); no wallet debit.
test("rider spec — CASH ₹100: earning 80, wallet DEBIT 20 (commission), no credit", () => {
  const res = computeRideSettlement({
    customerBill: 100,
    customerPaid: 100,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    components: zeroComponents,
  });
  assert.equal(res.riderEarnings, 80); // earning must show +80
  assert.equal(res.companyReceivable, 20); // commission = cxBill - rxBill
  assert.equal(res.walletDebit, 20); // wallet goes DOWN by 20 only
  assert.equal(res.walletCredit, 0); // wallet is NOT credited (rider holds the cash)
  assert.equal(res.companyReceived, 0); // company recovers via the wallet debit
});

test("rider spec — ONLINE ₹100: wallet CREDIT 80 (earning), no debit", () => {
  const res = computeRideSettlement({
    customerBill: 100,
    customerPaid: 100,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: zeroComponents,
  });
  assert.equal(res.riderEarnings, 80);
  assert.equal(res.companyReceivable, 20);
  assert.equal(res.walletCredit, 80); // wallet goes UP by the full earning
  assert.equal(res.walletDebit, 0);
  assert.equal(res.companyReceived, 20); // company share settled from the online collection
});

test("plan example: customer bill 500, company 80, cash rider wallet debits 80 only", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });

  // company charges (platform + convenience + tax + toll + service + gateway + small_order): 20+5+20 = 45
  assert.equal(res.companyChargesTotal, 45);
  // commissionable_base = 500 - 45 - 0 (no waiting, no tip, no cust surge) = 455
  assert.equal(res.commissionableBase, 455);
  // company_commission = 20% of 455 = 91
  assert.equal(res.companyCommission, 91);
  // rider_earnings = 455 - 91 + 0 = 364 (no waiting/tip/surge)
  assert.equal(res.riderEarnings, 364);
  // company_receivable = 45 + 91 = 136
  assert.equal(res.companyReceivable, 136);
  // Cash mode: nothing received by company, rider wallet debited full receivable.
  assert.equal(res.companyReceived, 0);
  assert.equal(res.walletDebit, 136);
  assert.equal(res.walletCredit, 0);
  assert.equal(res.outstandingAmount, 136);
});

test("online mode: rider is credited, company_received equals company_receivable", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });

  assert.equal(res.companyReceivable, 136);
  assert.equal(res.companyReceived, 136);
  assert.equal(res.walletCredit, 364);
  assert.equal(res.walletDebit, 0);
  assert.equal(res.outstandingAmount, 0);
});

test("waiting charge belongs entirely to rider — outside residual split", () => {
  const withWait = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, waitingCharge: 50 },
  });

  // commissionable_base = 550 - 45 - 50 = 455 (same as base example)
  assert.equal(withWait.commissionableBase, 455);
  assert.equal(withWait.companyCommission, 91);
  // rider_earnings = 455 - 91 + 50 (waiting) = 414
  assert.equal(withWait.riderEarnings, 414);
  assert.equal(withWait.companyReceivable, 136);
});

test("tip belongs entirely to rider and does not affect company receivable", () => {
  const res = computeRideSettlement({
    customerBill: 520,
    customerPaid: 520,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, tipAmount: 20 },
  });

  assert.equal(res.commissionableBase, 455);
  assert.equal(res.riderEarnings, 384); // 364 + 20 tip
  assert.equal(res.companyReceivable, 136);
});

test("customer-funded surge flows to the rider without inflating company commission", () => {
  const res = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      ...baseComponents,
      surgeTotal: 50,
      surgeCustomerShare: 50,
      surgeCompanyShare: 0,
    },
  });

  assert.equal(res.commissionableBase, 455);
  assert.equal(res.companyCommission, 91);
  assert.equal(res.riderEarnings, 414); // 364 + 50 surge
  assert.equal(res.companyReceivable, 136);
});

test("company-funded surge is a subsidy: rider paid, receivable includes the subsidy", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      ...baseComponents,
      surgeTotal: 40,
      surgeCustomerShare: 0,
      surgeCompanyShare: 40,
    },
  });

  // Company-funded surge is NOT in the customer bill. commissionable_base
  // stays at 455 (no customer surge deducted, no tip/waiting).
  assert.equal(res.commissionableBase, 455);
  assert.equal(res.companyCommission, 91);
  // rider_earnings = 455 - 91 + 40 subsidy = 404
  assert.equal(res.riderEarnings, 404);
  // company_receivable = 45 charges + 91 commission + 40 subsidy = 176
  assert.equal(res.companyReceivable, 176);
});

test("shared surge splits both sides according to funding config", () => {
  const res = computeRideSettlement({
    customerBill: 525,
    customerPaid: 525,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      ...baseComponents,
      surgeTotal: 50,
      surgeCustomerShare: 25,
      surgeCompanyShare: 25,
    },
  });

  // customer bill 525 - 45 charges - 25 customer surge = 455 base
  assert.equal(res.commissionableBase, 455);
  assert.equal(res.companyCommission, 91);
  // rider gets 364 residual + 25 customer surge + 25 company subsidy = 414
  assert.equal(res.riderEarnings, 414);
  assert.equal(res.companyReceivable, 161); // 45 + 91 + 25 subsidy
});

test("cash rider debit uses company_receivable, not customer_bill", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "cash",
    platformPercentage: 15,
    riderPercentage: 85,
    components: baseComponents,
  });

  // 15% commission on 455 = 68.25
  assert.equal(res.companyCommission, 68.25);
  assert.equal(res.companyReceivable, 113.25);
  assert.equal(res.walletDebit, 113.25);
  assert.equal(res.walletCredit, 0);
  // Sanity: rider wallet must never be debited by the full fare.
  assert.notEqual(res.walletDebit, 500);
});

test("company-funded discount reduces company receivable without touching rider earnings", () => {
  const res = computeRideSettlement({
    customerBill: 480, // 500 bill - 20 platform-funded discount
    customerPaid: 480,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, companyFundedDiscount: 20 },
  });

  // The discount is the company's promotion, so it is added back before the base
  // is split: the rider earns the same as they would on the undiscounted ride and
  // the company absorbs the ₹20. (This test previously asserted the opposite —
  // that the rider's share shrank with the customer's discount.)
  assert.equal(res.commissionableBase, 455, "gross base, discount added back");
  assert.equal(res.commissionableBaseNet, 435, "what the customer actually funded");
  assert.equal(res.companyCommission, 91);
  assert.equal(res.riderEarnings, 364);
  assert.equal(res.promotionSubsidy, 16, "80% of the ₹20 the company gave away");
  // Receivable = 45 charges + 91 commission - 20 discount = 116
  assert.equal(res.companyReceivable, 116);
});

test("zero platform percentage still produces a valid settlement (rider gets full residual)", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 0,
    riderPercentage: 100,
    components: baseComponents,
  });

  assert.equal(res.companyCommission, 0);
  assert.equal(res.riderEarnings, 455);
  assert.equal(res.companyReceivable, 45);
});

// ---------------------------------------------------------------------------
// Phase 4 hardening — idempotency, corner cases, extension-point contracts
// ---------------------------------------------------------------------------

test("idempotency: calling computeRideSettlement twice with identical input returns byte-identical output", () => {
  const input = {
    customerBill: 725,
    customerPaid: 725,
    paymentMode: "online" as const,
    platformPercentage: 22,
    riderPercentage: 78,
    components: {
      ...baseComponents,
      waitingCharge: 15,
      surgeTotal: 40,
      surgeCustomerShare: 40,
      surgeCompanyShare: 0,
      tipAmount: 20,
      companyFundedDiscount: 10,
    },
  };
  const a = computeRideSettlement(input);
  const b = computeRideSettlement(input);
  assert.deepStrictEqual(a, b);
});

test("over-payment: customerPaid > customerBill — outstanding reports the credit", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 520,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  // Company received the full bill (Razorpay captured 520 but only 500 is due).
  // The extra 20 is not company income — treated as a credit to refund; the
  // outstanding stays at the difference the engine reconciles later.
  assert.equal(res.companyReceived, res.companyReceivable);
  assert.equal(res.customerPaid, 520);
});

test("under-payment: customerPaid < customerBill on cash creates outstanding on rider wallet", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 400, // rider only collected partial cash
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  // Company still needs its full receivable from the rider's wallet.
  assert.equal(res.walletDebit, res.companyReceivable);
  assert.equal(res.outstandingAmount, res.companyReceivable);
});

test("everything zero: an all-null components bag never NaNs or returns negative earnings", () => {
  const res = computeRideSettlement({
    customerBill: 0,
    customerPaid: 0,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {},
  });
  assert.ok(Number.isFinite(res.commissionableBase));
  assert.ok(res.riderEarnings >= 0);
  assert.ok(res.companyReceivable >= 0);
  assert.ok(res.walletDebit >= 0);
});

test("extension contract: nightCharge is rider pass-through (like waiting), not commissionable", () => {
  const base = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  const withNight = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, nightCharge: 50 },
  });
  // Night is outside residual split — commissionable base unchanged.
  assert.equal(withNight.commissionableBase, base.commissionableBase);
  assert.equal(withNight.companyCommission, base.companyCommission);
  // Rider keeps the full night charge.
  assert.equal(withNight.riderEarnings, base.riderEarnings + 50);
  assert.equal(withNight.companyReceivable, base.companyReceivable);
});

test("toll is rider pass-through by default — no commission, not company receivable", () => {
  const base = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  const withToll = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, tollCharge: 50 },
  });
  assert.equal(withToll.companyChargesTotal, base.companyChargesTotal);
  assert.equal(withToll.commissionableBase, base.commissionableBase);
  assert.equal(withToll.companyCommission, base.companyCommission);
  assert.equal(withToll.riderEarnings, base.riderEarnings + 50);
  assert.equal(withToll.companyReceivable, base.companyReceivable);
  assert.equal(withToll.walletCredit, withToll.riderEarnings);
});

test("commissionOnToll=true restores legacy toll-as-company-charge behaviour", () => {
  const res = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    commissionOnToll: true,
    components: { ...baseComponents, tollCharge: 50 },
  });
  // company charges = 45 + 50 toll = 95
  assert.equal(res.companyChargesTotal, 95);
  // commissionable = 550 - 95 = 455
  assert.equal(res.commissionableBase, 455);
  assert.equal(res.companyCommission, 91);
  assert.equal(res.companyReceivable, 186); // 95 + 91
  assert.equal(res.walletDebit, 186);
});

test("company-funded pickup incentive adds to rider earnings and company receivable", () => {
  const base = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  const withPickup = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...baseComponents, pickupIncentive: 30 },
  });
  // Default omitted shares → company-funded deadhead subsidy.
  assert.equal(withPickup.commissionableBase, base.commissionableBase);
  assert.equal(withPickup.riderEarnings, base.riderEarnings + 30);
  assert.equal(withPickup.companyReceivable, base.companyReceivable + 30);
});

test("customer-funded pickup incentive is outside residual and does not inflate receivable", () => {
  const base = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });
  const withPickup = computeRideSettlement({
    customerBill: 530,
    customerPaid: 530,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      ...baseComponents,
      pickupIncentive: 30,
      pickupIncentiveCustomerShare: 30,
      pickupIncentiveCompanyShare: 0,
    },
  });
  assert.equal(withPickup.commissionableBase, base.commissionableBase);
  assert.equal(withPickup.riderEarnings, base.riderEarnings + 30);
  assert.equal(withPickup.companyReceivable, base.companyReceivable);
});

test("cash + platform_percentage 0 still recovers company charges from rider wallet", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "cash",
    platformPercentage: 0,
    riderPercentage: 100,
    components: baseComponents,
  });

  assert.equal(res.walletDebit, 45); // pure pass-through of company charges
  assert.equal(res.outstandingAmount, 45);
});

test("outstanding equals difference between receivable and received (partial online capture)", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 100, // partial capture — rare, but must not crash
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: baseComponents,
  });

  assert.equal(res.companyReceived, 100); // clamped to customerPaid
  assert.equal(res.outstandingAmount, 36); // 136 receivable - 100 received
});

test("negative wallet flag path: rider_earnings never negative even with weird inputs", () => {
  const res = computeRideSettlement({
    customerBill: 50,
    customerPaid: 50,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      ...baseComponents,
      platformFee: 40,
      convenienceFee: 20,
      taxTotal: 20,
    },
  });

  // companyChargesTotal 80 > bill 50 → commissionable_base clamps to 0.
  assert.equal(res.commissionableBase, 0);
  assert.equal(res.companyCommission, 0);
  assert.equal(res.riderEarnings, 0);
  assert.ok(res.companyReceivable >= 0);
});

// ---------------------------------------------------------------------------
// Offer-independent rider pay. The owner's rule, verbatim: "if any ride rider
// app showing 50 rupees and customer app showing 30 rupees and 20 rupees
// discount, then rider should get 50 rupees after the ride, customer will pay
// 30 and company deposit 20 in his wallet to fulfill it."
// ---------------------------------------------------------------------------

const offerComponents = (discount: number, companyFunded = 0) => ({
  ...zeroComponents,
  couponDiscount: discount - companyFunded,
  companyFundedDiscount: companyFunded,
});

test("owner's example — ₹50 fare, ₹20 coupon, CASH: rider gets ₹50, company tops up ₹20", () => {
  const res = computeRideSettlement({
    customerBill: 30, // customer pays the discounted fare
    customerPaid: 30,
    paymentMode: "cash",
    platformPercentage: 0,
    riderPercentage: 100,
    components: { ...offerComponents(20), baseFare: 50 },
  });
  assert.equal(res.riderEarnings, 50, "rider earns the GROSS fare, not the discounted one");
  assert.equal(res.promotionSubsidy, 20, "company funds the whole ₹20 gap");
  // Rider holds ₹30 cash and is owed ₹50 → the company puts ₹20 in the wallet.
  assert.equal(res.walletCredit, 20);
  assert.equal(res.walletDebit, 0);
});

test("owner's example — ₹50 fare, ₹20 coupon, ONLINE: wallet credited the full ₹50", () => {
  const res = computeRideSettlement({
    customerBill: 30,
    customerPaid: 30,
    paymentMode: "online",
    platformPercentage: 0,
    riderPercentage: 100,
    components: { ...offerComponents(20), baseFare: 50 },
  });
  assert.equal(res.riderEarnings, 50);
  assert.equal(res.walletCredit, 50, "company collected ₹30 and still owes the rider ₹50");
});

test("first ride free — customer pays ₹0, rider still paid in full by the company", () => {
  for (const paymentMode of ["cash", "online"] as const) {
    const res = computeRideSettlement({
      customerBill: 0,
      customerPaid: 0,
      paymentMode,
      platformPercentage: 0,
      riderPercentage: 100,
      components: { ...offerComponents(100), baseFare: 100 },
    });
    assert.equal(res.riderEarnings, 100, `${paymentMode}: free ride must still pay the rider`);
    assert.equal(res.walletCredit, 100, `${paymentMode}: the whole amount comes from the company`);
    assert.equal(res.walletDebit, 0);
    assert.equal(res.promotionSubsidy, 100);
  }
});

test("commission still applies to the gross fare, so the rider keeps their normal share", () => {
  const res = computeRideSettlement({
    customerBill: 80, // ₹100 fare less a ₹20 discount
    customerPaid: 80,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: offerComponents(20),
  });
  // Undiscounted, this rider would earn ₹80. The offer must not change that.
  assert.equal(res.riderEarnings, 80);
  assert.equal(res.commissionableBase, 100, "base is the gross fare");
  assert.equal(res.commissionableBaseNet, 80, "net base records what was collected");
  assert.equal(res.companyCommission, 20);
  assert.equal(res.promotionSubsidy, 16, "the rider's 80% share of the ₹20 discount");
});

test("a company-funded discount behaves identically to a coupon for the rider", () => {
  const coupon = computeRideSettlement({
    customerBill: 80,
    customerPaid: 80,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: offerComponents(20, 0),
  });
  const companyFunded = computeRideSettlement({
    customerBill: 80,
    customerPaid: 80,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: offerComponents(20, 20),
  });
  assert.equal(coupon.riderEarnings, companyFunded.riderEarnings);
  assert.equal(coupon.promotionSubsidy, companyFunded.promotionSubsidy);
});

test("no discount changes nothing — rider pay is identical with and without the new path", () => {
  const res = computeRideSettlement({
    customerBill: 425,
    customerPaid: 425,
    paymentMode: "online",
    platformPercentage: 18,
    riderPercentage: 82,
    components: baseComponents,
  });
  assert.equal(res.promotionSubsidy, 0, "no offer ⇒ no subsidy");
  assert.equal(res.commissionableBase, res.commissionableBaseNet);
});

test("money is conserved: customer payment + company subsidy funds rider + company", () => {
  for (const discount of [0, 10, 25, 50, 100]) {
    const res = computeRideSettlement({
      customerBill: 100 - discount,
      customerPaid: 100 - discount,
      paymentMode: "online",
      platformPercentage: 20,
      riderPercentage: 80,
      components: offerComponents(discount),
    });

    // The rider's entitlement never moves with the customer's discount.
    assert.equal(res.riderEarnings, 80, `discount ${discount}: rider pay must not move`);

    // Every rupee paid to the rider is funded either by the customer's payment or
    // by the company. Nothing is created and nothing is lost.
    const fundedByCustomer = Math.min(res.customerPaid, res.riderEarnings);
    const fundedByCompany = Math.max(0, res.riderEarnings - res.customerPaid);
    assert.equal(
      Math.round((fundedByCustomer + fundedByCompany) * 100) / 100,
      res.riderEarnings,
      `discount ${discount}: rider payout is fully funded`
    );

    // And the subsidy we report is exactly the share the discount would have cost
    // the rider at this commission rate.
    assert.equal(
      res.promotionSubsidy,
      Math.round(discount * 0.8 * 100) / 100,
      `discount ${discount}: reported subsidy`
    );
  }
});

test("waiting and tip stay fully the rider's and are never commissioned", () => {
  const res = computeRideSettlement({
    customerBill: 100 + 40 + 15,
    customerPaid: 155,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...zeroComponents, waitingCharge: 40, tipAmount: 15 },
  });
  // ₹100 fare → ₹80 rider share, plus ₹40 waiting and ₹15 tip in full.
  assert.equal(res.riderEarnings, 135);
  assert.equal(res.companyCommission, 20);
});

test("cash: a company-funded surge is not recovered from the rider's wallet", () => {
  const res = computeRideSettlement({
    customerBill: 100,
    customerPaid: 100,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...zeroComponents, surgeTotal: 30, surgeCustomerShare: 0, surgeCompanyShare: 30 },
  });
  // Rider earns ₹80 of fare + ₹30 company surge = ₹110, holds ₹100 cash.
  assert.equal(res.riderEarnings, 110);
  assert.equal(res.walletCredit, 10, "company owes the rider ₹10, it must not debit them");
  assert.equal(res.walletDebit, 0);
});

test("Max gate: a rider without GatiMitra Max does not receive the waiting charge", () => {
  const withMax = computeRideSettlement({
    customerBill: 140,
    customerPaid: 140,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    riderWaitingEntitled: true,
    components: { ...zeroComponents, waitingCharge: 40 },
  });
  const withoutMax = computeRideSettlement({
    customerBill: 140,
    customerPaid: 140,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    riderWaitingEntitled: false,
    components: { ...zeroComponents, waitingCharge: 40 },
  });

  assert.equal(withMax.riderEarnings, 120, "₹80 fare share + ₹40 waiting");
  assert.equal(withoutMax.riderEarnings, 80, "fare share only — company retains the waiting");
  // The customer paid the same either way, and the withheld waiting must not leak
  // back to the rider through the commissionable base.
  assert.equal(withoutMax.commissionableBase, withMax.commissionableBase);
  assert.equal(withoutMax.companyChargesTotal, withMax.companyChargesTotal + 40);
});

test("Max gate defaults to entitled so an omitted flag never withholds pay", () => {
  const omitted = computeRideSettlement({
    customerBill: 140,
    customerPaid: 140,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...zeroComponents, waitingCharge: 40 },
  });
  assert.equal(omitted.riderEarnings, 120);
});
