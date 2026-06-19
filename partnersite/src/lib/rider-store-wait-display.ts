/** Rider waiting at merchant store — anchor + live/finalized display helpers. */

export type RiderStoreWaitInput = {
  reached_merchant_at?: string | null;
  rider_reached_pickup_at?: string | null;
  rider_picked_up_at?: string | null;
  pickup_wait_seconds?: number | null;
};

export function resolveRiderStoreWaitAnchor(order: RiderStoreWaitInput): string | null {
  const reached =
    order.reached_merchant_at?.trim() || order.rider_reached_pickup_at?.trim() || null;
  return reached;
}

export function resolveRiderStoreWaitState(order: RiderStoreWaitInput): {
  anchorAt: string | null;
  live: boolean;
  finalizedSeconds: number | null;
} {
  const anchorAt = resolveRiderStoreWaitAnchor(order);
  const pickedUpAt = order.rider_picked_up_at?.trim() || null;

  if (!anchorAt) {
    return { anchorAt: null, live: false, finalizedSeconds: null };
  }

  if (!pickedUpAt) {
    return { anchorAt, live: true, finalizedSeconds: null };
  }

  const finalizedFromDb =
    order.pickup_wait_seconds != null && Number.isFinite(order.pickup_wait_seconds)
      ? Math.max(0, Math.floor(order.pickup_wait_seconds))
      : null;

  if (finalizedFromDb != null) {
    return { anchorAt, live: false, finalizedSeconds: finalizedFromDb };
  }

  const reachedMs = new Date(anchorAt).getTime();
  const pickedMs = new Date(pickedUpAt).getTime();
  if (Number.isFinite(reachedMs) && Number.isFinite(pickedMs)) {
    return {
      anchorAt,
      live: false,
      finalizedSeconds: Math.max(0, Math.floor((pickedMs - reachedMs) / 1000)),
    };
  }

  return { anchorAt, live: false, finalizedSeconds: null };
}

export function formatRiderStoreWaitLabel(
  totalSeconds: number | null | undefined,
  opts?: { live?: boolean }
): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const clock = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
  return opts?.live ? `${clock} (live)` : clock;
}
