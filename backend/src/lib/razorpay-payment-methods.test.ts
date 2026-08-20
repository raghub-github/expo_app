import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapRazorpayMethodsPayload,
  defaultCheckoutPayMethods,
} from "./razorpay-payment-methods.js";

describe("mapRazorpayMethodsPayload", () => {
  it("does not invent methods when the payload is empty", () => {
    const mapped = mapRazorpayMethodsPayload({}, false);
    assert.equal(mapped.dummy, false);
    assert.equal(mapped.sections.length, 0);
  });

  it("does not invent methods when the payload is null", () => {
    const mapped = mapRazorpayMethodsPayload(null, false);
    assert.equal(mapped.sections.length, 0);
  });

  it("enables Cards when Visa/MC/RuPay networks are on, even if card is an object", () => {
    const mapped = mapRazorpayMethodsPayload(
      {
        entity: "methods",
        card: { credit: true, debit: true },
        card_networks: { VISA: true, MC: true, RUPAY: true, AMEX: false },
        upi: false,
        wallet: {},
        netbanking: {},
      },
      false
    );
    const ids = mapped.sections.map((s) => s.id);
    assert.ok(ids.includes("cards"));
    assert.ok(!ids.includes("recommended"));
    assert.equal(mapped.sections.find((s) => s.id === "cards")?.items[0]?.method, "card");
  });

  it("treats boolean true card + upi as enabled (classic /v1/methods shape)", () => {
    const mapped = mapRazorpayMethodsPayload(
      { card: true, debit_card: true, credit_card: true, upi: true, wallet: {}, netbanking: {} },
      false
    );
    const ids = mapped.sections.map((s) => s.id);
    assert.ok(ids.includes("cards"));
    assert.ok(ids.includes("recommended"));
    assert.ok(ids.includes("upi"));
  });

  it("treats nested upi.intent as UPI enabled", () => {
    const mapped = mapRazorpayMethodsPayload({ upi: { intent: true, collect: true }, card: false }, false);
    assert.ok(mapped.sections.some((s) => s.id === "recommended" || s.id === "upi"));
  });

  it("only lists wallets Razorpay marked enabled", () => {
    const mapped = mapRazorpayMethodsPayload(
      {
        card: false,
        upi: false,
        wallet: { mobikwik: true, payzapp: true, olamoney: true, paytm: false },
      },
      false
    );
    const wallets = mapped.sections.find((s) => s.id === "wallets")?.items ?? [];
    assert.deepEqual(
      wallets.map((w) => w.wallet).sort(),
      ["mobikwik", "olamoney", "payzapp"]
    );
  });

  it("shows netbanking when Razorpay returns a bank map", () => {
    const mapped = mapRazorpayMethodsPayload(
      { netbanking: { HDFC: "HDFC Bank", UTIB: "Axis Bank" }, card: false, upi: false },
      false
    );
    assert.ok(mapped.sections.some((s) => s.id === "netbanking"));
  });

  it("unwraps a nested methods object", () => {
    const mapped = mapRazorpayMethodsPayload({ methods: { card: true, upi: true } }, false);
    const ids = mapped.sections.map((s) => s.id);
    assert.ok(ids.includes("cards"));
    assert.ok(ids.includes("recommended"));
  });

  it("dummy catalog is explicit dummy mode only", () => {
    const dummy = defaultCheckoutPayMethods(true);
    assert.equal(dummy.dummy, true);
    assert.ok(dummy.sections.length > 0);
  });
});
