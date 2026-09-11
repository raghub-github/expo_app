/**
 * GAP 3b — one bounded re-alert of an un-accepted dispatch offer before the wave radius expands.
 *
 * A rider whose FIRST offer FCM was dropped while the app was killed otherwise waits for the next
 * radius expansion or a manual /pending-offers poll. This re-sends exactly ONE extra critical push
 * to riders already offered THIS wave who still haven't accepted (order unassigned) and are still
 * eligible (fresh GPS, inside the wave radius, on-duty). De-duped per (session, wave, rider) via
 * Redis, so it can never spam. Additive + gated by DISPATCH_OFFER_REALERT_ENABLED (default on).
 */
import { cacheGet, cacheSet } from "@gatimitra/redis";
import { getSql } from "../db/client.js";
import { getEnv } from "../config/env.js";
import { evaluateRiderDispatchEligibility } from "./order-assignment-engine.js";

/** Redis dedup key — one re-alert per rider per wave of a dispatch session. */
export function dispatchRealertDedupKey(sessionId: number, wave: number, riderId: number): string {
  return `dispatch:realert:${sessionId}:${wave}:${riderId}`;
}

/**
 * PURE: is this session's CURRENT wave in the re-alert window?
 * True once `delaySeconds` have passed since the wave was dispatched AND the wave has not yet
 * expanded (no due next wave). Never re-alerts a wave that is about to / has already advanced.
 */
export function shouldRealertWave(input: {
  lastWaveAtMs: number | null;
  nextWaveAtMs: number | null;
  nowMs: number;
  delaySeconds: number;
}): boolean {
  if (input.lastWaveAtMs == null || !Number.isFinite(input.lastWaveAtMs)) return false;
  const elapsedMs = input.nowMs - input.lastWaveAtMs;
  if (elapsedMs < input.delaySeconds * 1000) return false;
  // Wave already due to expand (or expired) → let the wave engine advance instead of re-alerting.
  if (input.nextWaveAtMs != null && Number.isFinite(input.nextWaveAtMs) && input.nextWaveAtMs <= input.nowMs) {
    return false;
  }
  return true;
}

export type DispatchRealertResult = { sessionsScanned: number; ridersRealerted: number };

export async function realertActiveDispatchOffers(limit = 30): Promise<DispatchRealertResult> {
  const env = getEnv();
  if (!env.DISPATCH_OFFER_REALERT_ENABLED) return { sessionsScanned: 0, ridersRealerted: 0 };
  const delaySeconds = env.DISPATCH_OFFER_REALERT_DELAY_SECONDS;

  const sql = getSql();
  const nowMs = Date.now();

  // Active sessions whose current wave was dispatched >= delay ago and has not yet expanded.
  const sessions = (await sql`
    SELECT id, order_core_id, current_wave,
           extract(epoch FROM last_wave_at) * 1000 AS last_wave_at_ms,
           CASE WHEN next_wave_at IS NULL THEN NULL ELSE extract(epoch FROM next_wave_at) * 1000 END AS next_wave_at_ms
    FROM order_dispatch_sessions
    WHERE status = 'active'
      AND last_wave_at IS NOT NULL
      AND last_wave_at <= NOW() - (${delaySeconds} * INTERVAL '1 second')
    ORDER BY last_wave_at ASC
    LIMIT ${limit}
  `) as Array<{
    id: number;
    order_core_id: number;
    current_wave: number;
    last_wave_at_ms: number | null;
    next_wave_at_ms: number | null;
  }>;

  const { isOrderStillDispatchable, loadDispatchOrderTarget } = await import("./order-dispatch.service.js");
  const { notifyRiderDispatchOffer } = await import("./rider-dispatch-notify.js");

  let ridersRealerted = 0;

  for (const s of sessions ?? []) {
    const sessionId = Number(s.id);
    const orderCoreId = Number(s.order_core_id);
    const wave = Math.max(1, Number(s.current_wave) || 1);
    if (!sessionId || !orderCoreId) continue;

    if (
      !shouldRealertWave({
        lastWaveAtMs: s.last_wave_at_ms != null ? Number(s.last_wave_at_ms) : null,
        nextWaveAtMs: s.next_wave_at_ms != null ? Number(s.next_wave_at_ms) : null,
        nowMs,
        delaySeconds,
      })
    ) {
      continue;
    }

    // Order taken / no longer dispatchable → nothing to re-alert.
    if (!(await isOrderStillDispatchable(orderCoreId))) continue;

    const notified = (await sql`
      SELECT rider_id FROM order_dispatch_rider_notifications
      WHERE session_id = ${sessionId} AND wave_number = ${wave}
    `) as Array<{ rider_id: number }>;
    const riderIds = (notified ?? []).map((r) => Number(r.rider_id)).filter((id) => id > 0);
    if (riderIds.length === 0) continue;

    const target = await loadDispatchOrderTarget(orderCoreId, wave);
    if (!target) continue;

    for (const riderId of riderIds) {
      const key = dispatchRealertDedupKey(sessionId, wave, riderId);
      // Already re-alerted this rider for this wave → skip (one extra push only).
      if (await cacheGet(key)) continue;

      // Re-validate at re-alert time: a rider who moved out of radius / went stale / off-duty
      // must not be re-alerted (mirrors the original offer's eligibility).
      const eligible = await evaluateRiderDispatchEligibility(riderId, target, { logDecision: false }).catch(
        () => null
      );
      if (!eligible) continue;

      // Claim the dedup slot BEFORE sending so a concurrent replica can't double-send.
      await cacheSet(key, "1", 300);
      // Re-check dispatchability right before the send — the order may have just been accepted.
      if (!(await isOrderStillDispatchable(orderCoreId))) break;

      await notifyRiderDispatchOffer(target, eligible, { realert: true });
      ridersRealerted += 1;
      console.info(
        "[dispatch] OFFER_REALERT",
        JSON.stringify({ order: target.orderId, rider: riderId, sessionId, wave })
      );
    }
  }

  return { sessionsScanned: sessions?.length ?? 0, ridersRealerted };
}
