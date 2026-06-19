import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, useWindowDimensions, type KeyboardEvent } from "react-native";

/** Extra clearance for OEM keyboard toolbars (emoji row, etc.). */
export const ANDROID_KEYBOARD_BUFFER = 20;
export const KEYBOARD_CLEARANCE = Platform.OS === "android" ? ANDROID_KEYBOARD_BUFFER : 8;

export type KeyboardSheetLayout = {
  /** Lift sheet anchor bottom edge above the keyboard (px from window bottom). */
  bottomLift: number;
  /** Max height cap for sheet content above keyboard. */
  availableHeight: number;
};

/** Android inset from keyboard top → window bottom (0 when adjustResize already shrank the window). */
export function keyboardInsetFromEvent(e: KeyboardEvent): number {
  const { height: windowHeight } = Dimensions.get("window");
  const top = e.endCoordinates.screenY;
  const fromScreenY = Math.max(0, Math.round(windowHeight - top));
  if (fromScreenY > 0) return fromScreenY + ANDROID_KEYBOARD_BUFFER;
  if (top >= windowHeight - 1) return 0;
  const fallback = Math.max(0, Math.round(e.endCoordinates.height));
  return fallback > 0 ? fallback + ANDROID_KEYBOARD_BUFFER : 0;
}

export function bottomLiftFromKeyboardEvent(e: KeyboardEvent): number {
  const windowHeight = Dimensions.get("window").height;
  const keyboardTop = Math.round(e.endCoordinates.screenY);
  const keyboardHeight = Math.round(e.endCoordinates.height);
  const insetFromBottom = Math.max(0, windowHeight - keyboardTop);

  if (insetFromBottom > KEYBOARD_CLEARANCE) {
    return insetFromBottom + KEYBOARD_CLEARANCE;
  }

  // adjustResize already moved the keyboard below the visible window.
  if (keyboardTop >= windowHeight - KEYBOARD_CLEARANCE) {
    return 0;
  }

  // Absolute overlays / Expo Go: fall back to reported keyboard height.
  if (keyboardHeight > KEYBOARD_CLEARANCE) {
    return keyboardHeight + KEYBOARD_CLEARANCE;
  }

  return 0;
}

/** Embedded overlays on Android use adjustResize — window height usually excludes keyboard. */
export function keyboardSheetLayoutForEmbeddedAndroid(
  topInset: number,
  event?: KeyboardEvent | null
): KeyboardSheetLayout {
  const windowHeight = Dimensions.get("window").height;
  const screenHeight = Dimensions.get("screen").height;
  let bottomLift = 0;
  let availableHeight = Math.max(
    160,
    Math.round(windowHeight - topInset - KEYBOARD_CLEARANCE - 8)
  );

  if (event) {
    const keyboardTop = Math.round(event.endCoordinates.screenY);
    const keyboardHeight = Math.round(event.endCoordinates.height);
    const insetFromBottom = Math.max(0, windowHeight - keyboardTop);
    const windowDidNotResize = windowHeight > screenHeight * 0.85;

    // adjustResize failed or keyboard toolbar still overlaps content — lift the sheet.
    if (insetFromBottom > KEYBOARD_CLEARANCE && keyboardTop < windowHeight - 8) {
      bottomLift = insetFromBottom + KEYBOARD_CLEARANCE;
      availableHeight = Math.max(
        160,
        Math.round(keyboardTop - topInset - KEYBOARD_CLEARANCE - 4)
      );
    } else if (windowDidNotResize && keyboardHeight > 100) {
      // Full-height overlay — lift by reported keyboard height.
      bottomLift = keyboardHeight + KEYBOARD_CLEARANCE;
      availableHeight = Math.max(
        160,
        Math.round(windowHeight - topInset - bottomLift - 8)
      );
    }
  }

  return { bottomLift, availableHeight };
}

/**
 * Positions bottom sheet so its bottom edge sits flush on the keyboard top.
 */
export function keyboardSheetLayoutFromEvent(
  e: KeyboardEvent,
  topInset: number,
  mode: "embedded" | "modal" = "modal",
): KeyboardSheetLayout {
  if (mode === "embedded" && Platform.OS === "android") {
    return keyboardSheetLayoutForEmbeddedAndroid(topInset);
  }

  const windowHeight = Dimensions.get("window").height;
  const keyboardTop = Math.round(e.endCoordinates.screenY);
  const bottomLift = bottomLiftFromKeyboardEvent(e);

  const availableAboveKeyboard = Math.max(
    160,
    Math.round(keyboardTop - topInset - KEYBOARD_CLEARANCE - 4),
  );

  return {
    bottomLift,
    availableHeight:
      bottomLift > 0
        ? availableAboveKeyboard
        : Math.max(160, Math.round(windowHeight - topInset - KEYBOARD_CLEARANCE - 8)),
  };
}

/** Lift for legacy modal OTP sheets — avoids double-counting adjustResize. */
export function legacySheetKeyboardLift(e: KeyboardEvent, winH: number): number {
  if (Platform.OS !== "android") return 0;

  const keyboardTop = Math.round(e.endCoordinates.screenY);
  const keyboardH = Math.round(e.endCoordinates.height);
  const gap = Math.max(0, Math.round(winH - keyboardTop));

  if (gap <= KEYBOARD_CLEARANCE && keyboardTop >= winH - KEYBOARD_CLEARANCE) {
    return 0;
  }
  if (gap > KEYBOARD_CLEARANCE) {
    return gap + KEYBOARD_CLEARANCE;
  }
  if (keyboardH > KEYBOARD_CLEARANCE) {
    return keyboardH + KEYBOARD_CLEARANCE;
  }
  return 0;
}

export function legacySheetMaxHeight(e: KeyboardEvent, topInset: number): number {
  const keyboardTop = Math.round(e.endCoordinates.screenY);
  return Math.max(240, Math.round(keyboardTop - topInset - KEYBOARD_CLEARANCE - 8));
}

const WINDOW_RESIZE_THRESHOLD = 48;

/**
 * Avoids first-open overlap when adjustResize lags behind keyboardDidShow.
 * Uses keyboard height until the window actually shrinks.
 */
export function resolveEmbeddedSheetBottomLift(
  layout: KeyboardSheetLayout,
  event: KeyboardEvent | null,
  winH: number,
  baselineWinH: number,
): number {
  // adjustResize already shrunk the window — never add manual lift on top.
  if (baselineWinH - winH >= WINDOW_RESIZE_THRESHOLD) return 0;

  if (layout.bottomLift > 0) return layout.bottomLift;

  if (event) {
    const lift = legacySheetKeyboardLift(event, winH);
    if (lift > 0) return lift;
    const keyboardH = Math.round(event.endCoordinates.height);
    if (keyboardH > 100) return keyboardH + KEYBOARD_CLEARANCE;
  }

  return 0;
}

export function resolveEmbeddedSheetMaxHeight(
  layout: KeyboardSheetLayout,
  event: KeyboardEvent | null,
  topInset: number,
  winH: number,
  bottomLift: number,
): number {
  if (event && bottomLift > 0) {
    const keyboardTop = Math.round(event.endCoordinates.screenY);
    return Math.max(200, Math.round(keyboardTop - topInset - KEYBOARD_CLEARANCE - 4));
  }
  return Math.max(200, Math.min(layout.availableHeight, Math.round(winH - topInset - 8)));
}

export type EmbeddedKeyboardSheetPosition = {
  keyboardOpen: boolean;
  /** Lift only when adjustResize did not shrink the window. */
  bottomLift: number;
  maxHeight: number;
  windowResized: boolean;
};

/**
 * Positions embedded bottom sheets flush above the Android keyboard.
 * With softwareKeyboardLayoutMode=resize, bottomLift stays 0 once the window shrinks.
 */
export function useEmbeddedKeyboardSheetPosition(
  visible: boolean,
  topInset = 0,
): EmbeddedKeyboardSheetPosition {
  const { height: winH } = useWindowDimensions();
  const baselineWinHRef = useRef(0);
  const prevVisibleRef = useRef(false);
  const lastEventRef = useRef<KeyboardEvent | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useLayoutEffect(() => {
    if (visible && !prevVisibleRef.current) {
      baselineWinHRef.current = winH;
    }
    if (!visible) {
      setKeyboardOpen(false);
      lastEventRef.current = null;
    }
    prevVisibleRef.current = visible;
  }, [visible, winH]);

  useLayoutEffect(() => {
    if (!visible) return;

    const onShow = (event: KeyboardEvent) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      lastEventRef.current = event;
      setKeyboardOpen(true);
    };

    const onHide = () => {
      if (Platform.OS === "android") {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          lastEventRef.current = null;
          setKeyboardOpen(false);
        }, 120);
        return;
      }
      lastEventRef.current = null;
      setKeyboardOpen(false);
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [visible]);

  const baselineWinH = baselineWinHRef.current;
  const windowResized =
    keyboardOpen && baselineWinH > 0 && baselineWinH - winH >= WINDOW_RESIZE_THRESHOLD;

  const bottomLift = (() => {
    if (!keyboardOpen) return 0;
    if (Platform.OS === "android" && windowResized) return 0;
    const event = lastEventRef.current;
    if (!event) return 0;
    if (Platform.OS === "android") {
      const lift = legacySheetKeyboardLift(event, winH);
      if (lift > 0) return lift;
      const keyboardH = Math.round(event.endCoordinates.height);
      return keyboardH > 100 ? keyboardH + KEYBOARD_CLEARANCE : 0;
    }
    return bottomLiftFromKeyboardEvent(event);
  })();

  const closedMaxHeight = Math.round(winH * 0.88);
  const maxHeight = (() => {
    if (!keyboardOpen) return closedMaxHeight;
    if (windowResized) {
      return Math.max(200, Math.round(winH - 8));
    }
    const event = lastEventRef.current;
    if (event && bottomLift > 0) {
      return legacySheetMaxHeight(event, topInset);
    }
    return closedMaxHeight;
  })();

  return { keyboardOpen, bottomLift, maxHeight, windowResized };
}

/** Lifts bottom UI above the Android keyboard. */
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
