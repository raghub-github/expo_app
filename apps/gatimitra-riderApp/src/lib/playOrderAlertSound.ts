import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform, Vibration } from "react-native";
import type { RiderOrderAcceptanceSettings } from "@/src/services/orderAcceptanceApi";
import {
  resolveAlertUrlFromSlots,
  volumeStepTo01,
  type RiderDeviceOrderAlerts,
} from "@/src/lib/riderDeviceOrderAlerts";
import { normalizeAlertSoundSlots, resolveAlertSoundUrl } from "@/src/lib/resolveAlertSoundUrl";

const BUNDLED_NOTIFICATION = require("../../assets/sounds/notification.wav");

let chimeRunId = 0;
let activeSound: Audio.Sound | null = null;

function acceptanceSoundSlots(
  settings: Pick<RiderOrderAcceptanceSettings, "alert_sound_url" | "alert_sound_urls_by_slot">
): [string | null, string | null, string | null] {
  const raw =
    settings.alert_sound_urls_by_slot ??
    ([settings.alert_sound_url, null, null] as [string | null, string | null, string | null]);
  return normalizeAlertSoundSlots(raw);
}

export function resolveIncomingOrderChimeUrl(
  settings: Pick<
    RiderOrderAcceptanceSettings,
    "alert_sound_url" | "alert_sound_urls_by_slot" | "alert_sound_slot_choice"
  >,
  device: Pick<RiderDeviceOrderAlerts, "alertSoundSlot">
): string | null {
  const slots = acceptanceSoundSlots(settings);
  return (
    resolveAlertUrlFromSlots(slots, device.alertSoundSlot) ??
    resolveAlertSoundUrl(settings.alert_sound_url) ??
    null
  );
}

async function playSingleChime(
  source: number | { uri: string },
  volume: number,
  myRun: number
): Promise<boolean> {
  if (chimeRunId !== myRun) return false;

  let sound: Audio.Sound | null = null;
  try {
    if (activeSound) {
      await activeSound.stopAsync().catch(() => undefined);
      await activeSound.unloadAsync().catch(() => undefined);
      activeSound = null;
    }

    const downloadFirst = typeof source === "object" && "uri" in source;
    const created = await Audio.Sound.createAsync(
      source,
      { volume, shouldPlay: false, isLooping: false },
      undefined,
      downloadFirst
    );
    sound = created.sound;

    if (chimeRunId !== myRun) {
      await sound.unloadAsync().catch(() => undefined);
      return false;
    }

    activeSound = sound;

    const initial = await sound.getStatusAsync();
    if (!initial.isLoaded) {
      await sound.unloadAsync().catch(() => undefined);
      if (activeSound === sound) activeSound = null;
      return false;
    }

    await sound.playAsync();

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        void sound?.unloadAsync().catch(() => undefined);
        if (activeSound === sound) activeSound = null;
        resolve();
      };
      const timeout = setTimeout(finish, 12_000);
      sound!.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          clearTimeout(timeout);
          finish();
        }
      });
    });
    return true;
  } catch {
    if (sound) {
      await sound.unloadAsync().catch(() => undefined);
      if (activeSound === sound) activeSound = null;
    }
    return false;
  }
}

export async function playOrderAlertSound(
  url: string | null | undefined,
  repeatCount: number,
  volume01: number,
  ringInSilent = true,
  opts?: { vibrate?: boolean }
): Promise<boolean> {
  const myRun = ++chimeRunId;
  const trimmed = resolveAlertSoundUrl(url) ?? "";
  const shouldVibrate = opts?.vibrate !== false;

  if (Platform.OS !== "web" && shouldVibrate) {
    Vibration.vibrate([0, 450, 120, 450, 120, 450]);
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: ringInSilent,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* non-fatal */
  }

  const safeRepeats = Math.max(1, Math.min(25, Math.floor(repeatCount || 1)));
  const volume = Math.min(1, Math.max(0, volume01));
  let anyPlayed = false;

  for (let i = 0; i < safeRepeats; i += 1) {
    if (chimeRunId !== myRun) break;

    let played = false;
    if (trimmed) {
      played = await playSingleChime({ uri: trimmed }, volume, myRun);
    }
    if (!played && !trimmed) {
      played = await playSingleChime(BUNDLED_NOTIFICATION, volume, myRun);
    }
    if (played) anyPlayed = true;
  }

  return anyPlayed;
}

export function stopOrderAlertSound(): void {
  chimeRunId += 1;
  if (activeSound) {
    void activeSound.stopAsync().catch(() => undefined);
    void activeSound.unloadAsync().catch(() => undefined);
    activeSound = null;
  }
}

export async function playIncomingOrderAlert(
  settings: Pick<
    RiderOrderAcceptanceSettings,
    | "alert_sound_enabled"
    | "alert_sound_url"
    | "alert_sound_urls_by_slot"
    | "alert_sound_slot_choice"
    | "alert_sound_repeat_count"
  >,
  device: RiderDeviceOrderAlerts
): Promise<void> {
  if (!device.orderAlertsEnabled || !device.soundAlertsEnabled) return;
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
