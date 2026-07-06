import { useCallback, useEffect, useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import {
  HEADER_COLLAPSED_THRESHOLD,
  HEADER_IMAGE_HEIGHT,
} from "../constants/layout";

export const COMPACT_SCROLL_THRESHOLD = 80;

const STICKY_SEARCH_Y = HEADER_COLLAPSED_THRESHOLD - 24;

type ChromeFlags = {
  stickySearchActive: boolean;
  heroActionsVisible: boolean;
  cartCompact: boolean;
};

function readChromeFlags(y: number, heroHideY: number, pinHeroActions: boolean): ChromeFlags {
  return {
    stickySearchActive: y >= STICKY_SEARCH_Y,
    heroActionsVisible: pinHeroActions || y < heroHideY,
    cartCompact: y > COMPACT_SCROLL_THRESHOLD,
  };
}

function flagsEqual(a: ChromeFlags, b: ChromeFlags): boolean {
  return (
    a.stickySearchActive === b.stickySearchActive &&
    a.heroActionsVisible === b.heroActionsVisible &&
    a.cartCompact === b.cartCompact
  );
}

function chromeFlagsChanged(
  aY: number,
  bY: number,
  aPin: boolean,
  bPin: boolean,
  heroHideY: number
): boolean {
  "worklet";
  const aHero = aPin || aY < heroHideY;
  const bHero = bPin || bY < heroHideY;
  return (
    (aY >= STICKY_SEARCH_Y) !== (bY >= STICKY_SEARCH_Y) ||
    aHero !== bHero ||
    (aY > COMPACT_SCROLL_THRESHOLD) !== (bY > COMPACT_SCROLL_THRESHOLD)
  );
}

type UseMerchantScrollChromeStateOpts = {
  scrollY: SharedValue<number>;
  userMenuScrollStarted?: SharedValue<boolean>;
  onCartCompactChange?: (compact: boolean) => void;
  /** Hero row height — CTAs hide once banner scrolls off (after user scroll begins). */
  heroBannerHeight?: number;
};

/** Pointer-event + cart compact flags — updates only when scroll crosses thresholds, not every frame. */
export function useMerchantScrollChromeState({
  scrollY,
  userMenuScrollStarted,
  onCartCompactChange,
  heroBannerHeight = HEADER_IMAGE_HEIGHT,
}: UseMerchantScrollChromeStateOpts) {
  const heroHideY = useSharedValue(heroBannerHeight);

  const [flags, setFlags] = useState<ChromeFlags>(() =>
    readChromeFlags(0, heroBannerHeight, true)
  );
  const applyFlags = useCallback(
    (next: ChromeFlags) => {
      setFlags((prev) => (flagsEqual(prev, next) ? prev : next));
      onCartCompactChange?.(next.cartCompact);
    },
    [onCartCompactChange]
  );

  const applyFlagsFromScroll = useCallback(
    (y: number, hideY: number, pinHeroActions: boolean) => {
      applyFlags(readChromeFlags(y, hideY, pinHeroActions));
    },
    [applyFlags]
  );

  useEffect(() => {
    heroHideY.value = heroBannerHeight;
    const pinHero = !(userMenuScrollStarted?.value ?? true);
    applyFlagsFromScroll(scrollY.value, heroBannerHeight, pinHero);
  }, [heroBannerHeight, heroHideY, scrollY, userMenuScrollStarted, applyFlagsFromScroll]);

  useAnimatedReaction(
    () => ({
      y: scrollY.value,
      hideY: heroHideY.value,
      pinHero: !(userMenuScrollStarted?.value ?? true),
    }),
    (cur, prev) => {
      if (
        prev != null &&
        !chromeFlagsChanged(cur.y, prev.y, cur.pinHero, prev.pinHero, cur.hideY)
      ) {
        return;
      }
      runOnJS(applyFlagsFromScroll)(cur.y, cur.hideY, cur.pinHero);
    },
    [applyFlagsFromScroll, userMenuScrollStarted]
  );

  return flags;
}
