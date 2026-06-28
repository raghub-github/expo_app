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
import {
  HEADER_IMAGE_HEIGHT,
  HEADER_COLLAPSED_THRESHOLD,
  STICKY_FILTER_SHOW_Y,
  FILTER_BAR_HEIGHT,
  STICKY_SEARCH_ROW_HEIGHT,
} from "../constants/layout";

type UseMerchantScrollAnimationOpts = {
  headerSearchExpandedSv: SharedValue<boolean>;
  onScrollEnd?: (y: number) => void;
};

export function useMerchantScrollAnimation({
  headerSearchExpandedSv,
  onScrollEnd,
}: UseMerchantScrollAnimationOpts) {
  const scrollY = useSharedValue(0);

  const commitScrollEnd = useCallback(
    (y: number) => {
      onScrollEnd?.(y);
    },
    [onScrollEnd]
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
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

  const heroBannerStyle = useAnimatedStyle(() => {
    const collapse = interpolate(
      scrollY.value,
      [0, HEADER_IMAGE_HEIGHT],
      [0, -HEADER_IMAGE_HEIGHT * 0.35],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      scrollY.value,
      [0, HEADER_IMAGE_HEIGHT],
      [1, 1.08],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY: collapse }, { scale }],
    };
  });

  const heroOverlayOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_COLLAPSED_THRESHOLD * 0.6, HEADER_COLLAPSED_THRESHOLD],
      [1, 0.4, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const infoOpacityStyle = useAnimatedStyle(() => {
    return { opacity: 1 };
  });

  const stickySearchStyle = useAnimatedStyle(() => {
    if (headerSearchExpandedSv.value) {
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
    if (headerSearchExpandedSv.value) {
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

  const stickyFilterStyle = useAnimatedStyle(() => {
    const lockY = STICKY_FILTER_SHOW_Y;
    return {
      opacity: scrollY.value >= lockY - 8 ? 1 : 0,
    };
  });

  const fabStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 48, 96],
      [0.88, 1, 1],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      scrollY.value,
      [0, 120],
      [12, 0],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ translateY }] };
  });

  const stickyFilterTop =
    MERCHANT_HEADER_TOP_GUTTER + STICKY_SEARCH_ROW_HEIGHT + 10;

  return {
    scrollY,
    scrollHandler,
    heroBannerStyle,
    heroOverlayOpacityStyle,
    infoOpacityStyle,
    stickySearchStyle,
    stickySearchBgStyle,
    stickyFilterStyle,
    fabStyle,
    stickyFilterTop,
  };
}

const MERCHANT_HEADER_TOP_GUTTER = 0;
