import * as SecureStore from "expo-secure-store";

export const MERCHANT_TOKEN_KEY = "gatimitra_merchant_access_token";
export const MERCHANT_EXPIRES_AT_KEY = "gatimitra_merchant_token_expires_at";

export async function readMerchantAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MERCHANT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function readMerchantTokenExpiresAt(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(MERCHANT_EXPIRES_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function writeMerchantSessionToken(token: string, expiresAt: number): Promise<void> {
  await SecureStore.setItemAsync(MERCHANT_TOKEN_KEY, token);
  await SecureStore.setItemAsync(MERCHANT_EXPIRES_AT_KEY, String(expiresAt));
}

export async function clearMerchantSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(MERCHANT_TOKEN_KEY);
  try {
    await SecureStore.deleteItemAsync(MERCHANT_EXPIRES_AT_KEY);
  } catch {
    /* ignore */
  }
}
