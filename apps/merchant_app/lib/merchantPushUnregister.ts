/**
 * Module singleton so AuthContext can unregister push tokens on logout
 * without importing NotificationSetup (avoids circular deps).
 */
type UnregisterFn = () => Promise<void>;

let unregisterFn: UnregisterFn | null = null;

export function setMerchantPushUnregister(fn: UnregisterFn | null): void {
  unregisterFn = fn;
}

export async function runMerchantPushUnregister(): Promise<void> {
  if (!unregisterFn) return;
  try {
    await Promise.race([
      unregisterFn(),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* best-effort */
  }
}
