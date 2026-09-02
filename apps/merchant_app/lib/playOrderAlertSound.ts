import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform, Vibration } from "react-native";
import type { OrderAcceptanceSettings } from "@/services/orderAcceptanceApi";
import {
  resolveAlertUrlFromSlots,
  resolveStrictAlertUrlFromSlot,
  volumeStepTo01,
  type DeviceOrderAlerts,
} from "@/lib/deviceOrderAlerts";
import { normalizeAlertSoundSlots, resolveAlertSoundUrl } from "@/lib/resolveAlertSoundUrl";

const BUNDLED_NOTIFICATION = require("../assets/sounds/notification.wav");

/** Load/playback guards — a stalled remote chime must never block the fallback tone. */
const LOAD_TIMEOUT_MS = 6_000;
const PLAY_TIMEOUT_MS = 12_000;

let chimeRunId = 0;
let activePlayer: AudioPlayer | null = null;

function warnAlert(message: string, err?: unknown) {
  if (__DEV__) console.warn(`[orderAlertSound] ${message}`, err ?? "");
}

function acceptanceSoundSlots(
  settings: Pick<OrderAcceptanceSettings, "alert_sound_url" | "alert_sound_urls_by_slot">
): [string | null, string | null, string | null] {
  const raw =
    settings.alert_sound_urls_by_slot ??
    ([settings.alert_sound_url, null, null] as [string | null, string | null, string | null]);
  return normalizeAlertSoundSlots(raw);
}

/** Incoming alert playback — uses this device's chosen slot (partnersite parity). */
export function resolveIncomingOrderChimeUrl(
  settings: Pick<
    OrderAcceptanceSettings,
    "alert_sound_url" | "alert_sound_urls_by_slot" | "alert_sound_slot_choice"
  >,
  device: Pick<DeviceOrderAlerts, "alertSoundSlot">
): string | null {
  const slots = acceptanceSoundSlots(settings);
  return (
    resolveAlertUrlFromSlots(slots, device.alertSoundSlot) ??
    resolveAlertSoundUrl(settings.alert_sound_url) ??
    null
  );
}

function releasePlayer(player: AudioPlayer | null) {
  if (!player) return;
  if (activePlayer === player) activePlayer = null;
  try {
    player.pause();
  } catch {
    /* already torn down */
  }
  try {
    player.remove();
  } catch {
    /* already released */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilLoaded(player: AudioPlayer, myRun: number): Promise<boolean> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (chimeRunId !== myRun) return false;
    if (player.isLoaded) return true;
    await delay(80);
  }
  return player.isLoaded;
}

function waitUntilFinished(player: AudioPlayer, maxWaitMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
    });
    const timer = setTimeout(finish, maxWaitMs);
  });
}

/** Play one source `repeats` times back-to-back. Returns false when it never sounded. */
async function playChime(
  source: number | { uri: string },
  volume: number,
  repeats: number,
  myRun: number
): Promise<boolean> {
  if (chimeRunId !== myRun) return false;

  let player: AudioPlayer | null = null;
  try {
    player = createAudioPlayer(source, { downloadFirst: true });
  } catch (err) {
    warnAlert("audio player unavailable", err);
    return false;
  }

  try {
    releasePlayer(activePlayer);
    activePlayer = player;
    player.loop = false;
    player.volume = volume;

    const loaded = await waitUntilLoaded(player, myRun);
    if (chimeRunId !== myRun) return false;
    if (!loaded) {
      warnAlert("chime source failed to load");
      return false;
    }

    // Never wait longer than the clip itself — a missing didJustFinish must not
    // stretch a 7× repeat into minutes of dead air.
    const clipMs = player.duration > 0 ? Math.round(player.duration * 1000) + 700 : PLAY_TIMEOUT_MS;
    const passWaitMs = Math.min(PLAY_TIMEOUT_MS, clipMs);

    for (let i = 0; i < repeats; i += 1) {
      if (chimeRunId !== myRun) break;
      // expo-audio keeps the player parked at the end of the clip after each
      // pass, so every repeat has to rewind before playing again.
      if (i > 0) {
        try {
          await player.seekTo(0);
        } catch {
          break;
        }
        if (chimeRunId !== myRun) break;
      }
      const finished = waitUntilFinished(player, passWaitMs);
      player.play();
      await finished;
    }
    return true;
  } catch (err) {
    warnAlert("chime playback failed", err);
    return false;
  } finally {
    releasePlayer(player);
  }
}

export type PlayOrderAlertOptions = {
  /** Default true — incoming alerts vibrate; preview passes false. */
  vibrate?: boolean;
};

/**
 * Play configured alert URL (best-effort) + vibration — partnersite parity.
 * The bundled notification.wav is the safety net: a missing, unreachable or
 * undecodable custom sound must never leave an incoming order silent.
 */
export async function playOrderAlertSound(
  url: string | null | undefined,
  repeatCount: number,
  volume01: number,
  ringInSilent = true,
  opts?: PlayOrderAlertOptions
): Promise<boolean> {
  const myRun = ++chimeRunId;
  releasePlayer(activePlayer);
  const trimmed = resolveAlertSoundUrl(url) ?? "";
  const shouldVibrate = opts?.vibrate !== false;

  if (Platform.OS !== "web" && shouldVibrate) {
    Vibration.vibrate([0, 450, 120, 450, 120, 450]);
  }

  try {
    await setAudioModeAsync({
      playsInSilentMode: ringInSilent,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      shouldRouteThroughEarpiece: false,
    });
  } catch (err) {
    warnAlert("audio mode not applied", err);
  }

  if (chimeRunId !== myRun) return false;

  const safeRepeats = Math.max(1, Math.min(5, Math.floor(repeatCount || 1)));
  const volume = Math.min(1, Math.max(0, volume01));

  let played = false;
  if (trimmed) {
    played = await playChime({ uri: trimmed }, volume, safeRepeats, myRun);
    if (!played) warnAlert(`custom chime unusable, falling back: ${trimmed}`);
  }
  if (!played && chimeRunId === myRun) {
    played = await playChime(BUNDLED_NOTIFICATION, volume, safeRepeats, myRun);
  }

  return played;
}

/** Settings-screen preview — always audible (even in silent), no vibration. */
export async function previewOrderAlertSound(args: {
  settings: Pick<
    OrderAcceptanceSettings,
    "alert_sound_url" | "alert_sound_urls_by_slot" | "alert_sound_slot_choice"
  >;
  selectedSlot: number;
  volume01: number;
}): Promise<boolean> {
  stopOrderAlertSound();
  const slots = acceptanceSoundSlots(args.settings);
  const url = resolveStrictAlertUrlFromSlot(slots, args.selectedSlot);
  return playOrderAlertSound(url, 1, args.volume01, true, { vibrate: false });
}

export function stopOrderAlertSound(): void {
  chimeRunId += 1;
  releasePlayer(activePlayer);
}

export async function playIncomingOrderAlert(
  settings: Pick<
    OrderAcceptanceSettings,
    | "alert_sound_enabled"
    | "alert_sound_url"
    | "alert_sound_urls_by_slot"
    | "alert_sound_slot_choice"
    | "alert_sound_repeat_count"
  >,
  device: DeviceOrderAlerts
): Promise<void> {
  if (!device.orderAlertsEnabled || !device.soundAlertsEnabled) {
    return;
  }
  const chimeUrl =
    settings.alert_sound_enabled === false
      ? null
      : resolveIncomingOrderChimeUrl(settings, device);
  await playOrderAlertSound(
    chimeUrl,
    settings.alert_sound_repeat_count ?? 1,
    volumeStepTo01(device.volumeStep),
    device.ringInSilent
  );
}
