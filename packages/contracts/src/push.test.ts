import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExpoPushTokenString,
  merchantStorePushTopic,
  rolePushTopic,
  PushRegisterBodySchema,
  PushUnregisterBodySchema,
} from "./push.js";

describe("push contracts", () => {
  it("accepts dual-token register body", () => {
    const parsed = PushRegisterBodySchema.safeParse({
      expo_push_token: "ExponentPushToken[abc]",
      device_type: "android",
      native_push_token: "native-fcm-token-value",
      native_token_type: "fcm",
      store_id: 12,
    });
    assert.equal(parsed.success, true);
  });

  it("accepts unregister body", () => {
    const parsed = PushUnregisterBodySchema.safeParse({
      expo_push_token: "ExponentPushToken[abc]",
      native_push_token: "native-fcm-token-value",
    });
    assert.equal(parsed.success, true);
  });

  it("builds role and store topics", () => {
    assert.equal(rolePushTopic("customer"), "app_customer");
    assert.equal(rolePushTopic("rider"), "app_rider");
    assert.equal(rolePushTopic("merchant"), "app_merchant");
    assert.equal(merchantStorePushTopic(7), "merchant_store_7");
  });

  it("guards Expo tokens from FCM topic APIs", () => {
    assert.equal(isExpoPushTokenString("ExponentPushToken[x]"), true);
  });
});
