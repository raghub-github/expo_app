/**
 * Store hero carousel: banner first → gallery → loop.
 * Horizontal strip (all slides mounted) — no URI swapping during swipe (prevents flicker).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export type StoreBannerCarouselProps = {
  bannerUri: string | null | undefined;
  galleryUris?: (string | null | undefined)[];
  width: number;
  height: number;
  borderRadius?: number;
  holdMs?: number;
  slideMs?: number;
  initialBannerHoldMs?: number;
  slideIntervalMs?: number;
  slideDurationMs?: number;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
  showDots?: boolean;
  hidePlaceholderIcon?: boolean;
  enableSwipe?: boolean;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  deferTapToParent?: boolean;
  onSwipeGesture?: () => void;
  /** Disable Ken Burns on single-slide heroes (store page scroll). */
  enableKenBurns?: boolean;
  /** Disable timed slide advance (store page — avoids flicker while scrolling). */
  enableAutoRotate?: boolean;
  /** Infinite clone strip for forward loop (list cards with swipe/auto only). */
  enableInfiniteLoop?: boolean;
  /** Called when a swipe/drag gesture finishes (used to unblock parent press). */
  onGestureComplete?: () => void;
};

export const LIST_CARD_CAROUSEL_HOLD_MS = 3200;
export const LIST_CARD_CAROUSEL_SLIDE_MS = 460;

const DEFAULT_HOLD = LIST_CARD_CAROUSEL_HOLD_MS;
const DEFAULT_SLIDE = LIST_CARD_CAROUSEL_SLIDE_MS;
const SWIPE_THRESHOLD = 36;

const BannerImage = React.memo(function BannerImage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  return (
    <View style={{ width, height, backgroundColor: GatiMitraColors.mintSoft }}>
      <Image
        source={{ uri }}
        style={{ width, height }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        recyclingKey={uri}
        priority="high"
        allowDownscaling
      />
    </View>
  );
});

function buildSlides(banner: string | null | undefined, gallery: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const abs = toAbsoluteImageUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };
  add(banner ?? null);
  for (const g of gallery) add(g);
  return out;
}

function EmptyHero({
  width,
  height,
  borderRadius,
  hidePlaceholderIcon,
}: {
  width: number;
  height: number;
  borderRadius: number;
  hidePlaceholderIcon?: boolean;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderTopLeftRadius: borderRadius,
        borderTopRightRadius: borderRadius,
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={
          hidePlaceholderIcon
            ? [GatiMitraColors.mintSoft, "#d1fae5", GatiMitraColors.surfaceWarm]
            : [GatiMitraColors.mintSoft, "#ecfdf5", GatiMitraColors.surfaceWarm]
        }
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function StoreBannerCarousel({
  bannerUri,
  galleryUris = [],
  width,
  height,
  borderRadius = 0,
  holdMs,
  slideMs,
  initialBannerHoldMs,
  slideIntervalMs,
  slideDurationMs,
  style,
  dimmed = false,
  showDots = true,
  hidePlaceholderIcon = false,
  enableSwipe = false,
  onPress,
  onPressIn,
  onPressOut,
  deferTapToParent = false,
  onSwipeGesture,
  enableKenBurns = true,
  enableAutoRotate = true,
  enableInfiniteLoop,
  onGestureComplete,
}: StoreBannerCarouselProps) {
  const resolvedHoldMs = holdMs ?? slideIntervalMs ?? initialBannerHoldMs ?? DEFAULT_HOLD;
  const resolvedSlideMs = slideMs ?? slideDurationMs ?? DEFAULT_SLIDE;

  const [activeIndex, setActiveIndex] = useState(0);

  const activeIndexRef = useRef(0);
  const physicalIndexRef = useRef(0);
  const slidesRef = useRef<string[]>([]);
  const loopSlidesRef = useRef<string[]>([]);
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCarouselRef = useRef(false);
  const holdMsRef = useRef(resolvedHoldMs);
  const slideMsRef = useRef(resolvedSlideMs);
  const didSwipeRef = useRef(false);
  const widthRef = useRef(width);

  const translateX = useSharedValue(0);
  const kenBurns = useSharedValue(0);

  holdMsRef.current = resolvedHoldMs;
  slideMsRef.current = resolvedSlideMs;
  widthRef.current = width;

  const bannerAbs = useMemo(
    () => toAbsoluteImageUrl(bannerUri) ?? (typeof bannerUri === "string" ? bannerUri.trim() : ""),
    [bannerUri]
  );

  const galleryOnly = useMemo(
    () =>
      (galleryUris ?? [])
        .map((u) => toAbsoluteImageUrl(u) ?? (typeof u === "string" ? u.trim() : ""))
        .filter(Boolean)
        .filter((u) => u !== bannerAbs),
    [galleryUris, bannerAbs]
  );

  const hasGallery = galleryOnly.length > 0;

  const slides = useMemo(() => {
    if (!hasGallery) {
      const single = bannerAbs || galleryOnly[0] || "";
      return single ? [single] : [];
    }
    if (bannerAbs) return buildSlides(bannerAbs, galleryOnly);
    return galleryOnly;
  }, [bannerAbs, galleryOnly, hasGallery]);

  const loopSlides = useMemo(() => {
    if (slides.length <= 1) return slides;
    const first = slides[0]!;
    const last = slides[slides.length - 1]!;
    return [last, ...slides, first];
  }, [slides]);

  slidesRef.current = slides;
  const dataKey = slides.join("|");
  const showCarousel = slides.length > 1;
  const useInfiniteLoop =
    enableInfiniteLoop ?? (showCarousel && (enableSwipe || enableAutoRotate));
  const stripSlides = useInfiniteLoop ? loopSlides : slides;
  loopSlidesRef.current = stripSlides;
  showCarouselRef.current = showCarousel;

  const syncTranslateToPhysical = useCallback(
    (physicalIndex: number, animated: boolean) => {
      const target = -physicalIndex * widthRef.current;
      if (animated) {
        translateX.value = withTiming(target, {
          duration: slideMsRef.current,
          easing: Easing.linear,
        });
      } else {
        cancelAnimation(translateX);
        translateX.value = target;
      }
    },
    [translateX]
  );

  const resetToLogicalIndex = useCallback(
    (logicalIndex: number, animated: boolean) => {
      const physical = useInfiniteLoop ? logicalIndex + 1 : logicalIndex;
      physicalIndexRef.current = physical;
      syncTranslateToPhysical(physical, animated);
    },
    [syncTranslateToPhysical, useInfiniteLoop]
  );

  useEffect(() => {
    for (const uri of slides) {
      void Image.prefetch(uri);
    }
  }, [dataKey, slides]);

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    physicalIndexRef.current = useInfiniteLoop ? 1 : 0;
    isAnimatingRef.current = false;
    isDraggingRef.current = false;
    resetToLogicalIndex(0, false);
  }, [dataKey, resetToLogicalIndex, slides.length, useInfiniteLoop]);

  activeIndexRef.current = activeIndex;

  useEffect(() => {
    if (!isDraggingRef.current && !isAnimatingRef.current) {
      resetToLogicalIndex(activeIndex, false);
    }
  }, [activeIndex, resetToLogicalIndex]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const commitIndex = useCallback(
    (next: number) => {
      activeIndexRef.current = next;
      setActiveIndex(next);
      isAnimatingRef.current = false;
    },
    []
  );

  const applyPhysicalIndex = useCallback((physical: number, logical: number) => {
    physicalIndexRef.current = physical;
    commitIndex(logical);
  }, [commitIndex]);

  const finishGesture = useCallback(() => {
    onGestureComplete?.();
  }, [onGestureComplete]);

  const runSlide = useCallback(
    (direction: 1 | -1, onComplete?: () => void) => {
      const real = slidesRef.current;
      const len = real.length;
      const w = widthRef.current;
      if (len <= 1 || isAnimatingRef.current || isDraggingRef.current) {
        onComplete?.();
        return;
      }

      isAnimatingRef.current = true;
      const nextPhysical = physicalIndexRef.current + direction;
      const loopLen = loopSlidesRef.current.length;
      const nextLogical = useInfiniteLoop
        ? (activeIndexRef.current + direction + len) % len
        : Math.max(0, Math.min(len - 1, activeIndexRef.current + direction));

      if (!useInfiniteLoop && nextLogical === activeIndexRef.current) {
        isAnimatingRef.current = false;
        onComplete?.();
        return;
      }

      translateX.value = withTiming(
        -nextPhysical * w,
        { duration: slideMsRef.current, easing: Easing.linear },
        (finished) => {
          if (!finished) {
            runOnJS(() => {
              isAnimatingRef.current = false;
            })();
            return;
          }

          if (useInfiniteLoop && nextPhysical === loopLen - 1) {
            translateX.value = -w;
            runOnJS(applyPhysicalIndex)(1, 0);
          } else if (useInfiniteLoop && nextPhysical === 0) {
            translateX.value = -len * w;
            runOnJS(applyPhysicalIndex)(len, len - 1);
          } else {
            runOnJS(applyPhysicalIndex)(nextPhysical, nextLogical);
          }

          if (onComplete) runOnJS(onComplete)();
        }
      );
    },
    [applyPhysicalIndex, translateX, useInfiniteLoop]
  );

  const startAutoLoop = useCallback(() => {
    clearHoldTimer();
    if (!showCarouselRef.current || slidesRef.current.length <= 1) return;
    holdTimerRef.current = setTimeout(() => {
      runSlide(1, startAutoLoop);
    }, holdMsRef.current);
  }, [clearHoldTimer, runSlide]);

  useEffect(() => {
    if (!showCarousel || !enableAutoRotate) {
      clearHoldTimer();
      return;
    }
    startAutoLoop();
    return clearHoldTimer;
  }, [showCarousel, enableAutoRotate, dataKey, clearHoldTimer, startAutoLoop]);

  useEffect(() => {
    if (enableKenBurns && !showCarousel && slides.length === 1) {
      kenBurns.value = 0;
      kenBurns.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 4200, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
      return () => {
        cancelAnimation(kenBurns);
        kenBurns.value = 0;
      };
    }
    cancelAnimation(kenBurns);
    kenBurns.value = 0;
  }, [enableKenBurns, showCarousel, slides.length, kenBurns]);

  const resetAutoAfterGesture = useCallback(() => {
    if (showCarouselRef.current) startAutoLoop();
  }, [startAutoLoop]);

  const shouldCaptureHorizontal = useCallback(
    (dx: number, dy: number) =>
      enableSwipe &&
      showCarouselRef.current &&
      Math.abs(dx) > 4 &&
      Math.abs(dx) > Math.abs(dy) * 1.05,
    [enableSwipe]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_, g) => shouldCaptureHorizontal(g.dx, g.dy),
        onMoveShouldSetPanResponder: (_, g) => shouldCaptureHorizontal(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          didSwipeRef.current = false;
          isDraggingRef.current = true;
          clearHoldTimer();
          cancelAnimation(translateX);
          isAnimatingRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          const w = widthRef.current;
          if (slidesRef.current.length <= 1) return;

          if (Math.abs(g.dx) > 10) {
            if (!didSwipeRef.current) onSwipeGesture?.();
            didSwipeRef.current = true;
          }

          translateX.value = -physicalIndexRef.current * w + g.dx;
        },
        onPanResponderRelease: (_, g) => {
          isDraggingRef.current = false;
          const absDx = Math.abs(g.dx);
          const absDy = Math.abs(g.dy);
          const len = slidesRef.current.length;
          const w = widthRef.current;

          if ((didSwipeRef.current || absDx > SWIPE_THRESHOLD) && absDx > absDy && len > 1) {
            didSwipeRef.current = true;
            onSwipeGesture?.();
            const dir: 1 | -1 = g.dx < 0 ? 1 : -1;
            const progress = Math.min(1, absDx / Math.max(w, 1));

            if (progress >= 0.22) {
              runSlide(dir, () => {
                resetAutoAfterGesture();
                finishGesture();
              });
            } else {
              translateX.value = withTiming(-physicalIndexRef.current * w, {
                duration: 180,
                easing: Easing.out(Easing.quad),
              });
              resetAutoAfterGesture();
              finishGesture();
            }
            return;
          }

          if (!deferTapToParent && absDx < 10 && absDy < 10 && !didSwipeRef.current) {
            onPress?.();
            onPressOut?.();
          } else if (absDx > 0) {
            translateX.value = withTiming(-physicalIndexRef.current * w, {
              duration: 180,
              easing: Easing.out(Easing.quad),
            });
          }
          resetAutoAfterGesture();
          if (didSwipeRef.current) finishGesture();
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          const w = widthRef.current;
          translateX.value = withTiming(-physicalIndexRef.current * w, {
            duration: 180,
            easing: Easing.out(Easing.quad),
          });
          resetAutoAfterGesture();
          if (didSwipeRef.current) finishGesture();
        },
      }),
    [
      enableSwipe,
      clearHoldTimer,
      deferTapToParent,
      onPress,
      onPressOut,
      onSwipeGesture,
      commitIndex,
      resetAutoAfterGesture,
      finishGesture,
      runSlide,
      shouldCaptureHorizontal,
      translateX,
    ]
  );

  const panHandlers = enableSwipe ? panResponder.panHandlers : undefined;

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const singleSlideMotionStyle = useAnimatedStyle(() => {
    const progress = kenBurns.value;
    return {
      transform: [
        { scale: interpolate(progress, [0, 1], [1.01, 1.06]) },
        { translateX: interpolate(progress, [0, 1], [-4, 4]) },
      ],
    };
  });

  const radiusStyle = {
    borderTopLeftRadius: borderRadius,
    borderTopRightRadius: borderRadius,
    overflow: "hidden" as const,
  };

  if (slides.length === 0) {
    return (
      <View style={[{ width, height }, radiusStyle, style]}>
        <EmptyHero
          width={width}
          height={height}
          borderRadius={borderRadius}
          hidePlaceholderIcon={hidePlaceholderIcon}
        />
      </View>
    );
  }

  if (!showCarousel) {
    const inner = (
      <>
        <Animated.View style={[styles.singleSlideMotion, singleSlideMotionStyle]}>
          <BannerImage uri={slides[0]} width={width} height={height} />
        </Animated.View>
        {dimmed ? <View style={[styles.dim, { borderRadius }]} pointerEvents="none" /> : null}
      </>
    );

    return (
      <View style={[{ width, height }, radiusStyle, style]}>
        {onPress && !deferTapToParent ? (
          <TouchableOpacity
            style={styles.clip}
            activeOpacity={0.92}
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
          >
            {inner}
          </TouchableOpacity>
        ) : (
          <View style={styles.clip}>{inner}</View>
        )}
      </View>
    );
  }

  return (
    <View style={[{ width, height }, radiusStyle, style]} collapsable={false}>
      <View
        style={[styles.clip, { width, height }]}
        {...panHandlers}
      >
        <Animated.View
          style={[
            styles.strip,
            { width: width * stripSlides.length, height },
            stripStyle,
          ]}
        >
          {stripSlides.map((uri, i) => (
            <BannerImage key={`${uri}-${i}`} uri={uri} width={width} height={height} />
          ))}
        </Animated.View>
      </View>
      {dimmed ? <View style={[styles.dim, { borderRadius }]} pointerEvents="none" /> : null}
      {showDots ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  strip: {
    flexDirection: "row",
  },
  singleSlideMotion: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    right: 12,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: {
    width: 14,
    backgroundColor: "#fff",
  },
});
