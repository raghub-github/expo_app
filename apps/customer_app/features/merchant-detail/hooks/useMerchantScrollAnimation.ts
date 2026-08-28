import { useCallback } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { HEADER_COLLAPSED_THRESHOLD, merchantStickySearchFadeStart } from "../constants/layout";

type UseMerchantScrollAnimationOpts = {
  headerSearchExpandedSv: SharedValue<boolean>;
  userMenuScrollStarted?: SharedValue<boolean>;
  heroBannerHeightSv?: SharedValue<number>;
  onScrollEnd?: (y: number) => void;
  /** Cancel pending programmatic scroll when the user takes over. */
  onBeginDrag?: () => void;
  /** Discovery pins chrome; classic / grid-first fade it in on scroll. */
  pinned?: boolean;
};

export function useMerchantScrollAnimation({
  headerSearchExpandedSv,
  userMenuScrollStarted,
  heroBannerHeightSv,
  onScrollEnd,
  onBeginDrag,
  pinned = false,
}: UseMerchantScrollAnimationOpts) {
  const scrollY = useSharedValue(0);

  const commitScrollEnd = useCallback(
    (y: number) => {
      onScrollEnd?.(y);
    },
    [onScrollEnd]
  );

  const notifyBeginDrag = useCallback(() => {
    onBeginDrag?.();
  }, [onBeginDrag]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onBeginDrag: () => {
      if (userMenuScrollStarted) {
        userMenuScrollStarted.value = true;
      }
      if (onBeginDrag) {
        runOnJS(notifyBeginDrag)();
      }
    },
    onEndDrag: (event) => {
      if (onScrollEnd) {
        runOnJS(commitScrollEnd)(event.contentOffset.y);
      }
    },
    onMomentumEnd: (event) => {
      if (onScrollEnd) {
        runOnJS(commitScrollEnd)(event.contentOffset.y);
      }
    },
  });

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
    stickySearchStyle,
    stickySearchBgStyle,
    fabStyle,
  };
}
