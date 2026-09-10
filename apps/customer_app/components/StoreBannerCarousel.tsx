/**
 * Store hero carousel: banner first → gallery → loop.
 * Horizontal strip (all slides mounted) — no URI swapping during swipe (prevents flicker).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { prefetchImagesNow } from "@/lib/prefetchQueue";
import { useCardAnimationsEnabled } from "@/hooks/useCardAnimationsEnabled";
import { markFoodHomeListScrollEnded } from "@/lib/foodHomeScrollGuard";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  isHeroMediaSessionReady,
  markHeroMediaSessionReady,
} from "@/lib/prefetchGridFirstHeroMedia";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
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
import { GatiMitraColors } from "@/constants/gatimitra";

/** Soft white shell under list-card banners — matches grocery/food grid-first hero placeholder. */
const CARD_BANNER_SHELL = GatiMitraColors.softBackground;

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

function stableImageRecyclingKey(uri: string): string {
  const trimmed = uri.trim();
  const q = trimmed.indexOf("?");
  if (q < 0) return trimmed;
  try {
    const u = new URL(trimmed);
    const key = u.searchParams.get("key");
    return key ? `${u.origin}${u.pathname}?key=${key}` : `${u.origin}${u.pathname}`;
  } catch {
    return trimmed.slice(0, q);
  }
}

const BannerImage = React.memo(function BannerImage({
  uri,
  width,
  height,
  onLoadOk,
  onLoadFail,
}: {
  uri: string;
  width: number;
  height: number;
  onLoadOk?: (uri: string) => void;
  onLoadFail?: (uri: string) => void;
}) {
  const lastGoodRef = useRef(uri);
  const [paintUri, setPaintUri] = useState(uri);

  useEffect(() => {
    if (!uri) return;
    setPaintUri(uri);
    if (isHeroMediaSessionReady(uri)) {
      lastGoodRef.current = uri;
    }
  }, [uri]);

  return (
    <View
      style={{
        width,
        height,
        flexGrow: 0,
        flexShrink: 0,
        overflow: "hidden",
        backgroundColor: CARD_BANNER_SHELL,
      }}
      collapsable={false}
    >
      <Image
        source={{ uri: paintUri }}
        style={{ width, height }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        priority="high"
        allowDownscaling
        recyclingKey={stableImageRecyclingKey(paintUri)}
        placeholder={
          lastGoodRef.current && lastGoodRef.current !== paintUri
            ? { uri: lastGoodRef.current }
            : undefined
        }
        placeholderContentFit="cover"
        onLoad={() => {
          lastGoodRef.current = paintUri;
          markHeroMediaSessionReady(paintUri);
          onLoadOk?.(paintUri);
        }}
        onDisplay={() => {
          lastGoodRef.current = paintUri;
          markHeroMediaSessionReady(paintUri);
        }}
        onError={() => {
          if (lastGoodRef.current && lastGoodRef.current !== paintUri) {
            setPaintUri(lastGoodRef.current);
          }
          onLoadFail?.(uri);
        }}
      />
    </View>
  );
});

function EmptyHero({
  width,
  height,
  borderRadius,
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
      <GMSkeleton
        style={{
          width,
          height,
          borderTopLeftRadius: borderRadius,
          borderTopRightRadius: borderRadius,
        }}
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

  // Decorative motion only — suspended while backgrounded or mid-scroll.
  const motionAllowed = useCardAnimationsEnabled();

  const [activeIndex, setActiveIndex] = useState(0);
  const [failedUris, setFailedUris] = useState<Set<string>>(() => new Set());

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

  const translateX = useSharedValue(
    enableInfiniteLoop !== false && width > 0 ? -width : 0
  );
  const kenBurns = useSharedValue(0);
  /** UI-thread mirrors for worklet snap (avoids 50/50 stuck from JS lag). */
  const physicalIndexSV = useSharedValue(enableInfiniteLoop !== false ? 1 : 0);
  const widthSV = useSharedValue(Math.max(1, width));
  const slideCountSV = useSharedValue(1);
  const loopLenSV = useSharedValue(1);
  const useLoopSV = useSharedValue(enableInfiniteLoop !== false ? 1 : 0);
  const gestureActiveSV = useSharedValue(0);

  holdMsRef.current = resolvedHoldMs;
  slideMsRef.current = resolvedSlideMs;
  widthRef.current = width;
  widthSV.value = Math.max(1, width);

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

  const sourceKey = `${bannerAbs}|${galleryOnly.join("|")}`;
  useEffect(() => {
    setFailedUris(new Set());
  }, [sourceKey]);

  const onSlideLoadFail = useCallback(
    (uri: string) => {
      // Keep the primary banner slide even if decode fails (mint underlay stays);
      // only drop broken gallery assets so the carousel never blanks mid-loop.
      if (uri && uri === bannerAbs) return;
      setFailedUris((prev) => {
        if (prev.has(uri)) return prev;
        const next = new Set(prev);
        next.add(uri);
        return next;
      });
    },
    [bannerAbs]
  );

  const slides = useMemo(() => {
    // Banner is never dropped — even if decode fails, keep it so the card never blanks.
    const filterFailedGallery = (list: string[]) => list.filter((u) => !failedUris.has(u));
    if (bannerAbs) {
      if (!hasGallery) return [bannerAbs];
      return [bannerAbs, ...filterFailedGallery(galleryOnly)];
    }
    const gallery = filterFailedGallery(galleryOnly);
    return gallery.length > 0 ? gallery : [];
  }, [bannerAbs, galleryOnly, hasGallery, failedUris]);

  /** Gallery may rotate only after at least one gallery URI is warm — banner stays first. */
  const [galleryReadyForSlideshow, setGalleryReadyForSlideshow] = useState(false);
  const firstGalleryUri = galleryOnly[0] ?? "";

  useEffect(() => {
    setGalleryReadyForSlideshow(false);
    if (!hasGallery || !firstGalleryUri) return;
    if (isHeroMediaSessionReady(firstGalleryUri)) {
      setGalleryReadyForSlideshow(true);
      return;
    }
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    void Image.prefetch(firstGalleryUri, { cachePolicy: "memory-disk" })
      .then(() => {
        if (cancelled) return;
        markHeroMediaSessionReady(firstGalleryUri);
        setGalleryReadyForSlideshow(true);
      })
      .catch(() => {
        // Still allow slideshow after a short settle so a bad gallery URI
        // does not block forever — banner underlay covers any blank frame.
        if (cancelled) return;
        fallbackTimer = setTimeout(() => {
          if (!cancelled) setGalleryReadyForSlideshow(true);
        }, 900);
      });
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [hasGallery, firstGalleryUri]);

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
  slideCountSV.value = Math.max(1, slides.length);
  loopLenSV.value = Math.max(1, stripSlides.length);
  useLoopSV.value = useInfiniteLoop ? 1 : 0;

  const syncTranslateToPhysical = useCallback(
    (physicalIndex: number, animated: boolean) => {
      const target = -physicalIndex * widthRef.current;
      physicalIndexSV.value = physicalIndex;
      if (animated) {
        translateX.value = withTiming(target, {
          duration: slideMsRef.current,
          easing: Easing.out(Easing.cubic),
        });
      } else {
        cancelAnimation(translateX);
        translateX.value = target;
      }
    },
    [translateX, physicalIndexSV]
  );

  const resetToLogicalIndex = useCallback(
    (logicalIndex: number, animated: boolean) => {
      const physical = useInfiniteLoop ? logicalIndex + 1 : logicalIndex;
      physicalIndexRef.current = physical;
      syncTranslateToPhysical(physical, animated);
    },
    [syncTranslateToPhysical, useInfiniteLoop]
  );

  // Runs once per mounted card. Unbounded `Image.prefetch` here meant a list of
  // N cards issued N x slides downloads at once; the shared queue caps in-flight
  // work so on-screen images are not starved by off-screen ones.
  // Prefetch the first slides immediately so the card paints from disk/memory cache.
  useEffect(() => {
    if (slides.length === 0) return;
    void prefetchImagesNow(slides, Math.min(4, slides.length));
  }, [dataKey, slides]);

  useLayoutEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    physicalIndexRef.current = useInfiniteLoop ? 1 : 0;
    isAnimatingRef.current = false;
    isDraggingRef.current = false;
    resetToLogicalIndex(0, false);
  }, [dataKey, resetToLogicalIndex, slides.length, useInfiniteLoop]);

  activeIndexRef.current = activeIndex;

  useEffect(() => {
    // Never yank translate while the user is mid-swipe (causes 50/50 stuck frames).
    if (isDraggingRef.current || isAnimatingRef.current) return;
    resetToLogicalIndex(activeIndex, false);
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
        { duration: slideMsRef.current, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (!finished) {
            runOnJS(() => {
              isAnimatingRef.current = false;
            })();
            return;
          }

          if (useInfiniteLoop && nextPhysical === loopLen - 1) {
            translateX.value = -w;
            physicalIndexSV.value = 1;
            runOnJS(applyPhysicalIndex)(1, 0);
          } else if (useInfiniteLoop && nextPhysical === 0) {
            translateX.value = -len * w;
            physicalIndexSV.value = len;
            runOnJS(applyPhysicalIndex)(len, len - 1);
          } else {
            physicalIndexSV.value = nextPhysical;
            runOnJS(applyPhysicalIndex)(nextPhysical, nextLogical);
          }

          if (onComplete) runOnJS(onComplete)();
        }
      );
    },
    [applyPhysicalIndex, translateX, useInfiniteLoop, physicalIndexSV]
  );

  const startAutoLoop = useCallback(() => {
    clearHoldTimer();
    if (!showCarouselRef.current || slidesRef.current.length <= 1) return;
    holdTimerRef.current = setTimeout(() => {
      runSlide(1, startAutoLoop);
    }, holdMsRef.current);
  }, [clearHoldTimer, runSlide]);

  useEffect(() => {
    if (!showCarousel || !enableAutoRotate || !motionAllowed || !galleryReadyForSlideshow) {
      clearHoldTimer();
      return;
    }
    startAutoLoop();
    return clearHoldTimer;
  }, [
    showCarousel,
    enableAutoRotate,
    motionAllowed,
    galleryReadyForSlideshow,
    dataKey,
    clearHoldTimer,
    startAutoLoop,
  ]);

  useEffect(() => {
    if (enableKenBurns && motionAllowed && !showCarousel && slides.length === 1) {
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
  }, [enableKenBurns, motionAllowed, showCarousel, slides.length, kenBurns]);

  const resetAutoAfterGesture = useCallback(() => {
    // Horizontal card swipe can leave the list scroll-guard stuck → all cards
    // stop auto-rotating. Force settle so every carousel can resume.
    markFoodHomeListScrollEnded();
    if (showCarouselRef.current && enableAutoRotate) startAutoLoop();
  }, [startAutoLoop, enableAutoRotate]);

  const commitSwipeJS = useCallback(
    (nextPhysical: number, nextLogical: number) => {
      isDraggingRef.current = false;
      isAnimatingRef.current = false;
      physicalIndexRef.current = nextPhysical;
      applyPhysicalIndex(nextPhysical, nextLogical);
      onSwipeGesture?.();
      resetAutoAfterGesture();
      finishGesture();
    },
    [applyPhysicalIndex, finishGesture, onSwipeGesture, resetAutoAfterGesture]
  );

  const snapBackJS = useCallback(() => {
    isDraggingRef.current = false;
    isAnimatingRef.current = false;
    resetAutoAfterGesture();
    finishGesture();
  }, [finishGesture, resetAutoAfterGesture]);

  const onPanBeginJS = useCallback(() => {
    didSwipeRef.current = false;
    isDraggingRef.current = true;
    isAnimatingRef.current = false;
    clearHoldTimer();
    cancelAnimation(translateX);
    physicalIndexSV.value = physicalIndexRef.current;
    widthSV.value = Math.max(1, widthRef.current);
  }, [clearHoldTimer, translateX, physicalIndexSV, widthSV]);

  /**
   * RNGH pan on UI thread — snap always lands on a full slide (no 50/50 stuck).
   * JS bridge only for index commit + auto-loop restart.
   */
  const swipeGesture = useMemo(() => {
    if (!enableSwipe) {
      return Gesture.Tap().enabled(false);
    }
    return Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-16, 16])
      .onBegin(() => {
        "worklet";
        gestureActiveSV.value = 1;
        runOnJS(onPanBeginJS)();
      })
      .onUpdate((e) => {
        "worklet";
        if (slideCountSV.value <= 1) return;
        translateX.value = -physicalIndexSV.value * widthSV.value + e.translationX;
      })
      .onEnd((e) => {
        "worklet";
        gestureActiveSV.value = 0;
        const w = widthSV.value;
        const dx = e.translationX;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(e.translationY);
        const len = slideCountSV.value;
        const loopLen = loopLenSV.value;
        const useLoop = useLoopSV.value === 1;
        const curPhysical = physicalIndexSV.value;

        if (len <= 1 || absDx < absDy || absDx < SWIPE_THRESHOLD) {
          translateX.value = withTiming(-curPhysical * w, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
          });
          runOnJS(snapBackJS)();
          return;
        }

        const dir = dx < 0 ? 1 : -1;
        let nextPhysical = curPhysical + dir;
        let nextLogical = 0;

        if (useLoop) {
          // strip = [last, ...slides, first] → logical = physical - 1 (mod len)
          nextLogical = (((curPhysical - 1 + dir) % len) + len) % len;
          if (nextPhysical < 0) nextPhysical = 0;
          if (nextPhysical > loopLen - 1) nextPhysical = loopLen - 1;
        } else {
          nextPhysical = Math.max(0, Math.min(len - 1, nextPhysical));
          nextLogical = nextPhysical;
        }

        translateX.value = withTiming(
          -nextPhysical * w,
          { duration: 260, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (!finished) {
              runOnJS(snapBackJS)();
              return;
            }
            if (useLoop && nextPhysical === loopLen - 1) {
              translateX.value = -w;
              physicalIndexSV.value = 1;
              runOnJS(commitSwipeJS)(1, 0);
            } else if (useLoop && nextPhysical === 0) {
              translateX.value = -len * w;
              physicalIndexSV.value = len;
              runOnJS(commitSwipeJS)(len, len - 1);
            } else {
              physicalIndexSV.value = nextPhysical;
              runOnJS(commitSwipeJS)(nextPhysical, nextLogical);
            }
          }
        );
      })
      .onFinalize((_, success) => {
        "worklet";
        if (success || gestureActiveSV.value === 0) return;
        gestureActiveSV.value = 0;
        const w = widthSV.value;
        const curPhysical = physicalIndexSV.value;
        translateX.value = withTiming(-curPhysical * w, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(snapBackJS)();
      });
  }, [
    enableSwipe,
    onPanBeginJS,
    commitSwipeJS,
    snapBackJS,
    translateX,
    physicalIndexSV,
    widthSV,
    slideCountSV,
    loopLenSV,
    useLoopSV,
    gestureActiveSV,
  ]);

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
    // Prefer painting the banner URI even if the slide list is empty (edge case).
    if (bannerAbs) {
      return (
        <View style={[{ width, height }, radiusStyle, style]} collapsable={false}>
          <View style={styles.clip}>
            <BannerImage uri={bannerAbs} width={width} height={height} />
          </View>
          {dimmed ? <View style={[styles.dim, { borderRadius }]} pointerEvents="none" /> : null}
        </View>
      );
    }
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
        {enableKenBurns ? (
          <Animated.View style={[styles.singleSlideMotion, singleSlideMotionStyle]}>
            <BannerImage
              uri={slides[0]}
              width={width}
              height={height}
              onLoadFail={onSlideLoadFail}
            />
          </Animated.View>
        ) : (
          <BannerImage
            uri={slides[0]}
            width={width}
            height={height}
            onLoadFail={onSlideLoadFail}
          />
        )}
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
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.clip, { width, height }]} collapsable={false}>
          {/* Permanent banner underlay — never blank while the strip recycles / slides. */}
          {bannerAbs ? (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none" collapsable={false}>
              <BannerImage uri={bannerAbs} width={width} height={height} />
            </View>
          ) : null}
          <Animated.View
            style={[
              styles.strip,
              { width: width * stripSlides.length, height },
              stripStyle,
            ]}
          >
            {stripSlides.map((uri, i) => (
              <BannerImage
                key={`${uri}-${i}`}
                uri={uri}
                width={width}
                height={height}
                onLoadFail={onSlideLoadFail}
              />
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
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
    flexWrap: "nowrap",
    alignItems: "stretch",
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
