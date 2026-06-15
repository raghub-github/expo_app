import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  useWindowDimensions,
  type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const KEYBOARD_PIN_ANIM_MS = 300;

export type KeyboardPinnedSheetMetrics = {
  keyboardHeight: number;
  /** Distance from window bottom to sheet bottom edge (OTP_SHEET_BOTTOM = KEYBOARD_TOP). */
  bottomOffset: number;
  maxSheetHeight: number;
  keyboardOpen: boolean;
};

/**
 * OTP_SHEET_BOTTOM = KEYBOARD_TOP
 * Uses live window height so adjustResize and stale screenY stay in sync.
 */
export function readKeyboardPinnedSheetMetrics(
  event: KeyboardEvent,
  topInset: number
): KeyboardPinnedSheetMetrics {
  const keyboardH = Math.round(event.endCoordinates.height);
  const keyboardTop = Math.round(event.endCoordinates.screenY);
  const windowH = Dimensions.get("window").height;

  // Distance from window bottom to keyboard top — the only positioning rule.
  let bottomOffset = Math.max(0, Math.round(windowH - keyboardTop));

  // adjustResize: shrunk window ends where keyboard begins.
  if (keyboardTop >= windowH - 2) {
    bottomOffset = 0;
  }

  const spaceAboveKeyboard =
    bottomOffset > 0
      ? Math.round(windowH - topInset - bottomOffset - 2)
      : Math.round(keyboardTop - topInset - 2);

  return {
    keyboardHeight: keyboardH,
    bottomOffset,
    maxSheetHeight: Math.max(200, spaceAboveKeyboard),
    keyboardOpen: keyboardH > 0,
  };
}

function closedMetrics(winH: number): KeyboardPinnedSheetMetrics {
  return {
    keyboardHeight: 0,
    bottomOffset: 0,
    maxSheetHeight: Math.round(winH * 0.72),
    keyboardOpen: false,
  };
}

export function useKeyboardPinnedSheetMetrics(active: boolean): KeyboardPinnedSheetMetrics {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [metrics, setMetrics] = useState<KeyboardPinnedSheetMetrics>(() => closedMetrics(winH));
  const lastEventRef = useRef<KeyboardEvent | null>(null);

  useEffect(() => {
    if (!active) {
      lastEventRef.current = null;
      setMetrics(closedMetrics(winH));
      return;
    }

    const apply = (event: KeyboardEvent) => {
      lastEventRef.current = event;
      setMetrics(readKeyboardPinnedSheetMetrics(event, insets.top));
    };

    const onShow = (event: KeyboardEvent) => {
      // Snap flush immediately on Android — refine after adjustResize settles.
      if (Platform.OS === "android") {
        const keyboardH = Math.round(event.endCoordinates.height);
        const windowH = Dimensions.get("window").height;
        setMetrics({
          keyboardHeight: keyboardH,
          bottomOffset: 0,
          maxSheetHeight: Math.max(200, Math.round(windowH - insets.top - 2)),
          keyboardOpen: true,
        });
      }
      apply(event);
      if (Platform.OS === "android") {
        setTimeout(() => apply(event), 50);
        setTimeout(() => apply(event), 120);
        setTimeout(() => apply(event), 250);
      }
    };

    const onHide = () => {
      lastEventRef.current = null;
      setMetrics(closedMetrics(winH));
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    setMetrics(closedMetrics(winH));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [active, insets.top, winH]);

  useEffect(() => {
    if (!active) return;
    const event = lastEventRef.current;
    if (event) {
      setMetrics(readKeyboardPinnedSheetMetrics(event, insets.top));
      return;
    }
    setMetrics(closedMetrics(winH));
  }, [active, winH, insets.top]);

  return metrics;
}
