import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushTokenString } from "@gatimitra/contracts";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function channelIdForRecipient(
  role: string,
  priority?: string,
  opts?: { liveService?: string; templateCode?: string; metadataType?: string },
): string {
  if (role === "merchant") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (code === "MERCHANT_NEW_ORDER" || metaType === "merchant_new_order") {
      return "merchant_new_orders_alert";
    }
    if (priority === "critical" || priority === "high") return "merchant_new_orders";
    return "merchant_default";
  }
  if (role === "rider") return "default";
  const live = String(opts?.liveService ?? "").toLowerCase();
  const code = String(opts?.templateCode ?? "").toUpperCase();
  if (live === "ride" || code.startsWith("RIDE_")) return "customer_ride_cx";
  return "customer_default";
}

function soundForRecipient(
  role: string,
  opts?: { liveService?: string; templateCode?: string; metadataType?: string },
): string {
  if (role === "customer") {
    const live = String(opts?.liveService ?? "").toLowerCase();
    const code = String(opts?.templateCode ?? "").toUpperCase();
    if (live === "ride" || code.startsWith("RIDE_")) return "cx_notification.mp3";
  }
  if (role === "merchant") {
    const code = String(opts?.templateCode ?? "").toUpperCase();
    const metaType = String(opts?.metadataType ?? "").toLowerCase();
    if (code === "MERCHANT_NEW_ORDER" || metaType === "merchant_new_order") {
      return "notification";
    }
  }
  return "default";
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
    assert.equal(
      channelIdForRecipient("merchant", "critical", { templateCode: "MERCHANT_NEW_ORDER" }),
      "merchant_new_orders_alert",
    );
  });

  it("uses bundled alert sound for merchant new orders", () => {
    assert.equal(
      soundForRecipient("merchant", { templateCode: "MERCHANT_NEW_ORDER" }),
      "notification",
    );
    assert.equal(soundForRecipient("merchant"), "default");
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
