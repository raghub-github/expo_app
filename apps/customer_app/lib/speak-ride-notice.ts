import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { RIDE_TOLL_NOTICE_SPEECH } from "@/lib/ride-toll-notice";

export function speakRideTollNotice(text: string = RIDE_TOLL_NOTICE_SPEECH): void {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    window.speechSynthesis.speak(utter);
    return;
  }

  try {
    Speech.stop();
    Speech.speak(text, {
      language: "en-IN",
    });
  } catch {
    // Banner still shows if speech is unavailable.
  }
}
