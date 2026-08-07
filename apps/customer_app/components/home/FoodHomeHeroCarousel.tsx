/**
 * Grid-first layout hero — admin media background + store offer CTA overlay.
 * Hero height auto-fits the active slide's image/video aspect ratio.
 */

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Image, type ImageLoadEventData } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { GridFirstHeroMediaItem } from "@/lib/gridFirstHeroMedia";
import type { HomeBannerOffer } from "@/services/offers.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getAppAssetUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import { prefetchFoodHomeImageUri } from "@/lib/prefetchGridFirstHeroMedia";
import { AppText } from "@/components/AppText";
import {
  GridFirstDefaultHeroBg,
  GRID_FIRST_DEFAULT_HERO_BASE,
} from "@/components/home/GridFirstDefaultHeroBg";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import type { MerchantSummary } from "@/services/merchant.service";

const PROMO_AUTO_MS = 5200;
/** Sky / status-bar tint for grid-first hero (keep in sync with home status bar). */
export const GRID_FIRST_SKY_TOP = "#7DD3FC";
/** Warm fallback while hero media loads — Swiggy-style cream. */
export const GRID_FIRST_HERO_PLACEHOLDER = GRID_FIRST_DEFAULT_HERO_BASE;
const FOOD_PROMO_ASSET_KEYS = [CX.home.promoOffer, CX.home.promoOffer2] as const;
/** Header row + search — overlay height on hero (excl. status bar). */
export const GRID_FIRST_HEADER_OVERLAY_H = 122;
/** Default media band when aspect ratio is unknown (legacy look). */
const HERO_VISIBLE_H = 210;
export const GRID_FIRST_HERO_VISIBLE_H = HERO_VISIBLE_H;

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

export function gridFirstSkySectionHeight(
  topInset: number,
  mediaVisibleH: number = HERO_VISIBLE_H
): number {
  return topInset + GRID_FIRST_HEADER_OVERLAY_H + mediaVisibleH;
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
  cta: string | null;
  storeId: string;
  aspectRatio: number | null;
};

/** CTA from active store offer only — no generic fallback text. */
function merchantOfferCta(offer: HomeBannerOffer): string | null {
  if (offer.kind !== "merchant" || !offer.store_id?.trim()) return null;

  const min = offer.min_order_amount;
  if (min != null && min > 0) {
    return `Min ₹${Math.round(min)} OFF & more`;
  }

  const pct = offer.discount_percentage;
  if (pct != null && pct > 0) {
    return `Flat ${Math.round(pct)}% OFF & more`;
  }

  const val = offer.discount_value;
  if (val != null && val > 0) {
    return `Flat ₹${Math.round(val)} OFF & more`;
  }

  const max = offer.max_discount_amount;
  if (max != null && max > 0) {
    return `Up to ₹${Math.round(max)} OFF & more`;
  }

  const type = String(offer.offer_type ?? "").toUpperCase();
  if (type === "FREE_DELIVERY") return "Free delivery & more";

  const title = offer.title?.trim();
  if (title) {
    const short = title.length > 28 ? `${title.slice(0, 25)}…` : title;
    return `${short} & more`;
  }

  return null;
}

function defaultPromoHeroUrl(index: number): string | null {
  const key = FOOD_PROMO_ASSET_KEYS[index % FOOD_PROMO_ASSET_KEYS.length];
  return getAppAssetUrl(key);
}

function merchantOfferHeroUrl(offer: HomeBannerOffer): string | null {
  if (offer.kind !== "merchant") return null;
  const raw = offer.offer_image_url?.trim();
  if (!raw) return null;
  return toAbsoluteImageUrl(raw) ?? raw;
}

function normalizeAspect(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0.15 || n > 8) return null;
  return Number(n.toFixed(4));
}

function buildSlides(
  heroMedia: GridFirstHeroMediaItem[],
  offers: HomeBannerOffer[],
  merchantFallbackUris: string[] = []
): Slide[] {
  const merchantOffers = offers.filter((o) => o.kind === "merchant" && o.store_id?.trim());

  const mapWithOffers = (
    mediaSlides: Array<{
      id: string;
      kind: "image" | "video";
      mediaUrl: string | null;
      aspectRatio: number | null;
    }>
  ): Slide[] =>
    mediaSlides.map((media, index) => {
      const offer =
        merchantOffers.length > 0
          ? merchantOffers[index % merchantOffers.length]
          : undefined;
      const cta = offer ? merchantOfferCta(offer) : null;
      const fallbackUrl =
        !media.mediaUrl && offer
          ? merchantOfferHeroUrl(offer) ??
            merchantFallbackUris[index % Math.max(merchantFallbackUris.length, 1)] ??
            defaultPromoHeroUrl(index)
          : !media.mediaUrl
            ? merchantFallbackUris[index] ?? defaultPromoHeroUrl(index)
            : null;
      return {
        ...media,
        mediaUrl: media.mediaUrl ?? fallbackUrl ?? null,
        cta,
        storeId: cta && offer?.store_id?.trim() ? offer.store_id.trim() : "",
      };
    });

  if (heroMedia.length > 0) {
    const mediaSlides = heroMedia.map((item) => {
      const raw = item.url?.trim() || null;
      return {
        id: item.id,
        kind: item.kind,
        mediaUrl: raw ? toAbsoluteImageUrl(raw) ?? raw : null,
        aspectRatio: normalizeAspect(item.aspectRatio),
      };
    });
    return mapWithOffers(mediaSlides);
  }

  if (merchantOffers.length > 0) {
    return merchantOffers.slice(0, 6).map((offer, index) => {
      const cta = merchantOfferCta(offer);
      return {
        id: `offer-${offer.id}`,
        kind: "image" as const,
        mediaUrl:
          merchantOfferHeroUrl(offer) ??
          merchantFallbackUris[index % Math.max(merchantFallbackUris.length, 1)] ??
          defaultPromoHeroUrl(index),
        cta,
        storeId: cta && offer.store_id?.trim() ? offer.store_id.trim() : "",
        aspectRatio: null,
      };
    });
  }

  if (merchantFallbackUris.length > 0) {
    return merchantFallbackUris.slice(0, 6).map((uri, index) => ({
      id: `merchant-hero-${index}`,
      kind: "image" as const,
      mediaUrl: uri,
      cta: null,
      storeId: "",
      aspectRatio: null,
    }));
  }

  const promo = defaultPromoHeroUrl(0);
  if (promo) {
    return mapWithOffers([
      { id: "hero-promo", kind: "image" as const, mediaUrl: promo, aspectRatio: null },
    ]);
  }

  return [
    {
      id: "hero-default-pattern",
      kind: "image",
      mediaUrl: null,
      cta: null,
      storeId: "",
      aspectRatio: null,
    },
  ];
}

type Props = {
  heroMedia?: GridFirstHeroMediaItem[];
  offers?: HomeBannerOffer[];
  /** Nearby store banners — used when state has no grid_first hero media. */
  merchantFallbacks?: MerchantSummary[];
  embeddedInSky?: boolean;
  immersive?: boolean;
  topInset?: number;
  /** Fires when total sky/hero height changes (immersive parent should resize). */
  onHeroHeightChange?: (totalHeight: number) => void;
  /** Lets the parent keep compact chrome until the first hero is decoded. */
  onHeroReadyChange?: (ready: boolean) => void;
};

function HeroMediaSlide({
  slide,
  slideWidth,
  slideHeight,
  imageFailed,
  onImageError,
  isActive,
  onPress,
  onAspectRatio,
  onMediaReady,
}: {
  slide: Slide;
  slideWidth: number;
  slideHeight: number;
  imageFailed: boolean;
  onImageError: () => void;
  isActive: boolean;
  onPress: () => void;
  onAspectRatio?: (ratio: number) => void;
  onMediaReady?: () => void;
}) {
  const hasMedia = !!slide.mediaUrl && !imageFailed;
  const hasCta = !!slide.cta?.trim();
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

  const content = (
    <>
      <GridFirstDefaultHeroBg />

      {slide.kind === "video" && hasMedia ? (
        <Video
          source={{ uri: slide.mediaUrl! }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping
          isMuted
          useNativeControls={false}
          onReadyForDisplay={(ev) => {
            onMediaReady?.();
            const nat = ev.naturalSize;
            if (nat?.width && nat?.height) {
              reportAspect(nat.width, nat.height);
            }
          }}
        />
      ) : hasMedia ? (
        <Image
          source={{ uri: slide.mediaUrl! }}
          style={[StyleSheet.absoluteFill, { opacity: imageReady ? 1 : 0 }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          recyclingKey={slide.mediaUrl!}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : null}

      {hasCta ? (
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={styles.ctaPill}
            activeOpacity={0.9}
            onPress={onPress}
            accessibilityRole="button"
          >
            <AppText style={styles.ctaText}>{slide.cta}</AppText>
            <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.slide, { width: slideWidth, height: slideHeight }]}>
      {content}
    </View>
  );
}

export function FoodHomeHeroCarousel({
  heroMedia = [],
  offers = [],
  merchantFallbacks = [],
  embeddedInSky = false,
  immersive = false,
  topInset = 0,
  onHeroHeightChange,
  onHeroReadyChange,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  useAppAssetsStore((s) => s.assets);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [measuredAspectById, setMeasuredAspectById] = useState<Record<string, number>>({});
  const lastReportedHeightRef = useRef<number | null>(null);

  const merchantFallbackUris = useMemo(() => {
    const uris: string[] = [];
    const seen = new Set<string>();
    for (const m of merchantFallbacks) {
      const uri = resolveMerchantBannerUri(m);
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      uris.push(uri);
      if (uris.length >= 6) break;
    }
    return uris;
  }, [merchantFallbacks]);

  const slides = useMemo(
    () => buildSlides(heroMedia, offers, merchantFallbackUris),
    [heroMedia, offers, merchantFallbackUris]
  );

  const activeSlide = slides[Math.min(activeIndex, Math.max(0, slides.length - 1))];
  const activeAspect =
    (activeSlide ? measuredAspectById[activeSlide.id] : null) ??
    activeSlide?.aspectRatio ??
    null;

  const mediaVisibleH = useMemo(() => {
    const cappedMax = Math.min(380, Math.round(windowHeight * 0.42));
    return gridFirstHeroMediaVisibleHeight(windowWidth, activeAspect, cappedMax);
  }, [windowWidth, windowHeight, activeAspect]);

  const slideHeight = immersive
    ? gridFirstSkyHeightForAspect(topInset, windowWidth, windowHeight, activeAspect)
    : Math.max(200, mediaVisibleH + 22);

  useEffect(() => {
    if (!onHeroHeightChange) return;
    if (lastReportedHeightRef.current === slideHeight) return;
    lastReportedHeightRef.current = slideHeight;
    onHeroHeightChange(slideHeight);
  }, [slideHeight, onHeroHeightChange]);

  useLayoutEffect(() => {
    for (const slide of slides) {
      if (slide.kind === "image" && slide.mediaUrl) {
        prefetchFoodHomeImageUri(slide.mediaUrl);
      }
    }
    for (const key of FOOD_PROMO_ASSET_KEYS) {
      const promoUri = getAppAssetUrl(key);
      if (promoUri) prefetchFoodHomeImageUri(promoUri);
    }
  }, [slides]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    setMeasuredAspectById({});
    lastReportedHeightRef.current = null;
  }, [slides.map((s) => s.id).join("|")]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * windowWidth, animated: true });
        return next;
      });
    }, PROMO_AUTO_MS);
    return () => clearInterval(timer);
  }, [slides.length, windowWidth]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / windowWidth);
      setActiveIndex(idx);
    },
    [windowWidth]
  );

  const onPress = (slide: Slide) => {
    if (slide.storeId) {
      navigateToMerchant(router, queryClient, slide.storeId);
    }
  };

  const onSlideAspect = useCallback((slideId: string, ratio: number) => {
    setMeasuredAspectById((prev) => {
      if (prev[slideId] === ratio) return prev;
      return { ...prev, [slideId]: ratio };
    });
  }, []);

  const firstSlide = slides[0];
  const prevFirstSlideIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const id = firstSlide?.id;
    // Only clear ready when the lead slide actually changes — not on every mount.
    if (
      prevFirstSlideIdRef.current !== undefined &&
      prevFirstSlideIdRef.current !== id
    ) {
      onHeroReadyChange?.(false);
    }
    prevFirstSlideIdRef.current = id;
  }, [firstSlide?.id, onHeroReadyChange]);

  if (slides.length === 0) {
    if (!immersive) return null;
    return (
      <View style={[styles.wrap, { height: slideHeight }]}>
        <GridFirstDefaultHeroBg />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        embeddedInSky && styles.wrapEmbedded,
        immersive && embeddedInSky && styles.wrapImmersiveAbsolute,
        // Always pin height to aspect-based slideHeight so we never leave a cream band
        // under a shorter slide inside a taller absolute-fill parent.
        { height: slideHeight },
      ]}
    >
      {/* Cream placeholder only — never a second copy of slide-0 media (that caused vertical double-image). */}
      {immersive ? <GridFirstDefaultHeroBg /> : null}
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
        scrollEventThrottle={16}
        style={immersive ? styles.scrollImmersive : undefined}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide, index) => (
          <HeroMediaSlide
            key={slide.id}
            slide={slide}
            slideWidth={windowWidth}
            slideHeight={slideHeight}
            onPress={() => onPress(slide)}
            imageFailed={failedIds.has(slide.id)}
            onImageError={() => setFailedIds((s) => new Set(s).add(slide.id))}
            isActive={index === activeIndex}
            onAspectRatio={
              slide.aspectRatio
                ? undefined
                : (ratio) => onSlideAspect(slide.id, ratio)
            }
            onMediaReady={
              index === 0 ? () => onHeroReadyChange?.(true) : undefined
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
    overflow: "hidden",
  },
  scrollImmersive: {
    width: "100%",
    height: "100%",
  },
  scrollContent: {
    alignItems: "stretch",
  },
  slide: {
    overflow: "hidden",
    backgroundColor: GRID_FIRST_HERO_PLACEHOLDER,
  },
  ctaWrap: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#000000",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#171717",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
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
    bottom: 6,
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
