/**
 * Module singleton so RiderLogoutSheetHost can unregister push on logout.
 */
import type { UnregisterPushOptions } from "@gatimitra/expo-push-kit";

type UnregisterFn = (opts?: UnregisterPushOptions) => Promise<void>;

let unregisterFn: UnregisterFn | null = null;

export function setRiderPushUnregister(fn: UnregisterFn | null): void {
  unregisterFn = fn;
}

export async function runRiderPushUnregister(accessToken?: string | null): Promise<void> {
  if (!unregisterFn) return;
  try {
    await unregisterFn(accessToken?.trim() ? { accessToken: accessToken.trim() } : undefined);
  } catch {
    /* best-effort */
  }
}
