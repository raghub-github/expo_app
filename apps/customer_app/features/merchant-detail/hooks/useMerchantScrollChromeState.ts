import { useCallback, useEffect, useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import {
  HEADER_IMAGE_HEIGHT,
  merchantStickySearchFadeStart,
} from "../constants/layout";

export const COMPACT_SCROLL_THRESHOLD = 80;

type ChromeFlags = {
  stickySearchActive: boolean;
  heroActionsVisible: boolean;
  heroVideoActive: boolean;
  cartCompact: boolean;
};

function readChromeFlags(
  y: number,
  heroHideY: number,
  stickySearchY: number,
  pinHeroActions: boolean
): ChromeFlags {
  return {
    stickySearchActive: y >= stickySearchY,
    heroActionsVisible: pinHeroActions || y < heroHideY,
    heroVideoActive: y < heroHideY,
    cartCompact: y > COMPACT_SCROLL_THRESHOLD,
  };
}

function flagsEqual(a: ChromeFlags, b: ChromeFlags): boolean {
  return (
    a.stickySearchActive === b.stickySearchActive &&
    a.heroActionsVisible === b.heroActionsVisible &&
    a.heroVideoActive === b.heroVideoActive &&
    a.cartCompact === b.cartCompact
  );
}

function chromeFlagsChanged(
  aY: number,
  bY: number,
  aPin: boolean,
  bPin: boolean,
  heroHideY: number,
  stickySearchY: number
): boolean {
  "worklet";
  return (
    (aY >= stickySearchY) !== (bY >= stickySearchY) ||
    (aPin || aY < heroHideY) !== (bPin || bY < heroHideY) ||
    (aY < heroHideY) !== (bY < heroHideY) ||
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
  const stickySearchY = useSharedValue(merchantStickySearchFadeStart(heroBannerHeight));

  const [flags, setFlags] = useState<ChromeFlags>(() =>
    readChromeFlags(
      0,
      heroBannerHeight,
      merchantStickySearchFadeStart(heroBannerHeight),
      true
    )
  );
  const applyFlags = useCallback(
    (next: ChromeFlags) => {
      setFlags((prev) => (flagsEqual(prev, next) ? prev : next));
      onCartCompactChange?.(next.cartCompact);
    },
    [onCartCompactChange]
  );

  const applyFlagsFromScroll = useCallback(
    (y: number, hideY: number, searchY: number, pinHeroActions: boolean) => {
      applyFlags(readChromeFlags(y, hideY, searchY, pinHeroActions));
    },
    [applyFlags]
  );

  useEffect(() => {
    heroHideY.value = heroBannerHeight;
    stickySearchY.value = merchantStickySearchFadeStart(heroBannerHeight);
    const pinHero = !(userMenuScrollStarted?.value ?? true);
    applyFlagsFromScroll(
      scrollY.value,
      heroBannerHeight,
      merchantStickySearchFadeStart(heroBannerHeight),
      pinHero
    );
  }, [heroBannerHeight, heroHideY, stickySearchY, scrollY, userMenuScrollStarted, applyFlagsFromScroll]);

  useAnimatedReaction(
    () => ({
      y: scrollY.value,
      hideY: heroHideY.value,
      searchY: stickySearchY.value,
      pinHero: !(userMenuScrollStarted?.value ?? true),
    }),
    (cur, prev) => {
      if (
        prev != null &&
        !chromeFlagsChanged(
          cur.y,
          prev.y,
          cur.pinHero,
          prev.pinHero,
          cur.hideY,
          cur.searchY
        )
      ) {
        return;
      }
      runOnJS(applyFlagsFromScroll)(cur.y, cur.hideY, cur.searchY, cur.pinHero);
    },
    [applyFlagsFromScroll, userMenuScrollStarted]
  );

  return flags;
}
