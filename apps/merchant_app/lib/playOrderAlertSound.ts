import { Platform, Vibration } from "react-native";

let chimeRunId = 0;

/**
 * Play configured alert URL (best-effort) + vibration — partnersite parity.
 * Uses expo-av when installed; otherwise vibration only.
 */
export async function playOrderAlertSound(
  url: string | null | undefined,
  repeatCount: number,
  volume01: number
): Promise<void> {
  const myRun = ++chimeRunId;
  const src = (url || "").trim();
  if (Platform.OS !== "web") {
    Vibration.vibrate([0, 450, 120, 450, 120, 450]);
  }
  if (!src) return;

  try {
    const av = await import("expo-av");
    await av.Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const safeRepeats = Math.max(1, Math.min(25, Math.floor(repeatCount || 1)));
    for (let i = 0; i < safeRepeats; i += 1) {
      if (chimeRunId !== myRun) break;
      const { sound } = await av.Audio.Sound.createAsync(
        { uri: src },
        { volume: Math.min(1, Math.max(0, volume01)), shouldPlay: true }
      );
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            void sound.unloadAsync();
            resolve();
          }
        });
      });
    }
  } catch {
    /* expo-av missing or URL invalid — vibration already fired */
  }
}

export function stopOrderAlertSound(): void {
  chimeRunId += 1;
}
