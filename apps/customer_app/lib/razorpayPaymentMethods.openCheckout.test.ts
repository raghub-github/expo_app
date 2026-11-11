import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PAY_INSTRUMENT,
  ensureUpiQrAndCollectVisible,
  isOpenCheckoutPayInstrument,
  pickDefaultCheckoutPayInstrument,
  toRazorpayCheckoutMethod,
  FALLBACK_PAY_METHODS,
} from "./razorpayPaymentMethods";

describe("open checkout default", () => {
  it("defaults to UPI, Cards & more", () => {
    const d = pickDefaultCheckoutPayInstrument(FALLBACK_PAY_METHODS.sections);
    assert.equal(d.id, "open:all");
    assert.equal(d.label, "UPI, Cards & more");
    assert.equal(isOpenCheckoutPayInstrument(d), true);
    assert.equal(toRazorpayCheckoutMethod(d), null);
  });

  it("locks PhonePe / QR when explicitly selected", () => {
    const phonepe = toRazorpayCheckoutMethod({
      id: "upi:phonepe",
      label: "PhonePe UPI",
      method: "upi",
      action: "pay",
      logoKey: "phonepe",
      upiApp: "phonepe",
      upiFlow: "intent",
    });
    assert.deepEqual(phonepe, { method: "upi", upiApp: "phonepe", upiFlow: "intent" });

    const qr = toRazorpayCheckoutMethod({
      id: "upi:qr",
      label: "Scan QR Code",
      method: "upi",
      action: "pay",
      logoKey: "qr",
      upiFlow: "qr",
    });
    assert.deepEqual(qr, { method: "upi", upiFlow: "qr" });
  });

  it("pins open checkout + UPI flows in the payment sheet", () => {
    const catalog = ensureUpiQrAndCollectVisible(FALLBACK_PAY_METHODS);
    assert.equal(catalog.sections[0]?.id, "open_checkout");
    assert.equal(catalog.sections[0]?.items[0]?.id, DEFAULT_PAY_INSTRUMENT.id);
    const ids = catalog.sections.flatMap((s) => s.items.map((i) => i.id));
    assert.ok(ids.includes("upi:qr"));
    assert.ok(ids.includes("upi:intent"));
    assert.ok(ids.includes("upi:phonepe"));
  });
});
