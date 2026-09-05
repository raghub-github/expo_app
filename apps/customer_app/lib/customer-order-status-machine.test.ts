import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
} from "./customer-order-status-display";
import {
  collectOrderAliases,
  isCustomerOrderCompletionPush,
  isCustomerOrderStatusEventType,
  orderRefsMatch,
  selectAuthoritativeCustomerStatus,
  statusFromCustomerLifecyclePush,
} from "./customer-order-status-machine";

test("normalizeCustomerOrderStatus maps COMPLETED to DELIVERED", () => {
  assert.equal(normalizeCustomerOrderStatus("COMPLETED"), "DELIVERED");
  assert.equal(normalizeCustomerOrderStatus("completed"), "DELIVERED");
  assert.equal(normalizeCustomerOrderStatus("DELIVERED"), "DELIVERED");
});

test("COMPLETED is a terminal customer status", () => {
  assert.equal(isTerminalOrderStatus("COMPLETED"), true);
  assert.equal(isTerminalOrderStatus("DELIVERED"), true);
  assert.equal(isTerminalOrderStatus("RTO"), true);
  assert.equal(isTerminalOrderStatus("OUT_FOR_DELIVERY"), false);
});

test("terminal COMPLETED cannot regress to OUT_FOR_DELIVERY", () => {
  assert.equal(
    selectAuthoritativeCustomerStatus("COMPLETED", "OUT_FOR_DELIVERY"),
    "DELIVERED"
  );
  assert.equal(
    selectAuthoritativeCustomerStatus("DELIVERED", "REACHED_CUSTOMER"),
    "DELIVERED"
  );
  assert.equal(
    selectAuthoritativeCustomerStatus("OUT_FOR_DELIVERY", "DELIVERED"),
    "DELIVERED"
  );
});

test("stale earlier HTTP status cannot overwrite a newer in-progress status", () => {
  assert.equal(
    selectAuthoritativeCustomerStatus("OUT_FOR_DELIVERY", "CONFIRMED"),
    "OUT_FOR_DELIVERY"
  );
  assert.equal(
    selectAuthoritativeCustomerStatus("OUT_FOR_DELIVERY", "ORDER_PLACED"),
    "OUT_FOR_DELIVERY"
  );
  assert.equal(
    selectAuthoritativeCustomerStatus("PREPARING", "ACCEPTED"),
    "PREPARING"
  );
});

test("duplicate COMPLETED events stay idempotent", () => {
  const once = selectAuthoritativeCustomerStatus("OUT_FOR_DELIVERY", "COMPLETED");
  const twice = selectAuthoritativeCustomerStatus(once, "DELIVERED");
  const third = selectAuthoritativeCustomerStatus(twice, "COMPLETED");
  assert.equal(once, "DELIVERED");
  assert.equal(twice, "DELIVERED");
  assert.equal(third, "DELIVERED");
});

test("orderRefsMatch treats formatted and canonical ids as the same order", () => {
  assert.equal(
    orderRefsMatch(
      { orderId: "abc-uuid", formattedOrderId: "GMF100029" },
      "GMF100029"
    ),
    true
  );
  assert.equal(
    orderRefsMatch({ orderId: "GMF100029" }, { orderId: "abc-uuid", formattedOrderId: "GMF100029" }),
    true
  );
  assert.equal(orderRefsMatch("GMF1", "GMF2"), false);
});

test("collectOrderAliases de-dupes case variants", () => {
  assert.deepEqual(collectOrderAliases("gmf100029", "GMF100029", "", null), ["gmf100029"]);
});

test("WS status event aliases include order_status_changed", () => {
  assert.equal(isCustomerOrderStatusEventType("status_changed"), true);
  assert.equal(isCustomerOrderStatusEventType("order_status_changed"), true);
  assert.equal(isCustomerOrderStatusEventType("order.status_changed"), true);
  assert.equal(isCustomerOrderStatusEventType("rider.location.updated.v1"), false);
});

test("ORDER_DELIVERED push maps to DELIVERED without trusting local state", () => {
  assert.equal(
    statusFromCustomerLifecyclePush({ gmType: "ORDER_DELIVERED", orderId: "GMF1" }),
    "DELIVERED"
  );
  assert.equal(isCustomerOrderCompletionPush({ gmType: "RIDE_COMPLETED" }), true);
  assert.equal(statusFromCustomerLifecyclePush({ gmType: "ORDER_PREPARING" }), null);
});
