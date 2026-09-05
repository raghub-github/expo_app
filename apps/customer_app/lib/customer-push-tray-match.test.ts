import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCustomerOrderLifecyclePushData,
  orderIdsFromNotificationPayload,
  presentedNotificationMatchesActiveOrder,
  shouldReplayHistoricalPushOnStartup,
} from "./customer-push-tray-match";

test("startup/resume never replays historical pushes", () => {
  assert.equal(shouldReplayHistoricalPushOnStartup(), false);
});

test("matches FCM tray rows by uuid, GMF id, or /orders deep link", () => {
  const active = ["core-uuid-1", "GMF100029"];
  assert.equal(
    presentedNotificationMatchesActiveOrder(
      { identifier: "expo-random", data: { orderId: "core-uuid-1", gmType: "ORDER_ACCEPTED" } },
      active
    ),
    true
  );
  assert.equal(
    presentedNotificationMatchesActiveOrder(
      { identifier: "expo-random", data: { orderId: "GMF100029", gmType: "ORDER_RIDER_ASSIGNED" } },
      active
    ),
    true
  );
  assert.equal(
    presentedNotificationMatchesActiveOrder(
      { identifier: "expo-random", data: { deepLink: "/orders/GMF100029" } },
      active
    ),
    true
  );
  assert.equal(
    presentedNotificationMatchesActiveOrder(
      { identifier: "customer-live-order-core-uuid-1", data: {} },
      active
    ),
    true
  );
  assert.equal(
    presentedNotificationMatchesActiveOrder(
      { identifier: "expo-random", data: { orderId: "other-order", gmType: "ORDER_ACCEPTED" } },
      active
    ),
    false
  );
});

test("order ids are extracted from sticky identifier and payload aliases", () => {
  assert.deepEqual(
    orderIdsFromNotificationPayload({
      identifier: "customer-live-order-abc",
      data: { orderId: "abc", formattedOrderId: "GMF1", deepLink: "/orders/GMF1" },
    }),
    ["abc", "GMF1"]
  );
});

test("lifecycle push data includes ORDER_ templates even without gmLiveProgress", () => {
  assert.equal(isCustomerOrderLifecyclePushData({ gmType: "ORDER_ACCEPTED" }), true);
  assert.equal(isCustomerOrderLifecyclePushData({ template_code: "ORDER_RIDER_ASSIGNED" }), true);
  assert.equal(isCustomerOrderLifecyclePushData({ gmType: "CUSTOMER_ANNOUNCEMENT" }), false);
});
