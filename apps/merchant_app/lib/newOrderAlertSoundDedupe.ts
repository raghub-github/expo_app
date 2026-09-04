/**
 * Shared window so FCM foreground handler + IncomingOrderModal do not double-chime
 * the same order when both paths fire.
 */
const DEDUPE_WINDOW_MS = 12_000;
const recent = new Map<string, number>();

function prune(now: number): void {
  for (const [k, at] of recent) {
    if (now - at > DEDUPE_WINDOW_MS) recent.delete(k);
  }
}

/** Returns true once per order key within the window — caller should play the alert. */
export function claimNewOrderAlertSound(orderKey: string): boolean {
  const key = String(orderKey || "").trim() || "new_order";
  const now = Date.now();
  prune(now);
  const last = recent.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return false;
  recent.set(key, now);
  return true;
}
