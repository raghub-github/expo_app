/**
 * Module singleton so permission onboarding can force token sync after Allow,
 * without importing RiderPushSetup (avoids circular deps).
 */
type RefreshFn = () => Promise<void>;

let refreshFn: RefreshFn | null = null;

export function setRiderPushRefresh(fn: RefreshFn | null): void {
  refreshFn = fn;
}

export async function runRiderPushRefresh(): Promise<void> {
  if (!refreshFn) return;
  try {
    await refreshFn();
  } catch {
    /* best-effort */
  }
}
