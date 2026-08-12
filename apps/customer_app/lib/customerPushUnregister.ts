/**
 * Module singleton so authStore can unregister push tokens on logout / account switch.
 */
import type { UnregisterPushOptions } from "@gatimitra/expo-push-kit";

type UnregisterFn = (opts?: UnregisterPushOptions) => Promise<void>;

let unregisterFn: UnregisterFn | null = null;

export function setCustomerPushUnregister(fn: UnregisterFn | null): void {
  unregisterFn = fn;
}

export async function runCustomerPushUnregister(accessToken?: string | null): Promise<void> {
  if (!unregisterFn) return;
  try {
    await unregisterFn(accessToken?.trim() ? { accessToken: accessToken.trim() } : undefined);
  } catch {
    /* best-effort */
  }
}
