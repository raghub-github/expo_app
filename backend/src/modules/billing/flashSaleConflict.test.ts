import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFlashSaleInsertConflict } from "./flashSale.js";

describe("classifyFlashSaleInsertConflict", () => {
  it("treats store-scoped unique as already_redeemed", () => {
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_customer_store_offer_active_uidx"'
      ),
      "already_redeemed"
    );
  });

  it("treats nostore unique as already_redeemed", () => {
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_customer_offer_nostore_active_uidx"'
      ),
      "already_redeemed"
    );
  });

  it("treats order/idempotency unique as idempotent", () => {
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_idempotency_uidx"'
      ),
      "idempotent"
    );
  });
});
