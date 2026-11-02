import { riderDeviceKey, selectRiderPushDelivery } from "./rider-push-delivery.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const samsung = {
  deviceModel: "SM-A336E",
  deviceBrand: "samsung",
  osName: "Android",
  appVersion: "1.0.0",
};

describe("riderDeviceKey", () => {
  it("treats the same handset metadata as one device", () => {
    assert.equal(
      riderDeviceKey({ token: "a", ...samsung }),
      riderDeviceKey({ token: "b", ...samsung })
    );
  });

  it("keeps genuinely different handsets apart", () => {
    assert.notEqual(
      riderDeviceKey({ token: "a", ...samsung }),
      riderDeviceKey({ token: "b", ...samsung, deviceModel: "RMX3785" })
    );
  });

  it("never merges rows that carry no metadata at all", () => {
    // We must not guess that two unlabelled tokens are the same phone.
    assert.notEqual(riderDeviceKey({ token: "a" }), riderDeviceKey({ token: "b" }));
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(
      riderDeviceKey({ token: "a", deviceModel: " SM-A336E ", deviceBrand: "Samsung" }),
      riderDeviceKey({ token: "b", deviceModel: "sm-a336e", deviceBrand: "SAMSUNG" })
    );
  });
});

describe("selectRiderPushDelivery", () => {
  it("collapses the real production case: 4 tokens, 1 handset, 1 push", () => {
    // Rider 1028 (RMX3785) accumulated four live FCM tokens through rotation;
    // the sender looped over all four and rang the phone four times.
    const realme = { deviceModel: "RMX3785", deviceBrand: "realme", appVersion: "1.0.0" };
    const { nativeTokens } = selectRiderPushDelivery({
      nativeCandidates: [
        { token: "ekRRTMnTRlCMXa", ...realme, lastSeenMs: 1_000 },
        { token: "dBcMOz9sTEq5uy", ...realme, lastSeenMs: 2_000 },
        { token: "d544LgQOTluG6m", ...realme, lastSeenMs: 3_000 },
        { token: "eJK13ic_R46Fhs", ...realme, lastSeenMs: 4_000 },
      ],
      expoCandidates: [],
    });
    assert.deepEqual(nativeTokens, ["eJK13ic_R46Fhs"]);
  });

  it("keeps the freshest token regardless of input order", () => {
    const { nativeTokens } = selectRiderPushDelivery({
      nativeCandidates: [
        { token: "new", ...samsung, lastSeenMs: 9_000 },
        { token: "old", ...samsung, lastSeenMs: 1_000 },
      ],
      expoCandidates: [],
    });
    assert.deepEqual(nativeTokens, ["new"]);
  });

  it("prefers a seen token over one that was never seen", () => {
    const { nativeTokens } = selectRiderPushDelivery({
      nativeCandidates: [
        { token: "never", ...samsung, lastSeenMs: null },
        { token: "seen", ...samsung, lastSeenMs: 5 },
      ],
      expoCandidates: [],
    });
    assert.deepEqual(nativeTokens, ["seen"]);
  });

  it("still reaches two genuinely different handsets", () => {
    const { nativeTokens } = selectRiderPushDelivery({
      nativeCandidates: [
        { token: "a", ...samsung, lastSeenMs: 1 },
        { token: "b", ...samsung, deviceModel: "RMX3785", lastSeenMs: 1 },
      ],
      expoCandidates: [],
    });
    assert.equal(nativeTokens.length, 2);
  });

  it("drops Expo delivery entirely when a native token exists", () => {
    // Reaching the same handset through both transports is the other way a
    // single order rang twice.
    const { nativeTokens, expoTokens } = selectRiderPushDelivery({
      nativeCandidates: [{ token: "native", ...samsung, lastSeenMs: 1 }],
      expoCandidates: ["ExponentPushToken[abc]"],
    });
    assert.deepEqual(nativeTokens, ["native"]);
    assert.deepEqual(expoTokens, []);
  });

  it("falls back to Expo when there is no native token", () => {
    const { nativeTokens, expoTokens } = selectRiderPushDelivery({
      nativeCandidates: [],
      expoCandidates: ["ExponentPushToken[abc]", "ExponentPushToken[abc]"],
    });
    assert.deepEqual(nativeTokens, []);
    assert.deepEqual(expoTokens, ["ExponentPushToken[abc]"]);
  });

  it("never treats an Expo token as a native one", () => {
    const { nativeTokens } = selectRiderPushDelivery({
      nativeCandidates: [{ token: "ExponentPushToken[xyz]", ...samsung, lastSeenMs: 1 }],
      expoCandidates: [],
    });
    assert.deepEqual(nativeTokens, []);
  });

  it("ignores blank and whitespace-only tokens", () => {
    const { nativeTokens, expoTokens } = selectRiderPushDelivery({
      nativeCandidates: [{ token: "   ", ...samsung, lastSeenMs: 1 }],
      expoCandidates: ["  ", ""],
    });
    assert.deepEqual(nativeTokens, []);
    assert.deepEqual(expoTokens, []);
  });

  it("honours explicit skip flags", () => {
    const both = {
      nativeCandidates: [{ token: "native", ...samsung, lastSeenMs: 1 }],
      expoCandidates: ["ExponentPushToken[abc]"],
    };
    assert.deepEqual(selectRiderPushDelivery({ ...both, skipNative: true }).nativeTokens, []);
    // With native skipped, Expo becomes the only route and must still work.
    assert.deepEqual(selectRiderPushDelivery({ ...both, skipNative: true }).expoTokens, [
      "ExponentPushToken[abc]",
    ]);
    assert.deepEqual(selectRiderPushDelivery({ ...both, skipExpo: true }).expoTokens, []);
  });
});
