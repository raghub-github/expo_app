import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desiredFcmTopics, topicDiff } from "./topicReconcile.js";
import { isExpoPushTokenString } from "@gatimitra/contracts";

describe("desiredFcmTopics", () => {
  it("returns role topic for customer/rider", () => {
    assert.deepEqual(desiredFcmTopics({ role: "customer" }), ["app_customer"]);
    assert.deepEqual(desiredFcmTopics({ role: "rider" }), ["app_rider"]);
  });

  it("includes merchant store topic when storeId present", () => {
    assert.deepEqual(desiredFcmTopics({ role: "merchant", storeId: 9 }), [
      "app_merchant",
      "merchant_store_9",
    ]);
  });

  it("omits store topic without storeId", () => {
    assert.deepEqual(desiredFcmTopics({ role: "merchant" }), ["app_merchant"]);
  });
});

describe("topicDiff", () => {
  it("computes subscribe and unsubscribe sets", () => {
    const diff = topicDiff(["app_merchant", "merchant_store_1"], ["app_merchant", "merchant_store_2"]);
    assert.deepEqual(diff.unsubscribe, ["merchant_store_1"]);
    assert.deepEqual(diff.subscribe, ["merchant_store_2"]);
  });
});

describe("expo token guard", () => {
  it("detects Expo push token strings", () => {
    assert.equal(isExpoPushTokenString("ExponentPushToken[xxx]"), true);
    assert.equal(isExpoPushTokenString("fcm-device-token-abc"), false);
  });
});
