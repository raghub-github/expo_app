import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseOfferOrderNumericPk,
  seedOfferOrderKeys,
} from "./offerOrderKeys.js";
import { shouldRestoreFlashSaleRedemption } from "./flashSale.js";

describe("offer order matching", () => {
  it("does not treat GM / GMF public ids as orders_core.id", () => {
    assert.equal(parseOfferOrderNumericPk("GM100049"), null);
    assert.equal(parseOfferOrderNumericPk("GMF100049"), null);
    assert.equal(parseOfferOrderNumericPk("gm-100049"), null);
    assert.equal(parseOfferOrderNumericPk("100049"), 100049);
    assert.equal(parseOfferOrderNumericPk(49), 49);
  });

  it("keeps the public order id as text so flash ledgers can match", () => {
    const keys = seedOfferOrderKeys("GM100049");
    assert.deepEqual(keys.pks, []);
    assert.deepEqual(keys.texts, ["GM100049"]);
  });

  it("combines a core PK hint with the public order id", () => {
    const keys = seedOfferOrderKeys("GMF100049", 49);
    assert.deepEqual(keys.pks, [49]);
    assert.deepEqual(keys.texts, ["GMF100049"]);
  });
});

describe("Status Controls restore flags", () => {
  it("restores flash usage on cancel/refund when the toggles are on", () => {
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "cancelled",
        restoreOnCancel: true,
        restoreOnRefund: true,
      }),
      true
    );
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "refunded",
        restoreOnCancel: true,
        restoreOnRefund: true,
      }),
      true
    );
  });

  it("does not restore when the matching Status Control is off", () => {
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "cancelled",
        restoreOnCancel: false,
        restoreOnRefund: true,
      }),
      false
    );
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "refunded",
        restoreOnCancel: true,
        restoreOnRefund: false,
      }),
      false
    );
  });
});
