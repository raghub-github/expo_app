/**
 * Browser: localStorage.setItem('STORE_OPERATIONS_CLIENT_DEBUG', '1') then refresh.
 * Logs partner UI refetches of GET /api/store-operations (DevTools console).
 */
export function clientStoreOpsDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('STORE_OPERATIONS_CLIENT_DEBUG') === '1';
  } catch {
    return false;
  }
}

export function clientStoreOpsDebugLog(label: string, payload: unknown): void {
  if (!clientStoreOpsDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(`[store-ops client] ${label}`, payload);
}
