const RIDER_ACCEPT_WINDOW_SEC = 60;

export function riderAcceptDeadlineMs(order: {
  createdAt: string;
  acceptDeadlineAt?: string;
  /** When this rider first saw the offer — starts the 60s accept window. */
  offerShownAtMs?: number;
}): number {
  const offerStart =
    order.offerShownAtMs != null && Number.isFinite(order.offerShownAtMs)
      ? order.offerShownAtMs
      : new Date(order.createdAt).getTime();
  const riderWindowEnd = offerStart + RIDER_ACCEPT_WINDOW_SEC * 1000;

  if (order.acceptDeadlineAt) {
    const searchEnd = new Date(order.acceptDeadlineAt).getTime();
    if (Number.isFinite(searchEnd)) {
      return Math.min(riderWindowEnd, searchEnd);
    }
  }
  return riderWindowEnd;
}

export function riderAcceptSecondsLeft(order: {
  createdAt: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
}): number {
  const ms = riderAcceptDeadlineMs(order) - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatRiderAcceptCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function riderAcceptTimeProgress(order: {
  createdAt: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
}): number {
  const offerStart =
    order.offerShownAtMs != null && Number.isFinite(order.offerShownAtMs)
      ? order.offerShownAtMs
      : new Date(order.createdAt).getTime();
  const deadline = riderAcceptDeadlineMs(order);
  const total = Math.max(1, deadline - offerStart);
  const left = Math.max(0, deadline - Date.now());
  return Math.max(0, Math.min(1, left / total));
}
