import * as SecureStore from "expo-secure-store";

const KEY = "gmt_merchant_device_id";

/**
 * Stable per-install device id for merchant API + JWT. Required for session rows and retries.
 */
export async function getOrCreateMerchantDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing) return existing;
  } catch {
    // SecureStore can fail on web or in rare cases — still return a stable-enough id for the session.
  }
  const id = `merchant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    await SecureStore.setItemAsync(KEY, id);
  } catch {
    // no-op
  }
  return id;
}
