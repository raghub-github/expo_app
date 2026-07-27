import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushTokenString } from "@gatimitra/contracts";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function channelIdForRecipient(
  role: string,
  priority?: string,
  opts?: { liveService?: string; templateCode?: string },
): string {
  if (role === "merchant") {
    if (priority === "critical" || priority === "high") return "merchant_new_orders";
    return "merchant_default";
  }
  if (role === "rider") return "default";
  const live = String(opts?.liveService ?? "").toLowerCase();
  const code = String(opts?.templateCode ?? "").toUpperCase();
  if (live === "ride" || code.startsWith("RIDE_")) return "customer_ride_cx";
  return "customer_default";
}

describe("super admin push delivery helpers", () => {
  it("accepts both Expo token prefixes", () => {
    assert.equal(isExpoDeviceToken("ExponentPushToken[abc]"), true);
    assert.equal(isExpoDeviceToken("ExpoPushToken[abc]"), true);
    assert.equal(isExpoDeviceToken("fcm-native-token"), false);
  });

  it("picks merchant android channel", () => {
    assert.equal(channelIdForRecipient("merchant"), "merchant_default");
    assert.equal(channelIdForRecipient("merchant", "critical"), "merchant_new_orders");
  });

  it("routes customer ride pushes to CX sound channel", () => {
    assert.equal(
      channelIdForRecipient("customer", undefined, { liveService: "ride" }),
      "customer_ride_cx",
    );
    assert.equal(
      channelIdForRecipient("customer", undefined, { templateCode: "RIDE_RIDER_NEARBY" }),
      "customer_ride_cx",
    );
    assert.equal(channelIdForRecipient("customer"), "customer_default");
  });
});
