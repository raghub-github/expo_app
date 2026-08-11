/**
 * Module singleton so AuthContext can unregister push tokens on logout
 * without importing NotificationSetup (avoids circular deps).
 */
import type { UnregisterPushOptions } from "@gatimitra/expo-push-kit";

type UnregisterFn = (opts?: UnregisterPushOptions) => Promise<void>;

let unregisterFn: UnregisterFn | null = null;

export function setMerchantPushUnregister(fn: UnregisterFn | null): void {
  unregisterFn = fn;
}

export async function runMerchantPushUnregister(accessToken?: string | null): Promise<void> {
  if (!unregisterFn) return;
  try {
    await unregisterFn(accessToken?.trim() ? { accessToken: accessToken.trim() } : undefined);
  } catch {
    /* best-effort */
  }
}
