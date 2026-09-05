import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerOrderNotificationEventKey,
  extractCustomerOrderRefFromIntent,
  keepCustomerOrderNotificationClaim,
  normalizeCustomerOrderNotificationEventType,
  shouldClaimCustomerOrderNotification,
} from "./customer-order-notification-events.js";

describe("customer order notification event types", () => {
  it("collapses confirmed / preparing into one ORDER_ACCEPTED event", () => {
    assert.equal(normalizeCustomerOrderNotificationEventType("ACCEPTED"), "ORDER_ACCEPTED");
    assert.equal(normalizeCustomerOrderNotificationEventType("ORDER_CONFIRMED"), "ORDER_ACCEPTED");
    assert.equal(normalizeCustomerOrderNotificationEventType("PREPARING"), "ORDER_ACCEPTED");
    assert.equal(normalizeCustomerOrderNotificationEventType("ORDER_PREPARING"), "ORDER_ACCEPTED");
  });

  it("keeps rider-assigned and ready-for-pickup as distinct events", () => {
    assert.equal(
      normalizeCustomerOrderNotificationEventType("RIDER_ASSIGNED"),
      "ORDER_RIDER_ASSIGNED"
    );
    assert.equal(
      normalizeCustomerOrderNotificationEventType("READY_FOR_PICKUP"),
      "ORDER_FOOD_READY"
    );
    assert.notEqual(
      normalizeCustomerOrderNotificationEventType("RIDER_ASSIGNED"),
      normalizeCustomerOrderNotificationEventType("READY_FOR_PICKUP")
    );
  });

  it("maps picked-up / out-for-delivery / delivered aliases", () => {
    assert.equal(normalizeCustomerOrderNotificationEventType("PICKED_UP"), "ORDER_OUT_FOR_DELIVERY");
    assert.equal(
      normalizeCustomerOrderNotificationEventType("OUT_FOR_DELIVERY"),
      "ORDER_OUT_FOR_DELIVERY"
    );
    assert.equal(normalizeCustomerOrderNotificationEventType("COMPLETED"), "ORDER_DELIVERED");
    assert.equal(normalizeCustomerOrderNotificationEventType("DELIVERED"), "ORDER_DELIVERED");
  });

  it("collapses cancel templates to one event", () => {
    assert.equal(
      normalizeCustomerOrderNotificationEventType("ORDER_CANCELLED_REFUND_ELIGIBLE"),
      "ORDER_CANCELLED"
    );
    assert.equal(
      normalizeCustomerOrderNotificationEventType("ORDER_CANCELLED_NO_REFUND"),
      "ORDER_CANCELLED"
    );
  });

  it("builds a deterministic order_id:event_type key", () => {
    assert.equal(
      customerOrderNotificationEventKey("abc-123", "ORDER_ACCEPTED"),
      "abc-123:ORDER_ACCEPTED"
    );
  });

  it("claims food/ride/parcel lifecycle templates and skips prep-delay", () => {
    assert.equal(shouldClaimCustomerOrderNotification("ORDER_ACCEPTED"), true);
    assert.equal(shouldClaimCustomerOrderNotification("ORDER_RIDER_ASSIGNED"), true);
    assert.equal(shouldClaimCustomerOrderNotification("RIDE_TRIP_STARTED"), true);
    assert.equal(shouldClaimCustomerOrderNotification("PARCEL_DELIVERED"), true);
    assert.equal(shouldClaimCustomerOrderNotification("ORDER_PREP_DELAY"), false);
    assert.equal(shouldClaimCustomerOrderNotification("CUSTOMER_ANNOUNCEMENT"), false);
  });

  it("reads order id from metadata or variables", () => {
    assert.equal(
      extractCustomerOrderRefFromIntent({
        metadata: { orderId: "GMF100029" },
        variables: { orderId: "uuid-1" },
      }),
      "GMF100029"
    );
    assert.equal(
      extractCustomerOrderRefFromIntent({
        variables: { orderShortId: "GMF100029" },
      }),
      "GMF100029"
    );
    assert.equal(extractCustomerOrderRefFromIntent({ metadata: {} }), null);
  });

  it("releases the claim when nothing was queued (quiet hours / no recipients)", () => {
    assert.equal(
      keepCustomerOrderNotificationClaim({
        queued: 0,
        failedSync: 0,
        skipReason: "quiet_hours",
      }),
      false
    );
    assert.equal(
      keepCustomerOrderNotificationClaim({
        queued: 0,
        failedSync: 0,
        skipReason: "no_recipients",
      }),
      false
    );
    assert.equal(
      keepCustomerOrderNotificationClaim({ queued: 1, failedSync: 0 }),
      true
    );
    assert.equal(
      keepCustomerOrderNotificationClaim({ queued: 0, failedSync: 2 }),
      false
    );
    assert.equal(
      keepCustomerOrderNotificationClaim({ queued: 0, failedSync: 0 }),
      true
    );
  });
});

describe("in-memory claim lock (simulates UNIQUE order_id, event_type)", () => {
  it("lets only the first concurrent worker send", () => {
    const slots = new Set<string>();
    const claim = (orderId: string, eventType: string) => {
      const key = `${orderId}:${eventType}`;
      if (slots.has(key)) return false;
      slots.add(key);
      return true;
    };
    const event = normalizeCustomerOrderNotificationEventType("ACCEPTED");
    assert.equal(claim("ord-1", event), true);
    assert.equal(claim("ord-1", event), false);
    assert.equal(claim("ord-1", normalizeCustomerOrderNotificationEventType("PREPARING")), false);
    assert.equal(
      claim("ord-1", normalizeCustomerOrderNotificationEventType("RIDER_ASSIGNED")),
      true
    );
    assert.equal(claim("ord-2", event), true);
  });
});
