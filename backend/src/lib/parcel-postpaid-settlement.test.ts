import assert from "node:assert/strict";
import { test } from "node:test";
import { buildParcelSettlementId, classifyParcelPaymentMethod } from "./parcel-postpaid-settlement.js";
import { explainSettlement } from "./rider-settlement-summary.js";

test("a parcel settles as cash only when the rider recorded a cash collection", () => {
  assert.equal(
    classifyParcelPaymentMethod({ parcelPaymentMethod: "cash", corePaymentMethod: "cash", paymentStatus: "completed" }),
    "cash"
  );
  assert.equal(
    classifyParcelPaymentMethod({ parcelPaymentMethod: null, corePaymentMethod: "cod", paymentStatus: "paid" }),
    "cash"
  );
});

test("QR, in-app and GatiCash parcels settle as online", () => {
  for (const m of ["online", "wallet", "upi"]) {
    assert.equal(
      classifyParcelPaymentMethod({ parcelPaymentMethod: m, corePaymentMethod: "cash", paymentStatus: "completed" }),
      "online"
    );
  }
});

test("an unpaid parcel never settles (no credit before verified payment)", () => {
  for (const status of ["pending", "failed", "refunded", null]) {
    assert.equal(
      classifyParcelPaymentMethod({ parcelPaymentMethod: "cash", corePaymentMethod: "cash", paymentStatus: status }),
      null
    );
  }
});

test("parcel settlement ids never collide with ride settlement ids", () => {
  assert.equal(buildParcelSettlementId(170), "parcel_settle:v1:170");
  assert.notEqual(buildParcelSettlementId(170), "ride_settle:v1:170");
});

test("rider explanations never call the customer's cash a wallet credit", () => {
  const debit = explainSettlement({
    paymentMethod: "cash",
    customerPayable: 70,
    cashCollected: 70,
    riderEntitlement: 50,
    walletCredit: 0,
    walletDebit: 20,
  });
  assert.match(debit, /collected ₹70 in cash and earned ₹50/);
  assert.match(debit, /₹20 difference is the platform's share, deducted/);

  const topUp = explainSettlement({
    paymentMethod: "cash",
    customerPayable: 30,
    cashCollected: 30,
    riderEntitlement: 50,
    walletCredit: 20,
    walletDebit: 0,
  });
  assert.match(topUp, /credited the ₹20 difference/);

  const equal = explainSettlement({
    paymentMethod: "cash",
    customerPayable: 50,
    cashCollected: 50,
    riderEntitlement: 50,
    walletCredit: 0,
    walletDebit: 0,
  });
  assert.match(equal, /No wallet change/);

  const online = explainSettlement({
    paymentMethod: "online",
    customerPayable: 70,
    cashCollected: 0,
    riderEntitlement: 50,
    walletCredit: 50,
    walletDebit: 0,
  });
  assert.match(online, /paid ₹70 online.*₹50 was credited/);
});
