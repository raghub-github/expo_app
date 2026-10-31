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
import {
  parseNativePendingOrderAction,
  type NativePendingOrderAction,
} from "./pendingOrderAction";
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

export type { NativePendingOrderAction } from "./pendingOrderAction";

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
  canDrawOverlays?: () => Promise<boolean>;
  persistSoundSettings?: (
    enabled: boolean,
    fileUri: string | null,
    slot: number,
    ringInSilent: boolean,
    volume01: number
  ) => Promise<string | null>;
  setPersistentPill?: (enabled: boolean, count: number, orderId: string | null) => Promise<boolean>;
  consumePillLaunch?: () => Promise<{ kind?: string; count?: number; orderId?: string | null } | null>;
  consumePendingAction?: () => Promise<string | null>;
  persistActionCredentials?: (
    baseUrl: string,
    token: string,
    storeId: string
  ) => Promise<boolean>;
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

/** Native Settings.canDrawOverlays — false if the module is missing. */
export async function canDrawNativeOverlays(): Promise<boolean | null> {
  if (!Native?.canDrawOverlays) return null;
  try {
    return await Native.canDrawOverlays();
  } catch {
    return null;
  }
}

/**
 * Mirror enabled/slot/file into native SharedPreferences.
 *
 * Optional: a local file:// URI of the Super Admin slot. Killed FCM does NOT
 * require this — native falls back to bundled res/raw. Call after login so
 * defaults (buzzer ON) are committed without opening Manage Communication.
 */
export async function persistNativeAlertSound(args: {
  enabled: boolean;
  fileUri?: string | null;
  slot?: number;
  ringInSilent?: boolean;
  volume01?: number;
}): Promise<string | null> {
  if (!Native?.persistSoundSettings) return null;
  try {
    return await Native.persistSoundSettings(
      args.enabled !== false,
      args.fileUri ?? "",
      Math.max(0, Math.min(2, Math.floor(args.slot ?? 0))),
      args.ringInSilent !== false,
      Math.min(1, Math.max(0, args.volume01 ?? 1))
    );
  } catch {
    return null;
  }
}

/** Compact Orders N pill. No-ops on a build that does not include OrderAlertPill yet. */
export async function setPersistentOrderPill(
  enabled: boolean,
  count: number,
  orderId?: string | null
): Promise<void> {
  if (!Native?.setPersistentPill || Platform.OS !== "android") return;
  try {
    await Native.setPersistentPill(enabled, Math.max(0, Math.floor(count)), orderId ?? "");
  } catch {
    /* installed APK may predate this method */
  }
}

export async function consumePersistentPillLaunch(): Promise<{
  count: number;
  orderId: string;
} | null> {
  if (!Native?.consumePillLaunch || Platform.OS !== "android") return null;
  try {
    const row = await Native.consumePillLaunch();
    if (!row || row.kind !== "orders") return null;
    return { count: Number(row.count ?? 0), orderId: String(row.orderId ?? "") };
  } catch {
    return null;
  }
}

/**
 * Overlay / notification Accept or Reject while JS was dead.
 * Clears the one-shot stash so the RN sheet does not reopen a resolved order.
 */
export async function consumeNativePendingOrderAction(): Promise<NativePendingOrderAction | null> {
  if (!Native?.consumePendingAction || Platform.OS !== "android") return null;
  try {
    return parseNativePendingOrderAction(await Native.consumePendingAction());
  } catch {
    return null;
  }
}

/**
 * Hand native the credentials it needs to accept while JS is dead.
 *
 * Call this whenever the session token changes: a stale token means the native
 * accept comes back 401 and the rider loses the order with no way to tell why.
 * `storeId` is merchant-only; riders pass "".
 */
export async function persistNativeOrderAlertActionCredentials(args: {
  baseUrl: string;
  token: string;
  storeId?: string | null;
}): Promise<boolean> {
  if (!Native?.persistActionCredentials || Platform.OS !== "android") return false;
  const baseUrl = String(args.baseUrl ?? "").trim();
  const token = String(args.token ?? "").trim();
  if (!baseUrl || !token) return false;
  try {
    await Native.persistActionCredentials(baseUrl, token, String(args.storeId ?? "").trim());
    return true;
  } catch {
    return false;
  }
}
