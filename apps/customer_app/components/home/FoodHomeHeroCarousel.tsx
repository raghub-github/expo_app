/**
 * Grid-first layout hero — admin media background + store offer CTA overlay.
 * Hero height auto-fits the active slide's image/video aspect ratio.
 */

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo, memo } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { GridFirstHeroVideo } from "@/components/home/GridFirstHeroVideo";
import { Image, type ImageLoadEventData } from "expo-image";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import type { HomeBannerOffer } from "@/services/offers.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { prefetchFoodHomeImageUri } from "@/lib/prefetchGridFirstHeroMedia";
import { FOOD_OFFERS_HERO_ROW_H } from "@/components/home/FoodOffersRibbonCarousel";

import {
  GRID_FIRST_HEADER_OVERLAY_H,
  GRID_FIRST_HERO_VISIBLE_H,
  gridFirstSkySectionHeight,
} from "@/lib/gridFirstStickyLayout";

const PROMO_AUTO_MS = 5200;
/** Only mount hero slides near the active index (avoids decoding every video at once). */
const SLIDE_WINDOW = 1;
/** Sky / status-bar tint for grid-first hero (keep in sync with home status bar). */
export const GRID_FIRST_SKY_TOP = "#7DD3FC";
/** Warm fallback while hero media loads — plain white until decode completes. */
export const GRID_FIRST_HERO_PLACEHOLDER = "#FFFFFF";
export { GRID_FIRST_HEADER_OVERLAY_H, GRID_FIRST_HERO_VISIBLE_H, gridFirstSkySectionHeight };

const HERO_VISIBLE_H = GRID_FIRST_HERO_VISIBLE_H;
const HERO_MEDIA_MIN_H = 130;

/** Clamp media band height from width ÷ (width/height aspect). */
export function gridFirstHeroMediaVisibleHeight(
  screenWidth: number,
  aspectRatio: number | null | undefined,
  maxMediaH = 380
): number {
  const w = Math.max(1, screenWidth);
  const ar =
    aspectRatio != null && Number.isFinite(aspectRatio) && aspectRatio > 0.15 && aspectRatio <= 8
      ? aspectRatio
      : w / HERO_VISIBLE_H;
  const raw = w / ar;
  const maxH = Math.min(maxMediaH, Math.round(w * 1.2));
  return Math.round(Math.min(maxH, Math.max(HERO_MEDIA_MIN_H, raw)));
}

/** Full immersive sky height from media aspect (header overlays the media). */
export function gridFirstSkyHeightForAspect(
  topInset: number,
  screenWidth: number,
  screenHeight: number,
  aspectRatio: number | null | undefined
): number {
  const cappedMax = Math.min(380, Math.round(screenHeight * 0.42));
  const mediaH = gridFirstHeroMediaVisibleHeight(screenWidth, aspectRatio, cappedMax);
  return gridFirstSkySectionHeight(topInset, mediaH);
}

type Slide = {
  id: string;
  kind: "image" | "video";
  mediaUrl: string | null;
  storeId: string;
  aspectRatio: number | null;
};

function normalizeAspect(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0.15 || n > 8) return null;
  return Number(n.toFixed(4));
}

/** Uploaded grid-first media only — never store banners or promo fallbacks. */
function buildSlides(
  heroMedia: GridFirstHeroMediaItem[],
  offers: HomeBannerOffer[]
): Slide[] {
  const merchantOffers = offers.filter((o) => o.kind === "merchant" && o.store_id?.trim());
  const slides: Slide[] = [];
  for (const [index, item] of heroMedia.entries()) {
    const raw = item.url?.trim() || null;
    const mediaUrl = raw ? toAbsoluteImageUrl(raw) ?? raw : null;
    if (!mediaUrl) continue;
    const offer = merchantOffers.length > 0 ? merchantOffers[index % merchantOffers.length] : undefined;
    slides.push({
      id: item.id,
      kind: item.kind,
      mediaUrl,
      storeId: offer?.store_id?.trim() ?? "",
      aspectRatio: normalizeAspect(item.aspectRatio),
    });
  }
  return slides;
}

/** True when at least one hero slide can render (valid media URL). */
export function hasGridFirstHeroSlides(
  heroMedia: GridFirstHeroMediaItem[] = [],
  offers: HomeBannerOffer[] = []
): boolean {
  return buildSlides(heroMedia, offers).length > 0;
}

type Props = {
  heroMedia?: GridFirstHeroMediaItem[];
  offers?: HomeBannerOffer[];
  embeddedInSky?: boolean;
  immersive?: boolean;
  topInset?: number;
  /** Fires when total sky/hero height changes (immersive parent should resize). */
  onHeroHeightChange?: (totalHeight: number) => void;
  /** Lets the parent keep compact chrome until the first hero is decoded. */
  onHeroReadyChange?: (ready: boolean) => void;
  /** Flat placeholder behind hero media while it decodes (grocery uses page bg). */
  placeholderColor?: string;
  /** Pause video decode/playback while scrolling away or tab blurred. */
  shouldPlay?: boolean;
};

function HeroPlaceholder({ color }: { color?: string }) {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: color ?? "#FFFFFF" },
      ]}
    />
  );
}

const HeroMediaSlide = memo(function HeroMediaSlide({
  slide,
  slideWidth,
  slideHeight,
  imageFailed,
  onImageError,
  isActive,
  shouldPlay,
  mounted,
  onPress,
  onAspectRatio,
  onMediaReady,
  hideSlidePlaceholder = false,
  placeholderColor,
}: {
  slide: Slide;
  slideWidth: number;
  slideHeight: number;
  imageFailed: boolean;
  onImageError: () => void;
  isActive: boolean;
  shouldPlay: boolean;
  mounted: boolean;
  onPress: () => void;
  onAspectRatio?: (ratio: number) => void;
  onMediaReady?: () => void;
  hideSlidePlaceholder?: boolean;
  placeholderColor?: string;
}) {
  const hasMedia = !!slide.mediaUrl && !imageFailed;
  const showVideo = mounted && slide.kind === "video" && hasMedia;
  const playVideo = showVideo && isActive && shouldPlay;
  const [imageReady, setImageReady] = useState(false);
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    setImageReady(false);
    reportedRef.current = null;
  }, [slide.mediaUrl, slide.id]);

  const reportAspect = useCallback(
    (width: number, height: number) => {
      if (!onAspectRatio || !(width > 0) || !(height > 0)) return;
      const key = `${slide.id}:${Math.round(width)}x${Math.round(height)}`;
      if (reportedRef.current === key) return;
      reportedRef.current = key;
      const ratio = normalizeAspect(width / height);
      if (ratio) onAspectRatio(ratio);
    },
    [onAspectRatio, slide.id]
  );

  const onImageLoad = useCallback(
    (e: ImageLoadEventData) => {
      setImageReady(true);
      onMediaReady?.();
      const src = e.source;
      if (src?.width && src?.height) reportAspect(src.width, src.height);
    },
    [onMediaReady, reportAspect]
  );

  const content = !mounted ? (
    <HeroPlaceholder color={placeholderColor} />
  ) : (
    <>
      {!hideSlidePlaceholder ? <HeroPlaceholder color={placeholderColor} /> : null}

      {showVideo && playVideo ? (
        <GridFirstHeroVideo
          uri={slide.mediaUrl!}
          shouldPlay
          onReady={onMediaReady}
          onAspectRatio={
            onAspectRatio
              ? (ratio) => {
                  if (ratio > 0.15 && ratio <= 8) onAspectRatio(ratio);
                }
              : undefined
          }
        />
      ) : showVideo ? (
        <HeroPlaceholder color={placeholderColor} />
      ) : slide.kind === "video" && hasMedia ? null : hasMedia ? (
        <Image
          source={{ uri: slide.mediaUrl! }}
          style={[styles.heroMedia, { opacity: imageReady ? 1 : 0 }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={isActive ? "high" : "normal"}
          transition={0}
          recyclingKey={slide.mediaUrl!}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : null}
    </>
  );

  return (
    <TouchableOpacity
      style={[
        styles.slide,
        hideSlidePlaceholder ? styles.slideImmersive : null,
        { width: slideWidth, height: slideHeight },
      ]}
      activeOpacity={slide.storeId ? 0.96 : 1}
      onPress={slide.storeId ? onPress : undefined}
      disabled={!slide.storeId}
    >
      {content}
    </TouchableOpacity>
  );
});

export function FoodHomeHeroCarousel({
  heroMedia = [],
  offers = [],
  embeddedInSky = false,
  immersive = false,
  topInset = 0,
  onHeroHeightChange,
  onHeroReadyChange,
  placeholderColor,
  shouldPlay = true,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [measuredAspectById, setMeasuredAspectById] = useState<Record<string, number>>({});
  const lastReportedHeightRef = useRef<number | null>(null);

  const slides = useMemo(
    () => buildSlides(heroMedia, offers),
    [heroMedia, offers]
  );

  const slideWidth = layoutWidth > 0 ? layoutWidth : windowWidth;

  const onHeroLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setLayoutWidth((prev) => (prev === w ? prev : w));
  }, []);

  const activeSlide = slides[Math.min(activeIndex, Math.max(0, slides.length - 1))];
  const activeAspect =
    activeSlide?.aspectRatio ??
    (activeSlide ? measuredAspectById[activeSlide.id] : null) ??
    null;

  const mediaVisibleH = useMemo(() => {
    const cappedMax = Math.min(380, Math.round(windowHeight * 0.42));
    return gridFirstHeroMediaVisibleHeight(slideWidth, activeAspect, cappedMax);
  }, [slideWidth, windowHeight, activeAspect]);

  const slideHeight = immersive
    ? gridFirstSkyHeightForAspect(topInset, slideWidth, windowHeight, activeAspect)
    : Math.max(200, mediaVisibleH + 22);

  useEffect(() => {
    if (!onHeroHeightChange || slides.length === 0) return;
    if (lastReportedHeightRef.current === slideHeight) return;
    lastReportedHeightRef.current = slideHeight;
    onHeroHeightChange(slideHeight);
  }, [slideHeight, onHeroHeightChange, slides.length]);

  useLayoutEffect(() => {
    for (const slide of slides) {
      if (slide.kind === "image" && slide.mediaUrl) {
        prefetchFoodHomeImageUri(slide.mediaUrl);
      }
    }
  }, [slides]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    setMeasuredAspectById({});
    lastReportedHeightRef.current = null;
  }, [slides.map((s) => s.id).join("|"), slideWidth]);

  useEffect(() => {
    if (slides.length < 2 || !shouldPlay) return;
    const active = slides[Math.min(activeIndex, slides.length - 1)];
    if (active?.kind === "video") return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
        return next;
      });
    }, PROMO_AUTO_MS);
    return () => clearInterval(timer);
  }, [slides.length, slideWidth, shouldPlay]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / slideWidth);
      setActiveIndex(idx);
    },
    [slideWidth]
  );

  const onPress = (slide: Slide) => {
    if (slide.storeId) {
      navigateToMerchant(router, queryClient, slide.storeId);
    }
  };

  const onSlideAspect = useCallback((slideId: string, ratio: number) => {
    setMeasuredAspectById((prev) => {
      if (prev[slideId] === ratio) return prev;
      const slide = slides.find((s) => s.id === slideId);
      if (slide?.kind === "video" && prev[slideId] != null) return prev;
      return { ...prev, [slideId]: ratio };
    });
  }, [slides]);

  const firstSlide = slides[0];
  const prevFirstSlideIdRef = useRef<string | undefined>(undefined);
  const allSlidesFailed =
    slides.length > 0 && slides.every((slide) => failedIds.has(slide.id));

  useEffect(() => {
    const id = firstSlide?.id;
    if (
      prevFirstSlideIdRef.current !== undefined &&
      prevFirstSlideIdRef.current !== id
    ) {
      onHeroReadyChange?.(false);
    }
    prevFirstSlideIdRef.current = id;
    if (!id || allSlidesFailed) onHeroReadyChange?.(false);
  }, [firstSlide?.id, allSlidesFailed, onHeroReadyChange]);

  if (slides.length === 0) {
    return null;
  }

  return (
    <View
      onLayout={onHeroLayout}
      style={[
        styles.wrap,
        embeddedInSky && styles.wrapEmbedded,
        immersive && embeddedInSky && styles.wrapImmersiveAbsolute,
        placeholderColor ? { backgroundColor: placeholderColor } : null,
        { height: slideHeight, width: slideWidth || "100%" },
      ]}
    >
      {immersive ? <HeroPlaceholder color={placeholderColor} /> : null}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        delaysContentTouches={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={[immersive ? styles.scrollImmersive : undefined, { width: slideWidth || "100%" }]}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide, index) => {
          const mounted = Math.abs(index - activeIndex) <= SLIDE_WINDOW;
          return (
            <HeroMediaSlide
              key={slide.id}
              slide={slide}
              slideWidth={slideWidth}
              slideHeight={slideHeight}
              onPress={() => onPress(slide)}
              imageFailed={failedIds.has(slide.id)}
              onImageError={() => setFailedIds((s) => new Set(s).add(slide.id))}
              isActive={index === activeIndex}
              shouldPlay={shouldPlay}
              mounted={mounted}
              hideSlidePlaceholder={immersive}
              placeholderColor={placeholderColor}
              onAspectRatio={
                slide.aspectRatio
                  ? undefined
                  : (ratio) => onSlideAspect(slide.id, ratio)
              }
              onMediaReady={
                index === 0 ? () => onHeroReadyChange?.(true) : undefined
              }
            />
          );
        })}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={[styles.dots, immersive && styles.dotsImmersive]}>
          {slides.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 0,
    backgroundColor: GRID_FIRST_HERO_PLACEHOLDER,
  },
  wrapEmbedded: {
    marginTop: 0,
  },
  wrapImmersiveAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    overflow: "hidden",
  },
  scrollImmersive: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "stretch",
  },
  slide: {
    overflow: "hidden",
    backgroundColor: GRID_FIRST_HERO_PLACEHOLDER,
  },
  slideImmersive: {
    backgroundColor: "transparent",
  },
  heroMedia: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 2,
  },
  dotsImmersive: {
    position: "absolute",
    bottom: FOOD_OFFERS_HERO_ROW_H + 6,
    left: 0,
    right: 0,
    marginTop: 0,
    marginBottom: 0,
    zIndex: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dotActive: {
    width: 16,
    backgroundColor: GatiMitraColors.primaryMint,
  },
});
