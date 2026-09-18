import { test } from "node:test";
import assert from "node:assert/strict";
import { hasValidMerchantIdentity, parsePartnerData } from "./merchantPartnerIdentity";

test("parsePartnerData requires parent id + parent_merchant_id", () => {
  assert.equal(parsePartnerData(null), null);
  assert.equal(parsePartnerData({}), null);
  assert.equal(parsePartnerData({ parent: { id: 1 } }), null);
  assert.equal(parsePartnerData({ parent: { id: 1, parent_merchant_id: "  " } }), null);

  const ok = parsePartnerData({
    parent: {
      id: 1,
      parent_merchant_id: "MP_1",
      parent_name: "A",
      owner_name: "B",
      registered_phone: "+911234567890",
    },
    childStores: [],
  });
  assert.ok(ok);
  assert.equal(ok!.parent.parent_merchant_id, "MP_1");
  assert.equal(hasValidMerchantIdentity(ok), true);
  assert.equal(hasValidMerchantIdentity(null), false);
});
