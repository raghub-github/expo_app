import { useCallback } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { HEADER_COLLAPSED_THRESHOLD, merchantStickySearchFadeStart } from "../constants/layout";

type UseMerchantScrollAnimationOpts = {
  headerSearchExpandedSv: SharedValue<boolean>;
  userMenuScrollStarted?: SharedValue<boolean>;
  heroBannerHeightSv?: SharedValue<number>;
  /** Persist scroll offset when the user finishes a drag/momentum. */
  onScrollEndY?: (y: number) => void;
  /** Cancel pending programmatic scroll when the user takes over. */
  onBeginDrag?: () => void;
  /** Discovery pins chrome; classic / grid-first fade it in on scroll. */
  pinned?: boolean;
};

export type MerchantScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export function useMerchantScrollAnimation({
  headerSearchExpandedSv,
  userMenuScrollStarted,
  heroBannerHeightSv,
  onScrollEndY,
  onBeginDrag,
  pinned = false,
}: UseMerchantScrollAnimationOpts) {
  const scrollY = useSharedValue(0);

  /**
   * FlashList v2 invokes onScroll with `.call()` — must be a plain JS function.
   * `useAnimatedScrollHandler` / Animated.createAnimatedComponent(FlashList) crash
   * (`ScrollView` missing / `_c.call is not a function`).
   */
  const scrollHandler = useCallback(
    (event: MerchantScrollEvent) => {
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY]
  );

  const onScrollBeginDrag = useCallback(() => {
    if (userMenuScrollStarted) {
      userMenuScrollStarted.value = true;
    }
    onBeginDrag?.();
  }, [userMenuScrollStarted, onBeginDrag]);

  const onScrollInteractionEnd = useCallback(
    (event: MerchantScrollEvent) => {
      onScrollEndY?.(event.nativeEvent.contentOffset.y);
    },
    [onScrollEndY]
  );

  const stickySearchStyle = useAnimatedStyle(() => {
    if (pinned || headerSearchExpandedSv.value) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const heroH = heroBannerHeightSv?.value ?? HEADER_COLLAPSED_THRESHOLD;
    const fadeStart = merchantStickySearchFadeStart(heroH);
    const fadeEnd = fadeStart + 24;
    const opacity = interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [fadeStart, fadeEnd], [-8, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const stickySearchBgStyle = useAnimatedStyle(() => {
    if (pinned || headerSearchExpandedSv.value) {
      return { opacity: 1 };
    }
    const heroH = heroBannerHeightSv?.value ?? HEADER_COLLAPSED_THRESHOLD;
    const fadeStart = merchantStickySearchFadeStart(heroH);
    const opacity = interpolate(
      scrollY.value,
      [fadeStart + 24, fadeStart + 52],
      [0.9, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const fabStyle = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ translateY: 0 }],
  }));

  return {
    scrollY,
    scrollHandler,
    onScrollBeginDrag,
    onScrollInteractionEnd,
    stickySearchStyle,
    stickySearchBgStyle,
    fabStyle,
  };
}
