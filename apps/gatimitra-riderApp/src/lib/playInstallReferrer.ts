/**
 * Native Google Play Install Referrer reader (Android).
 * Requires a dev-client / production build — Expo Go cannot read Install Referrer.
 *
 * Package: react-native-play-install-referrer (optional peer — graceful no-op if missing).
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearPendingReferral,
  parsePlayInstallReferrer,
  storePendingReferral,
  type PendingReferral,
} from "./pendingReferral";

const CONSUMED_KEY = "@gatimitra/play_install_referrer_consumed_v1";
const INSTALL_TS_KEY = "@gatimitra/play_install_referrer_ts_v1";

type PlayInstallReferrerInfo = {
  installReferrer: string | null;
  referrerClickTimestampSeconds?: string | number | null;
  installBeginTimestampSeconds?: string | number | null;
};

async function readNativeInstallReferrer(): Promise<PlayInstallReferrerInfo | null> {
  if (Platform.OS !== "android") return null;
  try {
    // Optional native dependency — may be absent in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-play-install-referrer");
    const api = mod?.PlayInstallReferrer ?? mod?.default ?? mod;
    if (!api?.getInstallReferrerInfo) return null;

    return await new Promise<PlayInstallReferrerInfo | null>((resolve) => {
      try {
        api.getInstallReferrerInfo((error: unknown, info: PlayInstallReferrerInfo) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(info ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export type InstallReferrerCapture = {
  code: string | null;
  raw: string | null;
  clickTs: number | null;
  installTs: number | null;
  alreadyConsumed: boolean;
  reinstallSafe: boolean;
};

/**
 * Read Play Install Referrer once per install, store pending referral, mark consumed locally.
 * Reinstall: if previously consumed for same raw referrer, skip re-apply (server also guards).
 */
export async function capturePlayInstallReferrerOnce(): Promise<InstallReferrerCapture> {
  const empty: InstallReferrerCapture = {
    code: null,
    raw: null,
    clickTs: null,
    installTs: null,
    alreadyConsumed: false,
    reinstallSafe: true,
  };

  if (Platform.OS !== "android") return empty;

  const consumedRaw = await AsyncStorage.getItem(CONSUMED_KEY);
  const info = await readNativeInstallReferrer();
  const raw = info?.installReferrer?.trim() || null;
  if (!raw) return empty;

  const code = parsePlayInstallReferrer(raw);
  const clickTs = info?.referrerClickTimestampSeconds
    ? Number(info.referrerClickTimestampSeconds) * 1000
    : null;
  const installTs = info?.installBeginTimestampSeconds
    ? Number(info.installBeginTimestampSeconds) * 1000
    : Date.now();

  if (consumedRaw && consumedRaw === raw) {
    return {
      code,
      raw,
      clickTs,
      installTs,
      alreadyConsumed: true,
      reinstallSafe: true,
    };
  }

  // Different referrer after reinstall — allow once, but flag for server
  const reinstallSafe = Boolean(consumedRaw && consumedRaw !== raw);

  if (code) {
    const pending: Omit<PendingReferral, "savedAt"> = {
      code,
      source: "play_install_referrer",
      clickToken: null,
    };
    await storePendingReferral(pending);
  }

  await AsyncStorage.setItem(CONSUMED_KEY, raw);
  await AsyncStorage.setItem(INSTALL_TS_KEY, String(installTs));

  return {
    code,
    raw,
    clickTs: Number.isFinite(clickTs) ? clickTs : null,
    installTs,
    alreadyConsumed: false,
    reinstallSafe,
  };
}

export async function applyCapturedInstallReferrer(applyFn: (input: {
  referralCode: string;
  playReferrer: string;
  source: "play_install_referrer";
}) => Promise<{ ok: boolean }>): Promise<boolean> {
  const capture = await capturePlayInstallReferrerOnce();
  if (!capture.code || capture.alreadyConsumed) return false;
  try {
    const res = await applyFn({
      referralCode: capture.code,
      playReferrer: capture.raw ?? `ref_${capture.code}`,
      source: "play_install_referrer",
    });
    if (res.ok) await clearPendingReferral();
    return res.ok;
  } catch {
    return false;
  }
}
