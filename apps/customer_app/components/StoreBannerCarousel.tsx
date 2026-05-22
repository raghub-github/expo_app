/**
 * Store hero carousel: static banner when no gallery.
 * With gallery: horizontal slide — current exits left, next enters from right; seamless loop.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Image, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
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
  initialBannerHoldMs?: number;
  slideIntervalMs?: number;
  slideDurationMs?: number;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
  showDots?: boolean;
  /** Never show cutlery icon — gradient only (cards). */
  hidePlaceholderIcon?: boolean;
};

const DEFAULT_HOLD = 3200;
const DEFAULT_INTERVAL = 5000;
const DEFAULT_SLIDE = 720;

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
  initialBannerHoldMs = DEFAULT_HOLD,
  slideIntervalMs = DEFAULT_INTERVAL,
  slideDurationMs = DEFAULT_SLIDE,
  style,
  dimmed = false,
  showDots = true,
  hidePlaceholderIcon = false,
}: StoreBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const activeIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideProgress = useSharedValue(0);

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
    if (!hasGallery) return bannerAbs ? [bannerAbs] : [];
    return buildSlides(bannerAbs, galleryOnly);
  }, [bannerAbs, galleryOnly, hasGallery]);

  const dataKey = slides.join("|");
  const showCarousel = hasGallery && slides.length > 1;

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    slideProgress.value = 0;
    isAnimatingRef.current = false;
    setCanAdvance(!hasGallery);
  }, [dataKey, hasGallery, slideProgress]);

  useEffect(() => {
    if (!hasGallery) return;
    const t = setTimeout(() => setCanAdvance(true), initialBannerHoldMs);
    return () => clearTimeout(t);
  }, [hasGallery, initialBannerHoldMs, dataKey]);

  activeIndexRef.current = activeIndex;
  const nextIndex = slides.length > 0 ? (activeIndex + 1) % slides.length : 0;

  const commitNextIndex = useCallback(
    (next: number) => {
      activeIndexRef.current = next;
      setActiveIndex(next);
      slideProgress.value = 0;
      isAnimatingRef.current = false;
    },
    [slideProgress]
  );

  const runSlideToNext = useCallback(() => {
    if (slides.length <= 1 || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const next = (activeIndexRef.current + 1) % slides.length;
    slideProgress.value = 0;
    slideProgress.value = withTiming(
      1,
      { duration: slideDurationMs, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(commitNextIndex)(next);
        } else {
          runOnJS(() => {
            isAnimatingRef.current = false;
          })();
        }
      }
    );
  }, [slides.length, slideDurationMs, slideProgress, commitNextIndex]);

  useEffect(() => {
    if (!showCarousel || !canAdvance || slides.length <= 1) return;
    timerRef.current = setInterval(runSlideToNext, slideIntervalMs);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showCarousel, canAdvance, slides.length, runSlideToNext, slideIntervalMs]);

  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slideProgress.value * width }],
  }));

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: width - slideProgress.value * width }],
  }));

  const radiusStyle = {
    borderTopLeftRadius: borderRadius,
    borderTopRightRadius: borderRadius,
    overflow: "hidden" as const,
  };

  const imageStyle = [styles.image, { width, height }];

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
    return (
      <View style={[{ width, height }, radiusStyle, style]}>
        <Image source={{ uri: slides[0] }} style={imageStyle} resizeMode="cover" />
        {dimmed ? <View style={[styles.dim, { borderRadius }]} pointerEvents="none" /> : null}
      </View>
    );
  }

  const currentUri = slides[activeIndex];
  const incomingUri = slides[nextIndex];

  return (
    <View style={[{ width, height }, radiusStyle, style]}>
      <View style={styles.clip}>
        <Animated.View style={[styles.slideLayer, outgoingStyle]}>
          <Image source={{ uri: currentUri }} style={imageStyle} resizeMode="cover" />
        </Animated.View>
        <Animated.View style={[styles.slideLayer, incomingStyle]}>
          <Image source={{ uri: incomingUri }} style={imageStyle} resizeMode="cover" />
        </Animated.View>
        <Image source={{ uri: incomingUri }} style={styles.preload} resizeMode="cover" />
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
  image: {
    width: "100%",
    height: "100%",
  },
  preload: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
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
