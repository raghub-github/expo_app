/** Synchronous gate: set on tab focus (capture) before React Query refetch handlers run. */
let pendingBackgroundRefreshCount = 0;

export function beginPartnerSessionBackgroundRefresh(): void {
  pendingBackgroundRefreshCount += 1;
}

export function endPartnerSessionBackgroundRefresh(): void {
  pendingBackgroundRefreshCount = Math.max(0, pendingBackgroundRefreshCount - 1);
}

export function isPartnerSessionBackgroundRefreshPending(): boolean {
  return pendingBackgroundRefreshCount > 0;
}

export async function waitForPartnerSessionBackgroundRefresh(maxMs = 8_000): Promise<void> {
  if (!isPartnerSessionBackgroundRefreshPending()) return;
  const deadline = Date.now() + maxMs;
  while (isPartnerSessionBackgroundRefreshPending()) {
    if (Date.now() >= deadline) return;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 40);
    });
  }
}
