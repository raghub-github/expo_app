import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from "react-native";

/** Extra clearance above keyboard (merchant login). Rider sheets use 0 to sit flush. */
const DEFAULT_KEYBOARD_CLEARANCE = Platform.OS === "android" ? 24 : 16;

/**
 * Lift a bottom sheet by the keyboard cover height.
 * Works inside Modal where adjustResize may not shrink the window.
 */
export function useOtpKeyboardLift(
  active: boolean,
  extraClearance = DEFAULT_KEYBOARD_CLEARANCE
): number {
  const [lift, setLift] = useState(0);
  const lastLiftRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setLift(0);
      lastLiftRef.current = 0;
      return;
    }

    const applyFromMetrics = () => {
      const metrics = Keyboard.metrics?.();
      if (metrics && metrics.height > 0) {
        const windowHeight = Dimensions.get("window").height;
        const keyboardTop = Math.round(metrics.screenY);
        const next = Math.max(0, windowHeight - keyboardTop) + extraClearance;
        lastLiftRef.current = next;
        setLift(next);
        return;
      }
      setLift(lastLiftRef.current);
    };

    applyFromMetrics();
    const metricsTimer = setTimeout(applyFromMetrics, 80);

    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event: KeyboardEvent) => {
      const windowHeight = Dimensions.get("window").height;
      const keyboardTop = Math.round(event.endCoordinates.screenY);
      const next = Math.max(0, windowHeight - keyboardTop) + extraClearance;
      lastLiftRef.current = next;
      setLift(next);
    };

    const onHide = () => {
      lastLiftRef.current = 0;
      setLift(0);
    };

    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      clearTimeout(metricsTimer);
      subShow.remove();
      subHide.remove();
    };
  }, [active, extraClearance]);

  return lift;
}
