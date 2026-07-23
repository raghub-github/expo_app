import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushTokenString } from "@gatimitra/contracts";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function channelIdForRecipient(role: string): string {
  if (role === "merchant") return "merchant_default";
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
    assert.equal(channelIdForRecipient("customer"), "default");
  });
});
