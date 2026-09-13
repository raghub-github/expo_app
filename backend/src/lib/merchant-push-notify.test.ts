import { test } from "node:test";
import assert from "node:assert/strict";
import { selectMerchantPushDelivery } from "./merchant-push-notify.js";

const EXPO_A = "ExponentPushToken[AAAA]";
const EXPO_B = "ExponentPushToken[BBBB]";
const FCM_A = "fcm-native-token-aaaa";
const FCM_B = "fcm-native-token-bbbb";

test("dual-token device: native FCM present → Expo dropped (no double-notify)", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A],
    nativeFcmTokens: [FCM_A],
  });
  assert.deepEqual(expoTokens, []); // would otherwise deliver the SAME push twice
  assert.deepEqual(nativeTokens, [FCM_A]);
});

test("Expo-only store (no native token): Expo push still sent", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A, EXPO_B],
    nativeFcmTokens: [],
  });
  assert.deepEqual(expoTokens, [EXPO_A, EXPO_B]);
  assert.deepEqual(nativeTokens, []);
});

test("native-only store: only native FCM sent", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [],
    nativeFcmTokens: [FCM_A, FCM_B],
  });
  assert.deepEqual(expoTokens, []);
  assert.deepEqual(nativeTokens, [FCM_A, FCM_B]);
});

test("stray non-Expo token in the Expo list is treated as native, not Expo", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A, FCM_A],
    nativeFcmTokens: [FCM_B],
  });
  assert.deepEqual(expoTokens, []); // native present → Expo dropped
  assert.deepEqual([...nativeTokens].sort(), [FCM_A, FCM_B].sort());
});

test("native tokens are de-duplicated across both sources", () => {
  const { nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [FCM_A],
    nativeFcmTokens: [FCM_A, FCM_A, FCM_B],
  });
  assert.deepEqual([...nativeTokens].sort(), [FCM_A, FCM_B].sort());
});

test("skipNative → Expo only (caller already fans out native elsewhere)", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A],
    nativeFcmTokens: [FCM_A],
    skipNative: true,
  });
  assert.deepEqual(expoTokens, [EXPO_A]);
  assert.deepEqual(nativeTokens, []);
});

test("skipExpo → native only even without native prefer rule", () => {
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A],
    nativeFcmTokens: [FCM_A],
    skipExpo: true,
  });
  assert.deepEqual(expoTokens, []);
  assert.deepEqual(nativeTokens, [FCM_A]);
});

test("empty everything → no delivery, no throw", () => {
  const r = selectMerchantPushDelivery({ expoCandidateTokens: [], nativeFcmTokens: [] });
  assert.deepEqual(r, { expoTokens: [], nativeTokens: [] });
});

test("web/partnersite FCM must not be treated as app native (regression guard)", () => {
  // Dual-token preference drops Expo whenever *any* native token exists.
  // If partnersite web FCM tokens leak into nativeFcmTokens, phone Expo pushes
  // are black-holed. getMerchantStoreNativeFcmTokens now excludes web/browser/
  // partnersite/dashboard — this test locks the delivery selector contract:
  // only real app FCM tokens may suppress Expo.
  const { expoTokens, nativeTokens } = selectMerchantPushDelivery({
    expoCandidateTokens: [EXPO_A],
    nativeFcmTokens: [], // correctly filtered empty when only web tokens exist
  });
  assert.deepEqual(expoTokens, [EXPO_A]);
  assert.deepEqual(nativeTokens, []);
});
