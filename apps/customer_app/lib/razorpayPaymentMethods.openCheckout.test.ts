import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PAY_INSTRUMENT,
  ensureUpiQrAndCollectVisible,
  isOpenCheckoutPayInstrument,
  isPayableCheckoutPaymentMethod,
  orderPayloadPaymentMethod,
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

  it("treats granular PhonePe / QR modes as payable", () => {
    assert.equal(isPayableCheckoutPaymentMethod("upi"), true);
    assert.equal(
      isPayableCheckoutPaymentMethod(
        orderPayloadPaymentMethod({
          id: "upi:phonepe",
          label: "PhonePe UPI",
          method: "upi",
          action: "pay",
          logoKey: "phonepe",
          upiApp: "phonepe",
        })
      ),
      true
    );
    assert.equal(isPayableCheckoutPaymentMethod("upi_qr"), true);
    assert.equal(isPayableCheckoutPaymentMethod("cod"), false);
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

  it("does not invent UPI rows for a live cards-only Razorpay catalog", () => {
    const catalog = ensureUpiQrAndCollectVisible({
      dummy: false,
      sections: [
        {
          id: "cards",
          title: "CARDS",
          items: [
            {
              id: "card:add",
              label: "Add credit or debit cards",
              method: "card",
              action: "add",
              logoKey: "card",
            },
          ],
        },
      ],
    });
    const ids = catalog.sections.flatMap((s) => s.items.map((i) => i.id));
    assert.ok(ids.includes("open:all"));
    assert.ok(ids.includes("card:add"));
    assert.equal(ids.includes("upi:qr"), false);
    assert.equal(ids.includes("upi:phonepe"), false);
  });
});
