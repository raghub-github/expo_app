import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTerminalPushDeliveryError } from "../push/purgeInvalidPushTokens.js";
import { DEFAULT_RETRY_DELAYS_SEC, planRetryDecision } from "./retryEngine.js";
import {
  dedupeNativeTokensForDispatch,
  expandCustomerPushUserIds,
  shouldKeepPushRecipient,
  tokenRetiredOnRegister,
  type NativeTokenCandidate,
} from "./customerPushTokens.js";

function row(
  token: string,
  extra: Partial<NativeTokenCandidate> = {},
): NativeTokenCandidate {
  return {
    user_id: "GM100386",
    role: "customer",
    platform: "android",
    native_token: token,
    source: "app",
    last_seen_at: "2026-10-01T00:00:00.000Z",
    ...extra,
  };
}

describe("customer push token selection", () => {
  it("keeps a valid token for dispatch", () => {
    const selected = dedupeNativeTokensForDispatch([row("fcm-current")]);
    assert.deepEqual(selected.map((r) => r.native_token), ["fcm-current"]);
  });

  it("refreshed registration retires only the previous token", () => {
    const existing = ["fcm-old", "fcm-other-phone"];
    assert.equal(tokenRetiredOnRegister(existing, "fcm-new", "fcm-old"), "fcm-old");
    assert.equal(tokenRetiredOnRegister(existing, "fcm-new", "fcm-other-phone"), "fcm-other-phone");
    assert.equal(tokenRetiredOnRegister(existing, "fcm-new", null), null);
    assert.equal(tokenRetiredOnRegister(existing, "fcm-same", "fcm-same"), null);
    const kept = existing.filter((t) => t !== tokenRetiredOnRegister(existing, "fcm-new", "fcm-old"));
    assert.deepEqual(kept, ["fcm-other-phone"]);
  });

  it("duplicate token strings dispatch once, newest last_seen wins", () => {
    const selected = dedupeNativeTokensForDispatch([
      row("fcm-a", { last_seen_at: "2026-10-01T00:00:00.000Z", device_model: "Pixel" }),
      row("fcm-a", { last_seen_at: "2026-10-02T00:00:00.000Z", device_model: "Pixel" }),
    ]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.last_seen_at, "2026-10-02T00:00:00.000Z");
  });

  it("one invalid token does not remove the other device", () => {
    const devices = dedupeNativeTokensForDispatch([
      row("fcm-dead", { device_model: null }),
      row("fcm-live", { device_model: null, user_id: "GM100386" }),
    ]);
    const rejected = new Set(
      devices
        .filter((d) => isTerminalPushDeliveryError("messaging/registration-token-not-registered", ""))
        .filter((d) => d.native_token === "fcm-dead")
        .map((d) => d.native_token),
    );
    const remaining = devices.filter((d) => !rejected.has(d.native_token));
    assert.deepEqual(remaining.map((d) => d.native_token), ["fcm-live"]);
  });

  it("two devices stay independent even with the same model or no model", () => {
    const selected = dedupeNativeTokensForDispatch([
      row("fcm-phone", { device_model: "Pixel 7" }),
      row("fcm-tablet", { device_model: "Pixel 7", last_seen_at: "2026-09-01T00:00:00.000Z" }),
      row("fcm-old-phone", { device_model: null, user_id: "386" }),
    ]);
    assert.deepEqual(
      selected.map((r) => r.native_token).sort(),
      ["fcm-old-phone", "fcm-phone", "fcm-tablet"],
    );
  });

  it("customer id aliases include GM and numeric pk, not another role prefix", () => {
    const ids = expandCustomerPushUserIds(["GM100386", "GMR12"]);
    assert.ok(ids.includes("GM100386"));
    assert.ok(ids.includes("386"));
    assert.ok(ids.includes("GMR12"));
    assert.equal(ids.includes("GM100012"), false);
    const fromPk = expandCustomerPushUserIds(["386"]);
    assert.ok(fromPk.includes("GM100386"));
  });

  it("android FCM suppresses that user's android Expo token and keeps iOS", () => {
    assert.equal(
      shouldKeepPushRecipient({
        platform: "android",
        isExpoToken: true,
        sameUserHasAndroidFcm: true,
        firebaseConfigured: true,
      }),
      false,
    );
    assert.equal(
      shouldKeepPushRecipient({
        platform: "ios",
        isExpoToken: true,
        sameUserHasAndroidFcm: true,
        firebaseConfigured: true,
      }),
      true,
    );
    assert.equal(
      shouldKeepPushRecipient({
        platform: "android",
        isExpoToken: false,
        sameUserHasAndroidFcm: true,
        firebaseConfigured: true,
      }),
      true,
    );
  });
});

describe("customer push retry policy", () => {
  it("retries a temporary provider failure on the bounded schedule", () => {
    const first = planRetryDecision({
      terminal: false,
      currentAttempts: 0,
      maxRetries: DEFAULT_RETRY_DELAYS_SEC.length,
      delays: [...DEFAULT_RETRY_DELAYS_SEC],
    });
    assert.equal(first.scheduled, true);
    assert.equal(first.delaySec, 30);
    assert.equal(first.attempt, 1);
  });

  it("does not retry a permanently invalid token", () => {
    assert.equal(
      isTerminalPushDeliveryError("messaging/registration-token-not-registered", "unregistered"),
      true,
    );
    assert.equal(isTerminalPushDeliveryError("InvalidCredentials", "fcm server key"), false);
    const dead = planRetryDecision({
      terminal: true,
      currentAttempts: 0,
      maxRetries: 4,
      delays: [...DEFAULT_RETRY_DELAYS_SEC],
    });
    assert.equal(dead.scheduled, false);
    const exhausted = planRetryDecision({
      terminal: false,
      currentAttempts: 4,
      maxRetries: 4,
      delays: [...DEFAULT_RETRY_DELAYS_SEC],
    });
    assert.equal(exhausted.scheduled, false);
  });
});
