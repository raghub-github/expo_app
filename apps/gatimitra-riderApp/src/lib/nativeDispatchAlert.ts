import {
  claimNativeOrderAlert,
  getActiveNativeOrderAlert,
  isNativeOrderAlertAvailable,
  riderAlertSessionId,
  riderSoundTypeForService,
  startNativeOrderAlert,
  stopNativeOrderAlert,
} from "@gatimitra/expo-push-kit";
import { stopOrderAlertSound } from "@/src/lib/playOrderAlertSound";

let lastSessionId: string | null = null;

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
}): Promise<boolean> {
  if (!isNativeOrderAlertAvailable()) return false;
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
  lastSessionId = active.sessionId;
  await claimNativeOrderAlert(active.sessionId);
  return active.orderId || active.offerId || active.sessionId;
}

export function stopRiderDispatchBuzzer(sessionOrOrderId?: string | null): void {
  stopOrderAlertSound();
  const sid = String(sessionOrOrderId ?? lastSessionId ?? "").trim();
  lastSessionId = null;
  if (sid) {
    void stopNativeOrderAlert(sid);
    return;
  }
  void (async () => {
    const active = await getActiveNativeOrderAlert();
    if (active?.sessionId) await stopNativeOrderAlert(active.sessionId);
    else if (active?.orderId) await stopNativeOrderAlert(active.orderId);
  })();
}
