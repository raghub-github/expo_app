/**
 * Grid-first layout hero — admin media background + store offer CTA overlay.
 * Hero media uses a compact fixed responsive height (never source dimensions).
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
import { prefetchFoodHomeImageUri, markHeroMediaSessionReady, isHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { FOOD_OFFERS_HERO_ROW_H } from "@/components/home/FoodOffersRibbonCarousel";

import {
  GRID_FIRST_HEADER_OVERLAY_H,
  GRID_FIRST_HERO_WIDTH_RATIO,
  GRID_FIRST_HERO_MIN_H,
  GRID_FIRST_HERO_MAX_SCREEN_FRAC,
  GRID_FIRST_HERO_VISIBLE_H,
  GRID_FIRST_HERO_HEIGHT_NUDGE,
  gridFirstSkySectionHeight,
} from "@/lib/gridFirstStickyLayout";

const PROMO_AUTO_MS = 5200;
/** Sky / status-bar tint for grid-first hero (keep in sync with home status bar). */
export const GRID_FIRST_SKY_TOP = "#7DD3FC";
/** Warm fallback while hero media loads — plain white until decode completes. */
export const GRID_FIRST_HERO_PLACEHOLDER = "#FFFFFF";
export { GRID_FIRST_HEADER_OVERLAY_H, GRID_FIRST_HERO_VISIBLE_H, gridFirstSkySectionHeight };

/**
 * Compact media band height — responsive width ratio, capped by viewport.
 * Ignores source aspect ratio / API aspect fields for layout.
 */
export function gridFirstHeroMediaVisibleHeight(
  screenWidth: number,
  _aspectRatio?: number | null | undefined,
  maxMediaH?: number,
  screenHeight?: number
): number {
  const w = Math.max(1, screenWidth);
  const fromWidth = Math.round(w * GRID_FIRST_HERO_WIDTH_RATIO);
  const screenCap =
    screenHeight != null && Number.isFinite(screenHeight) && screenHeight > 0
      ? Math.round(screenHeight * GRID_FIRST_HERO_MAX_SCREEN_FRAC)
      : Math.round(w * 0.55);
  const maxH =
    maxMediaH != null && Number.isFinite(maxMediaH)
      ? Math.min(maxMediaH, screenCap)
      : screenCap;
  return (
    Math.round(Math.min(maxH, Math.max(GRID_FIRST_HERO_MIN_H, fromWidth))) +
    GRID_FIRST_HERO_HEIGHT_NUDGE
  );
}

/** Full immersive sky height for the compact hero band (header overlays the media). */
export function gridFirstSkyHeightForAspect(
  topInset: number,
  screenWidth: number,
  screenHeight: number,
  _aspectRatio?: number | null | undefined
): number {
  const mediaH = gridFirstHeroMediaVisibleHeight(
    screenWidth,
    null,
    Math.round(screenHeight * GRID_FIRST_HERO_MAX_SCREEN_FRAC),
    screenHeight
  );
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
  onPress,
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
  onPress: () => void;
  onMediaReady?: () => void;
  hideSlidePlaceholder?: boolean;
  placeholderColor?: string;
}) {
  const hasMedia = !!slide.mediaUrl && !imageFailed;
  const showVideo = slide.kind === "video" && hasMedia;
  const playVideo = showVideo && isActive && shouldPlay;
  const sessionHit = isHeroMediaSessionReady(slide.mediaUrl);
  const lastGoodUrlRef = useRef<string | null>(sessionHit ? slide.mediaUrl : null);

  useEffect(() => {
    if (isHeroMediaSessionReady(slide.mediaUrl)) {
      lastGoodUrlRef.current = slide.mediaUrl;
      onMediaReady?.();
    }
  }, [slide.mediaUrl, slide.id, onMediaReady]);

  const onImageLoad = useCallback(
    (_e: ImageLoadEventData) => {
      if (slide.mediaUrl) {
        lastGoodUrlRef.current = slide.mediaUrl;
        markHeroMediaSessionReady(slide.mediaUrl);
      }
      onMediaReady?.();
    },
    [onMediaReady, slide.mediaUrl]
  );

  const displayUri = slide.mediaUrl ?? lastGoodUrlRef.current;

  const content = (
    <>
      {/* Soft shell only until media paints — never cover an already-loaded video/image. */}
      {!sessionHit && !hideSlidePlaceholder ? <HeroPlaceholder color={placeholderColor} /> : null}

      {showVideo ? (
        <GridFirstHeroVideo
          uri={slide.mediaUrl!}
          shouldPlay={playVideo}
          onReady={() => {
            markHeroMediaSessionReady(slide.mediaUrl);
            onMediaReady?.();
          }}
          onAspectRatio={undefined}
        />
      ) : displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={styles.heroMedia}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={isActive ? "high" : "normal"}
          transition={0}
          recyclingKey={slide.id}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : (
        <HeroPlaceholder color={placeholderColor} />
      )}
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

  // Compact responsive band — never derive height from source media dimensions.
  const mediaVisibleH = useMemo(() => {
    const cappedMax = Math.round(windowHeight * GRID_FIRST_HERO_MAX_SCREEN_FRAC);
    return gridFirstHeroMediaVisibleHeight(slideWidth, null, cappedMax, windowHeight);
  }, [slideWidth, windowHeight]);

  const slideHeight = immersive
    ? gridFirstSkyHeightForAspect(topInset, slideWidth, windowHeight, null)
    : mediaVisibleH;

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
    // If any slide was already decoded this session, mark hero ready immediately.
    if (slides.some((s) => isHeroMediaSessionReady(s.mediaUrl))) {
      onHeroReadyChange?.(true);
    }
  }, [slides, onHeroReadyChange]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
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

  const firstSlide = slides[0];
  const prevFirstSlideIdRef = useRef<string | undefined>(undefined);
  const allSlidesFailed =
    slides.length > 0 && slides.every((slide) => failedIds.has(slide.id));

  useEffect(() => {
    const id = firstSlide?.id;
    if (allSlidesFailed) {
      onHeroReadyChange?.(false);
      prevFirstSlideIdRef.current = id;
      return;
    }
    // Never hide a hero that already decoded this session (navigate away/back).
    if (isHeroMediaSessionReady(firstSlide?.mediaUrl)) {
      onHeroReadyChange?.(true);
      prevFirstSlideIdRef.current = id;
      return;
    }
    prevFirstSlideIdRef.current = id;
    if (!id) onHeroReadyChange?.(false);
  }, [firstSlide?.id, firstSlide?.mediaUrl, allSlidesFailed, onHeroReadyChange]);

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
        {slides.map((slide, index) => (
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
              hideSlidePlaceholder={immersive}
              placeholderColor={placeholderColor}
              onMediaReady={
                index === 0
                  ? () => {
                      markHeroMediaSessionReady(slide.mediaUrl);
                      onHeroReadyChange?.(true);
                    }
                  : undefined
              }
            />
          ))}
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
