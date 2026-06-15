import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from "react-native";

/** Extra clearance for OEM keyboard toolbars (emoji row, etc.). */
const ANDROID_KEYBOARD_BUFFER = 12;

/** Android inset from keyboard top → window bottom (0 when adjustResize already shrank the window). */
function keyboardInsetFromEvent(e: KeyboardEvent): number {
  const { height: windowHeight } = Dimensions.get("window");
  const top = e.endCoordinates.screenY;
  const fromScreenY = Math.max(0, Math.round(windowHeight - top));
  if (fromScreenY > 0) return fromScreenY + ANDROID_KEYBOARD_BUFFER;
  if (top >= windowHeight - 1) return 0;
  const fallback = Math.max(0, Math.round(e.endCoordinates.height));
  return fallback > 0 ? fallback + ANDROID_KEYBOARD_BUFFER : 0;
}

/** Lifts bottom UI above the Android keyboard. iOS should use KeyboardAvoidingView instead. */
export function useKeyboardBottomInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setInset(keyboardInsetFromEvent(e));
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setInset(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}
