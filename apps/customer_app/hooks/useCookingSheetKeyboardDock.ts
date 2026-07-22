import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
} from "react-native";

export type CookingSheetKeyboardDock = {
  /** Animated inset — only output that may move the sheet. iOS only; 0 on Android. */
  keyboardLift: Animated.Value;
  /** True while keyboard is visible (ref only — never drive remounting UI off this). */
  isKeyboardVisibleRef: MutableRefObject<boolean>;
  reset: () => void;
};

/**
 * SINGLE keyboard → sheet dock pipeline, one source of truth PER PLATFORM.
 *
 * Android (windowSoftInputMode=adjustResize + Expo softwareKeyboardLayoutMode:"resize"):
 *   the OS shrinks the window when the keyboard opens, so a bottom-anchored sheet
 *   already sits above the keyboard. We add NO manual lift — a manual offset would
 *   double-count the resize (the sheet jumps up ~2×, detaching the footer) and the
 *   post-resize Dimensions re-sync was the "second layout pass". Lift stays 0.
 *
 * iOS: the Modal window does NOT resize for the keyboard, so we lift the sheet by
 *   the height the keyboard covers (windowHeight − keyboardTop). Computed once on
 *   keyboardWillShow; no re-sync races because iOS never resizes underneath us.
 *
 * Rules for callers (unchanged): never remount the TextInput / swap layout trees on
 * keyboard change, and never call Keyboard.dismiss from dock logic.
 */
export function useCookingSheetKeyboardDock(enabled: boolean): CookingSheetKeyboardDock {
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const isKeyboardVisibleRef = useRef(false);
  const liftValueRef = useRef(0);

  const setLift = useCallback(
    (next: number) => {
      const value = Math.max(0, Math.round(next));
      if (value === liftValueRef.current) return;
      liftValueRef.current = value;
      keyboardLift.stopAnimation();
      keyboardLift.setValue(value);
    },
    [keyboardLift]
  );

  const reset = useCallback(() => {
    isKeyboardVisibleRef.current = false;
    setLift(0);
  }, [setLift]);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const onShow = (e: KeyboardEvent) => {
      isKeyboardVisibleRef.current = true;
      // Android: native adjustResize owns it — no manual lift.
      if (Platform.OS !== "ios") {
        setLift(0);
        return;
      }
      // iOS: lift by however much the keyboard covers the window bottom.
      const windowH = Dimensions.get("window").height;
      const kbTop = Math.round(e.endCoordinates.screenY);
      const covered = kbTop > 0 ? windowH - kbTop : e.endCoordinates.height;
      setLift(covered);
    };

    const onHide = () => {
      isKeyboardVisibleRef.current = false;
      setLift(0);
    };

    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, onShow);
    const hideSub = Keyboard.addListener(hideEvt, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled, reset, setLift]);

  return {
    keyboardLift,
    isKeyboardVisibleRef,
    reset,
  };
}
