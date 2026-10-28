import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForeignAppPush } from "./appAudience";

describe("isForeignAppPush", () => {
  it("allows legacy payloads without app role (order alerts)", () => {
    assert.equal(isForeignAppPush({}, "rider"), false);
    assert.equal(isForeignAppPush({ type: "merchant_new_order" }, "merchant"), false);
  });

  it("blocks customer campaigns on rider and merchant apps", () => {
    assert.equal(isForeignAppPush({ appRole: "customer" }, "rider"), true);
    assert.equal(isForeignAppPush({ target_app: "customer" }, "merchant"), true);
    assert.equal(isForeignAppPush({ appRole: "customer" }, "customer"), false);
  });

  it("does not treat unknown roles as foreign", () => {
    assert.equal(isForeignAppPush({ appRole: "all" }, "customer"), false);
    assert.equal(isForeignAppPush({ appRole: "admin" }, "customer"), false);
  });
});
