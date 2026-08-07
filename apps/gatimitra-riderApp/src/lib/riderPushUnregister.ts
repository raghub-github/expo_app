/**
 * Module singleton so RiderLogoutSheetHost can unregister push on logout.
 */
type UnregisterFn = () => Promise<void>;

let unregisterFn: UnregisterFn | null = null;

export function setRiderPushUnregister(fn: UnregisterFn | null): void {
  unregisterFn = fn;
}

export async function runRiderPushUnregister(): Promise<void> {
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
