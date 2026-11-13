import assert from "node:assert/strict";
import test from "node:test";
import { partnerHasPermission } from "./staffPermissions";

test("partnerHasPermission denies when accessRole missing", () => {
  assert.equal(partnerHasPermission({ parent: {} } as never, "menu"), false);
  assert.equal(partnerHasPermission(null, "operations"), false);
});

test("partnerHasPermission respects STAFF matrix", () => {
  assert.equal(
    partnerHasPermission({ accessRole: "STAFF", permissions: ["operations"] }, "operations"),
    true
  );
  assert.equal(
    partnerHasPermission({ accessRole: "STAFF", permissions: ["operations"] }, "home"),
    true
  );
  assert.equal(
    partnerHasPermission({ accessRole: "STAFF", permissions: ["operations"] }, "menu"),
    false
  );
  assert.equal(
    partnerHasPermission({ accessRole: "STAFF", permissions: ["operations"] }, "payouts"),
    false
  );
});
