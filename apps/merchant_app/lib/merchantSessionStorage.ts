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

/** Partner JSON cache — never proof of authentication, only a profile snapshot. */
export const MERCHANT_PARTNER_KEY = "gatimitra_merchant_partner";
export const MERCHANT_SUPABASE_USER_ID_KEY = "gatimitra_merchant_supabase_user_id";
export const MERCHANT_CACHED_EXPO_PUSH_TOKEN_KEY = "merchant_cached_expo_push_token_v1";

async function deleteKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

/**
 * Wipe every local credential that could restore an authenticated tree.
 * Does not remove the stable install device id (needed for the next login).
 */
export async function clearAllMerchantAuthArtifacts(): Promise<void> {
  const { clearLastSelectedStore, clearManagedStores } = await import("@/lib/selectedStoreStorage");
  try {
    const { removeStoreStatusNotification } = await import("@/lib/storeStatusNotification");
    await removeStoreStatusNotification("LOGOUT");
  } catch {
    /* tray dismiss is best-effort */
  }
  await Promise.all([
    clearMerchantSessionToken(),
    deleteKey(MERCHANT_PARTNER_KEY),
    deleteKey(MERCHANT_SUPABASE_USER_ID_KEY),
    deleteKey(MERCHANT_CACHED_EXPO_PUSH_TOKEN_KEY),
    clearLastSelectedStore(),
    clearManagedStores(),
  ]);
}
