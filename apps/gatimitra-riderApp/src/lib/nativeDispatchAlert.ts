import {
  claimNativeOrderAlert,
  getActiveNativeOrderAlert,
  isNativeOrderAlertAvailable,
  muteAllNativeOrderAlerts,
  muteNativeOrderAlert,
  riderAlertSessionId,
  riderSoundTypeForService,
  startNativeOrderAlert,
  stopNativeOrderAlert,
  type NativeOrderAlert,
} from "@gatimitra/expo-push-kit";
import { stopOrderAlertSound } from "@/src/lib/playOrderAlertSound";

let lastSessionId: string | null = null;

function orderTokensMatch(active: NativeOrderAlert | null | undefined, orderId: string): boolean {
  const oid = String(orderId ?? "").trim();
  if (!oid || !active) return false;
  if (active.orderId === oid || active.offerId === oid) return true;
  const sid = String(active.sessionId ?? "");
  return (
    sid.includes(`:${oid}:`) ||
    sid.endsWith(`:${oid}`) ||
    sid.startsWith(`rider-offer-${oid}`) ||
    sid.startsWith(`RIDER_NEW_ORDER:${oid}:`)
  );
}

function isAlertExpired(expiresAt?: string | null): boolean {
  const raw = String(expiresAt ?? "").trim();
  if (!raw) return false;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    const asNum = Number(raw);
    if (!Number.isFinite(asNum) || asNum <= 0) return false;
    // Heuristic: seconds vs ms epoch
    const epochMs = asNum < 1e12 ? asNum * 1000 : asNum;
    return Date.now() >= epochMs;
  }
  return Date.now() >= ms;
}

export function resolveRiderDispatchSessionId(args: {
  orderId: string;
  riderId?: string | number | null;
  waveNumber?: string | number | null;
  alertSessionId?: string | null;
}): string {
  const explicit = String(args.alertSessionId ?? "").trim();
  if (explicit) return explicit;
  return riderAlertSessionId({
    orderId: args.orderId,
    riderId: args.riderId,
    waveNumber: args.waveNumber,
  });
}

/** Returns true when native FGS owns audio (JS must not play). */
export async function startRiderDispatchBuzzer(args: {
  orderId: string;
  riderId?: string | number | null;
  waveNumber?: string | number | null;
  serviceType?: string | null;
  alertSessionId?: string | null;
  expiresAt?: string | null;
}): Promise<boolean> {
  if (!isNativeOrderAlertAvailable()) return false;

  // Prefer the live FCM/native session for this order so we don't mint a
  // wave-less id that breaks decision-ledger replay protection.
  const active = await getActiveNativeOrderAlert();
  if (active?.sessionId && orderTokensMatch(active, args.orderId)) {
    if (isAlertExpired(active.expiresAt ?? args.expiresAt)) {
      await stopNativeOrderAlert(active.sessionId);
      if (active.orderId) await stopNativeOrderAlert(active.orderId);
      lastSessionId = null;
      return false;
    }
    lastSessionId = active.sessionId;
    await claimNativeOrderAlert(active.sessionId);
    const state = String(active.alertState ?? "active").toLowerCase();
    // Terminal = accept/reject/expiry/cancel — never restart audio for these.
    if (state === "terminal") {
      return false;
    }
    if (state === "muted") {
      // App-open muted the FGS tone; re-arm only for still-actionable offers.
      if (isAlertExpired(active.expiresAt ?? args.expiresAt)) {
        await stopNativeOrderAlert(active.sessionId);
        if (active.orderId) await stopNativeOrderAlert(active.orderId);
        lastSessionId = null;
        return false;
      }
      const started = await startNativeOrderAlert({
        sessionId: active.sessionId,
        orderId: args.orderId,
        offerId: args.orderId,
        soundType: riderSoundTypeForService(args.serviceType),
      });
      if (started?.sessionId) lastSessionId = started.sessionId;
      return Boolean(started?.sessionId);
    }
    return true;
  }

  const sessionId = resolveRiderDispatchSessionId(args);
  const started = await startNativeOrderAlert({
    sessionId,
    orderId: args.orderId,
    offerId: args.orderId,
    soundType: riderSoundTypeForService(args.serviceType),
  });
  if (!started?.sessionId) return false;
  lastSessionId = started.sessionId;
  await claimNativeOrderAlert(started.sessionId);
  return true;
}

export async function attachRiderDispatchBuzzer(): Promise<string | null> {
  if (!isNativeOrderAlertAvailable()) return null;
  const active = await getActiveNativeOrderAlert();
  if (!active?.sessionId) return null;
  if (isAlertExpired(active.expiresAt)) {
    await stopNativeOrderAlert(active.sessionId);
    if (active.orderId) await stopNativeOrderAlert(active.orderId);
    lastSessionId = null;
    return null;
  }
  lastSessionId = active.sessionId;
  await claimNativeOrderAlert(active.sessionId);
  return active.orderId || active.offerId || active.sessionId;
}

/**
 * Terminal stop for this device: session + order token (mirrors OrderAlertActions).
 * Prevents format mismatch from leaving MediaPlayer looping.
 */
export function stopRiderDispatchBuzzer(sessionOrOrderId?: string | null): void {
  stopOrderAlertSound();
  const needle = String(sessionOrOrderId ?? lastSessionId ?? "").trim();
  lastSessionId = null;
  void (async () => {
    const active = await getActiveNativeOrderAlert().catch(() => null);
    const sid = needle || String(active?.sessionId ?? "").trim();
    const orderToken =
      (active && orderTokensMatch(active, needle) ? active.orderId || active.offerId : "") ||
      (needle && !needle.includes("RIDER_NEW_ORDER") && !needle.startsWith("rider-offer-")
        ? needle
        : active?.orderId || active?.offerId || "");

    if (sid) await stopNativeOrderAlert(sid);
    if (orderToken && orderToken !== sid) await stopNativeOrderAlert(orderToken);
    // Sweep again if anything for this order survived a session-id mismatch.
    const still = await getActiveNativeOrderAlert().catch(() => null);
    if (still?.sessionId && (orderTokensMatch(still, needle) || orderTokensMatch(still, orderToken))) {
      await stopNativeOrderAlert(still.sessionId);
      if (still.orderId) await stopNativeOrderAlert(still.orderId);
    }
  })();
}

/** App opened while a dispatch buzzer is playing — silence without retiring the offer. */
export function muteRiderDispatchBuzzerOnAppOpen(sessionOrOrderId?: string | null): void {
  stopOrderAlertSound();
  const sid = String(sessionOrOrderId ?? lastSessionId ?? "").trim();
  if (sid) {
    void muteNativeOrderAlert(sid);
    return;
  }
  void muteAllNativeOrderAlerts();
}

/**
 * On foreground: stop completely if the offer already expired; otherwise mute.
 */
export async function reconcileRiderDispatchAlertOnAppOpen(): Promise<void> {
  if (!isNativeOrderAlertAvailable()) return;
  const active = await getActiveNativeOrderAlert().catch(() => null);
  if (!active?.sessionId) return;
  if (isAlertExpired(active.expiresAt)) {
    stopRiderDispatchBuzzer(active.sessionId);
    if (active.orderId) stopRiderDispatchBuzzer(active.orderId);
  }
}
