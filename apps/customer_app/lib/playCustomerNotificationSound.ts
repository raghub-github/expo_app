/**
 * Plays the bundled CX notification chime (order success, ride push banners, etc.).
 * Background/killed Android uses channel `customer_ride_cx` for the same asset.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";

// Bundled via expo-notifications `sounds` + require for in-app playback.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CX_NOTIFICATION_SOUND = require("../assets/sounds/cx_notification.mp3");

let runId = 0;
let activeSound: Audio.Sound | null = null;

export async function playCustomerNotificationSound(): Promise<void> {
  const myRun = ++runId;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });

    if (activeSound) {
      await activeSound.stopAsync().catch(() => undefined);
      await activeSound.unloadAsync().catch(() => undefined);
      activeSound = null;
    }

    const created = await Audio.Sound.createAsync(CX_NOTIFICATION_SOUND, {
      shouldPlay: false,
      volume: 1,
      isLooping: false,
    });
    const sound = created.sound;

    if (myRun !== runId) {
      await sound.unloadAsync().catch(() => undefined);
      return;
    }

    activeSound = sound;
    await sound.playAsync();

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync().catch(() => undefined);
        if (activeSound === sound) activeSound = null;
      }
    });
  } catch {
    /* best-effort — never block notification UI */
  }
}
