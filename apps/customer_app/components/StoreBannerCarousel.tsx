/**
 * Store hero carousel: banner first → gallery → loop.
 * Fixed hold + linear slide. Swipe left/right on image. Auto-advance when gallery exists.
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
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
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
  /** When true, carousel never fires onPress — parent card handles taps. */
  deferTapToParent?: boolean;
  /** Fired when user swipes horizontally (parent should skip navigation). */
  onSwipeGesture?: () => void;
};

export const LIST_CARD_CAROUSEL_HOLD_MS = 3200;
export const LIST_CARD_CAROUSEL_SLIDE_MS = 460;

const DEFAULT_HOLD = LIST_CARD_CAROUSEL_HOLD_MS;
const DEFAULT_SLIDE = LIST_CARD_CAROUSEL_SLIDE_MS;
const SWIPE_THRESHOLD = 36;

function BannerImage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  return (
    <Image
      source={{ uri }}
      style={{ width, height, backgroundColor: GatiMitraColors.mintSoft }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={uri}
      priority="high"
    />
  );
}

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
}: StoreBannerCarouselProps) {
  const resolvedHoldMs = holdMs ?? slideIntervalMs ?? initialBannerHoldMs ?? DEFAULT_HOLD;
  const resolvedSlideMs = slideMs ?? slideDurationMs ?? DEFAULT_SLIDE;

  const [activeIndex, setActiveIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState(0);

  const activeIndexRef = useRef(0);
  const slidesRef = useRef<string[]>([]);
  const isAnimatingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCarouselRef = useRef(false);
  const holdMsRef = useRef(resolvedHoldMs);
  const slideMsRef = useRef(resolvedSlideMs);
  const didSwipeRef = useRef(false);

  const slideProgress = useSharedValue(0);
  const slideDir = useSharedValue(1);

  holdMsRef.current = resolvedHoldMs;
  slideMsRef.current = resolvedSlideMs;

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

  slidesRef.current = slides;
  const dataKey = slides.join("|");
  const showCarousel = slides.length > 1;
  showCarouselRef.current = showCarousel;

  useEffect(() => {
    for (const uri of slides) {
      void Image.prefetch(uri);
    }
  }, [dataKey, slides]);

  useEffect(() => {
    setActiveIndex(0);
    setIncomingIndex(slides.length > 1 ? 1 : 0);
    activeIndexRef.current = 0;
    slideProgress.value = 0;
    slideDir.value = 1;
    isAnimatingRef.current = false;
  }, [dataKey, slideProgress, slideDir, slides.length]);

  activeIndexRef.current = activeIndex;

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
      slideProgress.value = 0;
      isAnimatingRef.current = false;
    },
    [slideProgress]
  );

  const runSlide = useCallback(
    (direction: 1 | -1, onComplete?: () => void) => {
      const len = slidesRef.current.length;
      if (len <= 1 || isAnimatingRef.current) {
        onComplete?.();
        return;
      }

      isAnimatingRef.current = true;
      slideDir.value = direction;
      const next = (activeIndexRef.current + direction + len) % len;
      setIncomingIndex(next);
      slideProgress.value = 0;
      slideProgress.value = withTiming(
        1,
        { duration: slideMsRef.current, easing: Easing.linear },
        (finished) => {
          if (finished) {
            runOnJS(commitIndex)(next);
            if (onComplete) runOnJS(onComplete)();
          } else {
            runOnJS(() => {
              isAnimatingRef.current = false;
            })();
          }
        }
      );
    },
    [commitIndex, slideDir, slideProgress]
  );

  const startAutoLoop = useCallback(() => {
    clearHoldTimer();
    if (!showCarouselRef.current || slidesRef.current.length <= 1) return;
    holdTimerRef.current = setTimeout(() => {
      runSlide(1, startAutoLoop);
    }, holdMsRef.current);
  }, [clearHoldTimer, runSlide]);

  useEffect(() => {
    if (!showCarousel) {
      clearHoldTimer();
      return;
    }
    startAutoLoop();
    return clearHoldTimer;
  }, [showCarousel, dataKey, clearHoldTimer, startAutoLoop]);

  const resetAutoAfterGesture = useCallback(() => {
    if (showCarouselRef.current) startAutoLoop();
  }, [startAutoLoop]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          enableSwipe &&
          showCarouselRef.current &&
          Math.abs(g.dx) > 8 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderGrant: () => {
          didSwipeRef.current = false;
          clearHoldTimer();
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 10) {
            if (!didSwipeRef.current) onSwipeGesture?.();
            didSwipeRef.current = true;
          }
        },
        onPanResponderRelease: (_, g) => {
          const absDx = Math.abs(g.dx);
          const absDy = Math.abs(g.dy);
          if ((didSwipeRef.current || absDx > SWIPE_THRESHOLD) && absDx > absDy) {
            didSwipeRef.current = true;
            onSwipeGesture?.();
            if (g.dx < 0) {
              runSlide(1, resetAutoAfterGesture);
            } else {
              runSlide(-1, resetAutoAfterGesture);
            }
            return;
          }
          if (!deferTapToParent && absDx < 10 && absDy < 10 && !didSwipeRef.current) {
            onPress?.();
            onPressOut?.();
          }
          resetAutoAfterGesture();
        },
        onPanResponderTerminate: () => {
          resetAutoAfterGesture();
        },
      }),
    [enableSwipe, clearHoldTimer, deferTapToParent, onPress, onPressOut, onSwipeGesture, runSlide, resetAutoAfterGesture]
  );

  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slideDir.value * slideProgress.value * width }],
  }));

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideDir.value * (width - slideProgress.value * width) }],
  }));

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
        <BannerImage uri={slides[0]} width={width} height={height} />
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

  const currentUri = slides[activeIndex];
  const incomingUri = slides[incomingIndex] ?? slides[0];

  return (
    <View style={[{ width, height }, radiusStyle, style]}>
      <View style={styles.clip} {...(enableSwipe ? panResponder.panHandlers : {})}>
        <Animated.View style={[styles.slideLayer, outgoingStyle]}>
          <BannerImage uri={currentUri} width={width} height={height} />
        </Animated.View>
        <Animated.View style={[styles.slideLayer, incomingStyle]}>
          <BannerImage uri={incomingUri} width={width} height={height} />
        </Animated.View>
        <Image
          source={{ uri: incomingUri }}
          style={styles.preload}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
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
    flex: 1,
    overflow: "hidden",
  },
  slideLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  preload: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
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
