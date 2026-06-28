import { useCallback, useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from "react-native-reanimated";
import {
  HEADER_COLLAPSED_THRESHOLD,
  STICKY_FILTER_SHOW_Y,
} from "../constants/layout";

export const COMPACT_SCROLL_THRESHOLD = 80;

const STICKY_FILTER_Y = STICKY_FILTER_SHOW_Y - 8;
const STICKY_SEARCH_Y = HEADER_COLLAPSED_THRESHOLD - 24;

type ChromeFlags = {
  stickyFilterActive: boolean;
  stickySearchActive: boolean;
  cartCompact: boolean;
};

function readChromeFlags(y: number): ChromeFlags {
  return {
    stickyFilterActive: y >= STICKY_FILTER_Y,
    stickySearchActive: y >= STICKY_SEARCH_Y,
    cartCompact: y > COMPACT_SCROLL_THRESHOLD,
  };
}

function flagsEqual(a: ChromeFlags, b: ChromeFlags): boolean {
  return (
    a.stickyFilterActive === b.stickyFilterActive &&
    a.stickySearchActive === b.stickySearchActive &&
    a.cartCompact === b.cartCompact
  );
}

function chromeFlagsChanged(a: number, b: number): boolean {
  "worklet";
  return (
    (a >= STICKY_FILTER_Y) !== (b >= STICKY_FILTER_Y) ||
    (a >= STICKY_SEARCH_Y) !== (b >= STICKY_SEARCH_Y) ||
    (a > COMPACT_SCROLL_THRESHOLD) !== (b > COMPACT_SCROLL_THRESHOLD)
  );
}

type UseMerchantScrollChromeStateOpts = {
  scrollY: SharedValue<number>;
  onCartCompactChange?: (compact: boolean) => void;
};

/** Pointer-event + cart compact flags — updates only when scroll crosses thresholds, not every frame. */
export function useMerchantScrollChromeState({
  scrollY,
  onCartCompactChange,
}: UseMerchantScrollChromeStateOpts) {
  const [flags, setFlags] = useState<ChromeFlags>(() => readChromeFlags(0));

  const applyFlags = useCallback(
    (next: ChromeFlags) => {
      setFlags((prev) => (flagsEqual(prev, next) ? prev : next));
      onCartCompactChange?.(next.cartCompact);
    },
    [onCartCompactChange]
  );

  const applyFlagsFromScrollY = useCallback(
    (y: number) => {
      applyFlags(readChromeFlags(y));
    },
    [applyFlags]
  );

  useAnimatedReaction(
    () => scrollY.value,
    (y, prevY) => {
      if (prevY != null && !chromeFlagsChanged(y, prevY)) {
        return;
      }
      runOnJS(applyFlagsFromScrollY)(y);
    },
    [applyFlagsFromScrollY]
  );

  return flags;
}
