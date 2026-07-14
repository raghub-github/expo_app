import { useCallback, useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  getFoodHomeScrollGeneration,
  isFoodHomeListScrollActive,
} from "@/lib/foodHomeScrollGuard";

/**
 * Finger movement above this cancels the tap (px).
 * Keep above typical thumb jitter so deliberate taps aren't dropped.
 */
const MOVE_THRESHOLD = 14;

type Options = {
  onPressIn?: () => void;
  /** Called when the gesture is cancelled (scroll / move) after pressIn. */
  onPressCancel?: () => void;
};

/**
 * Only deliberate taps fire the action.
 * - Rejects presses that begin while the parent list is actively dragging/flinging.
 * - Cancels in-flight presses if scroll generation bumps or finger moves past threshold.
 * Does NOT hold a post-scroll settle window (that caused missed first taps).
 */
export function useScrollSafePress(onPressAction: () => void, options?: Options) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const blockedRef = useRef(false);
  const armedRef = useRef(false);
  const scrollGenAtStartRef = useRef(0);
  const onPressInExtra = options?.onPressIn;
  const onPressCancelExtra = options?.onPressCancel;

  const resetGesture = useCallback(() => {
    blockedRef.current = false;
    movedRef.current = false;
    armedRef.current = false;
    originRef.current = null;
  }, []);

  const cancelArmed = useCallback(() => {
    if (!armedRef.current) return;
    armedRef.current = false;
    onPressCancelExtra?.();
  }, [onPressCancelExtra]);

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      // Only block NEW presses that start mid-scroll — never a post-scroll settle.
      if (isFoodHomeListScrollActive()) {
        blockedRef.current = true;
        movedRef.current = true;
        originRef.current = null;
        armedRef.current = false;
        return;
      }
      blockedRef.current = false;
      movedRef.current = false;
      armedRef.current = true;
      scrollGenAtStartRef.current = getFoodHomeScrollGeneration();
      originRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onPressInExtra?.();
    },
    [onPressInExtra]
  );

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!originRef.current || blockedRef.current) return;
      const dx = Math.abs(e.nativeEvent.pageX - originRef.current.x);
      const dy = Math.abs(e.nativeEvent.pageY - originRef.current.y);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        movedRef.current = true;
        blockedRef.current = true;
        cancelArmed();
      }
    },
    [cancelArmed]
  );

  const shouldIgnorePress = useCallback(() => {
    if (blockedRef.current || movedRef.current) return true;
    // Generation bump = scroll started after pressIn — treat as scroll, not tap.
    if (getFoodHomeScrollGeneration() !== scrollGenAtStartRef.current) return true;
    return false;
  }, []);

  const onPress = useCallback(() => {
    if (shouldIgnorePress()) {
      cancelArmed();
      resetGesture();
      return;
    }
    armedRef.current = false;
    resetGesture();
    onPressAction();
  }, [onPressAction, shouldIgnorePress, resetGesture, cancelArmed]);

  const onPressOut = useCallback(() => {
    // Scroll stole the gesture while finger was down.
    if (isFoodHomeListScrollActive()) {
      blockedRef.current = true;
      movedRef.current = true;
      cancelArmed();
    }
    originRef.current = null;
  }, [cancelArmed]);

  const blockPress = useCallback(() => {
    movedRef.current = true;
    blockedRef.current = true;
    cancelArmed();
  }, [cancelArmed]);

  /** Clear block flags immediately (or after a short delay for sheet dismiss races). */
  const releasePressBlock = useCallback((delayMs = 0) => {
    if (delayMs <= 0) {
      blockedRef.current = false;
      movedRef.current = false;
      return;
    }
    setTimeout(() => {
      blockedRef.current = false;
      movedRef.current = false;
    }, delayMs);
  }, []);

  return {
    onPress,
    onPressIn,
    onPressOut,
    onTouchMove,
    blockPress,
    releasePressBlock,
  };
}
