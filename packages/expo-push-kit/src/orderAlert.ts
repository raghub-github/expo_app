/**
 * Native continuous order/dispatch buzzer.
 *
 * OWNERSHIP MODEL
 * ---------------
 * Native OrderAlertForegroundService is the SINGLE audio owner whenever the
 * Android native module is present (dev-client / production APK).
 *
 * JS expo-audio / expo-av is FALLBACK only (Expo Go, iOS, or missing native).
 *
 * claimAlert attaches UI to an existing alertSessionId without starting a second
 * player. stopAlert stops native and should be paired with the JS stop helper.
 */
import { NativeModules, Platform } from "react-native";
import type { NativeOrderAlertSoundType } from "./orderAlertIds";
export {
  extractAlertSessionId,
  merchantAlertSessionId,
  riderAlertSessionId,
  riderSoundTypeForService,
  type NativeOrderAlertSoundType,
} from "./orderAlertIds";

export type NativeOrderAlert = {
  sessionId: string;
  orderId: string;
  offerId: string;
  soundType: string;
  owner: string;
  startedAt: number;
};

type NativeOrderAlertModule = {
  startAlert: (
    sessionId: string,
    orderId: string | null,
    offerId: string | null,
    soundType: string | null
  ) => Promise<NativeOrderAlert | null>;
  stopAlert: (sessionId: string | null) => Promise<boolean>;
  getActiveAlert: () => Promise<NativeOrderAlert | null>;
  claimAlert: (sessionId: string) => Promise<NativeOrderAlert | null>;
  releaseAlert: (sessionId: string) => Promise<NativeOrderAlert | null>;
};

const Native = NativeModules.GatimitraOrderAlert as NativeOrderAlertModule | undefined;

export function isNativeOrderAlertAvailable(): boolean {
  return Platform.OS === "android" && Native != null;
}

export async function startNativeOrderAlert(args: {
  sessionId: string;
  orderId?: string | null;
  offerId?: string | null;
  soundType?: NativeOrderAlertSoundType | string | null;
}): Promise<NativeOrderAlert | null> {
  const sessionId = String(args.sessionId ?? "").trim();
  if (!sessionId || !Native) return null;
  try {
    return await Native.startAlert(
      sessionId,
      args.orderId ?? "",
      args.offerId ?? "",
      args.soundType ?? "notification"
    );
  } catch {
    return null;
  }
}

export async function stopNativeOrderAlert(sessionId?: string | null): Promise<void> {
  if (!Native) return;
  const sid = String(sessionId ?? "").trim();
  if (!sid) return;
  try {
    await Native.stopAlert(sid);
  } catch {
    /* native optional */
  }
}

export async function getActiveNativeOrderAlert(): Promise<NativeOrderAlert | null> {
  if (!Native) return null;
  try {
    return await Native.getActiveAlert();
  } catch {
    return null;
  }
}

export async function claimNativeOrderAlert(
  sessionId?: string | null
): Promise<NativeOrderAlert | null> {
  if (!Native) return null;
  const sid = String(sessionId ?? "").trim();
  if (!sid) return getActiveNativeOrderAlert();
  try {
    return await Native.claimAlert(sid);
  } catch {
    return getActiveNativeOrderAlert();
  }
}

export async function releaseNativeOrderAlert(sessionId?: string | null): Promise<void> {
  if (!Native) return;
  try {
    await Native.releaseAlert(String(sessionId ?? "").trim());
  } catch {
    /* native optional */
  }
}
