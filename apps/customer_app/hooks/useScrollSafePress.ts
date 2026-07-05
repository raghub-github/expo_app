import { useCallback, useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { isFoodHomeListScrollActive } from "@/lib/foodHomeScrollGuard";

const MOVE_THRESHOLD = 12;

type Options = {
  onPressIn?: () => void;
};

/** Ignore presses after scroll or finger movement — only deliberate taps navigate. */
export function useScrollSafePress(onPressAction: () => void, options?: Options) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const blockedRef = useRef(false);
  const onPressInExtra = options?.onPressIn;

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (isFoodHomeListScrollActive()) {
        blockedRef.current = true;
        return;
      }
      blockedRef.current = false;
      movedRef.current = false;
      originRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onPressInExtra?.();
    },
    [onPressInExtra]
  );

  const onTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!originRef.current || blockedRef.current) return;
    const dx = Math.abs(e.nativeEvent.pageX - originRef.current.x);
    const dy = Math.abs(e.nativeEvent.pageY - originRef.current.y);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      movedRef.current = true;
    }
  }, []);

  const onPress = useCallback(() => {
    if (blockedRef.current || movedRef.current || isFoodHomeListScrollActive()) {
      blockedRef.current = false;
      movedRef.current = false;
      originRef.current = null;
      return;
    }
    originRef.current = null;
    onPressAction();
  }, [onPressAction]);

  const onPressOut = useCallback(() => {
    originRef.current = null;
  }, []);

  const blockPress = useCallback(() => {
    movedRef.current = true;
    blockedRef.current = true;
  }, []);

  const releasePressBlock = useCallback((delayMs = 320) => {
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
