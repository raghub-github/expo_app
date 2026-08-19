/**
 * P2 — "wake + fresh ping" for maximum dispatch precision.
 *
 * Right before an order is finalized to the TOP candidate, we ask that one rider's app to
 * report its GPS *right now* over the `rider:{id}` realtime channel, then wait a short,
 * bounded window for a NEWER `rider_current_locations` row to land. The dispatch engine then
 * prices/routes the pre-pickup leg off that <2s-old point instead of the last periodic ping
 * (which can be up to the eligibility ceiling old — e.g. 120s → ~1 km for a moving rider).
 *
 * Safety: gated by DISPATCH_WAKE_PING_ENABLED (OFF by default). If the rider's app doesn't
 * answer within DISPATCH_WAKE_PING_TIMEOUT_MS (offline / backgrounded / no GPS), we return
 * null and the caller keeps its existing (already-fresh-within-the-gate) location — so this
 * can only ever IMPROVE precision, never block or worsen an assignment.
 */

import { getSql } from "../db/client.js";
import { getEnv } from "../config/env.js";
import { publishRiderEvent } from "../modules/realtime/publish.js";

export type FreshRiderLocation = { lat: number; lng: number; updatedAt: Date };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isWakePingEnabled(): boolean {
  return getEnv().DISPATCH_WAKE_PING_ENABLED === true;
}

/**
 * Wake `riderId`, then poll `rider_current_locations` for a row strictly newer than
 * `knownUpdatedAt` until the configured timeout. Returns the fresh point, or null on timeout
 * (caller falls back). No-op returning null when the feature is disabled.
 */
export async function requestFreshRiderLocation(args: {
  riderId: number;
  /** The location timestamp the caller already has; we wait for something newer than this. */
  knownUpdatedAt: Date | null;
  /** Override the env timeout (tests / callers with a tighter budget). */
  timeoutMsOverride?: number;
}): Promise<FreshRiderLocation | null> {
  const env = getEnv();
  if (!env.DISPATCH_WAKE_PING_ENABLED) return null;

  const timeoutMs = args.timeoutMsOverride ?? env.DISPATCH_WAKE_PING_TIMEOUT_MS;
  const knownMs = args.knownUpdatedAt ? args.knownUpdatedAt.getTime() : 0;

  // 1) Ask this one rider's app to capture + push its location immediately.
  //    Tolerated failure (publish is best-effort) — we still poll in case a periodic
  //    ping lands within the window anyway.
  await publishRiderEvent(args.riderId, {
    type: "location_wake",
    reason: "dispatch_precision",
  });

  // 2) Poll for a strictly-newer location row until the deadline.
  const sql = getSql();
  const deadline = Date.now() + timeoutMs;
  // Small backoff: quick first checks (the app can answer in a few hundred ms), then relax.
  const intervalsMs = [120, 150, 200, 250, 300];
  let i = 0;
  while (Date.now() < deadline) {
    const rows = (await sql`
      SELECT lat, lng, updated_at
      FROM rider_current_locations
      WHERE rider_id = ${args.riderId}
      LIMIT 1
    `) as unknown as Array<{ lat: number | string; lng: number | string; updated_at: string | Date }>;
    const row = rows[0];
    if (row) {
      const updatedAt = new Date(row.updated_at);
      if (updatedAt.getTime() > knownMs) {
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng, updatedAt };
        }
      }
    }
    const wait = intervalsMs[Math.min(i, intervalsMs.length - 1)];
    i += 1;
    if (Date.now() + wait > deadline) break;
    await sleep(wait);
  }

  return null;
}
