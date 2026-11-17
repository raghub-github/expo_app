import assert from "node:assert/strict";
import test from "node:test";
import {
  partnerCanEditMenuDetails,
  partnerCanManageMenuStock,
  partnerHasPermission,
} from "./staffPermissions";

test("partnerHasPermission denies when accessRole missing", () => {
  assert.equal(partnerHasPermission({ parent: {} } as never, "menu"), false);
  assert.equal(partnerHasPermission(null, "operations"), false);
});

test("partnerHasPermission respects STAFF matrix", () => {
  const staff = { accessRole: "STAFF", permissions: ["operations"] };
  assert.equal(partnerHasPermission(staff, "operations"), true);
  assert.equal(partnerHasPermission(staff, "home"), true);
  // Staff open Catalog (stock toggles only) — the role matrix wins over a stale permission list.
  assert.equal(partnerHasPermission(staff, "menu"), true);
  assert.equal(partnerHasPermission(staff, "payouts"), false);
});

test("staff can toggle stock but never edit menu details / photos", () => {
  const staff = { accessRole: "STAFF", permissions: ["operations"] };
  assert.equal(partnerCanManageMenuStock(staff), true);
  assert.equal(partnerCanEditMenuDetails(staff), false);

  const owner = { accessRole: "OWNER", permissions: [] };
  assert.equal(partnerCanManageMenuStock(owner), true);
  assert.equal(partnerCanEditMenuDetails(owner), true);

  assert.equal(partnerCanManageMenuStock(null), false);
  assert.equal(partnerCanEditMenuDetails(null), false);
});
