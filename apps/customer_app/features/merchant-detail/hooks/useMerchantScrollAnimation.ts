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
import { HEADER_COLLAPSED_THRESHOLD } from "../constants/layout";

type UseMerchantScrollAnimationOpts = {
  headerSearchExpandedSv: SharedValue<boolean>;
  userMenuScrollStarted?: SharedValue<boolean>;
  onScrollEnd?: (y: number) => void;
  /** Cancel pending programmatic scroll when the user takes over. */
  onBeginDrag?: () => void;
  /** Discovery pins chrome; classic / grid-first fade it in on scroll. */
  pinned?: boolean;
};

export function useMerchantScrollAnimation({
  headerSearchExpandedSv,
  userMenuScrollStarted,
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
    const opacity = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD - 24, HEADER_COLLAPSED_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD - 24, HEADER_COLLAPSED_THRESHOLD],
      [-8, 0],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ translateY }] };
  });

  const stickySearchBgStyle = useAnimatedStyle(() => {
    if (pinned || headerSearchExpandedSv.value) {
      return { opacity: 1 };
    }
    const opacity = interpolate(
      scrollY.value,
      [HEADER_COLLAPSED_THRESHOLD, HEADER_COLLAPSED_THRESHOLD + 28],
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
