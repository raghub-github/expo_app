/**
 * Grid-first layout hero — admin media background + store offer CTA overlay.
 */

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Image } from "expo-image";
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
const HERO_VISIBLE_H = 210;
export const GRID_FIRST_HERO_VISIBLE_H = HERO_VISIBLE_H;

export function gridFirstSkySectionHeight(topInset: number): number {
  return topInset + GRID_FIRST_HEADER_OVERLAY_H + HERO_VISIBLE_H;
}

type Slide = {
  id: string;
  kind: "image" | "video";
  mediaUrl: string | null;
  cta: string | null;
  storeId: string;
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

function buildSlides(
  heroMedia: GridFirstHeroMediaItem[],
  offers: HomeBannerOffer[],
  merchantFallbackUris: string[] = []
): Slide[] {
  const merchantOffers = offers.filter((o) => o.kind === "merchant" && o.store_id?.trim());

  const mapWithOffers = (
    mediaSlides: Array<{ id: string; kind: "image" | "video"; mediaUrl: string | null }>
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
      };
    });
  }

  // No admin hero media — use nearby restaurant food photos (Swiggy-style), then promo assets.
  if (merchantFallbackUris.length > 0) {
    return merchantFallbackUris.slice(0, 6).map((uri, index) => ({
      id: `merchant-hero-${index}`,
      kind: "image" as const,
      mediaUrl: uri,
      cta: null,
      storeId: "",
    }));
  }

  const promo = defaultPromoHeroUrl(0);
  if (promo) {
    return mapWithOffers([{ id: "hero-promo", kind: "image" as const, mediaUrl: promo }]);
  }

  // Patterned cream slide — no remote image required.
  return [{ id: "hero-default-pattern", kind: "image", mediaUrl: null, cta: null, storeId: "" }];
}

type Props = {
  heroMedia?: GridFirstHeroMediaItem[];
  offers?: HomeBannerOffer[];
  /** Nearby store banners — used when state has no grid_first hero media. */
  merchantFallbacks?: MerchantSummary[];
  embeddedInSky?: boolean;
  immersive?: boolean;
  topInset?: number;
};

function HeroMediaSlide({
  slide,
  slideWidth,
  slideHeight,
  imageFailed,
  onImageError,
  isActive,
  onPress,
  immersive = false,
}: {
  slide: Slide;
  slideWidth: number;
  slideHeight: number;
  imageFailed: boolean;
  onImageError: () => void;
  isActive: boolean;
  onPress: () => void;
  immersive?: boolean;
}) {
  const hasMedia = !!slide.mediaUrl && !imageFailed;
  const hasCta = !!slide.cta?.trim();
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    setImageReady(false);
  }, [slide.mediaUrl, slide.id]);

  const content = (
    <>
      {/* Branded warm backdrop is the ONLY placeholder — never an animated shimmer skeleton
          (spec: the hero must never show a loading skeleton). It paints instantly and the
          real image fades in over it when decoded, so there is no white/grey/shimmer flash. */}
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
          onLoad={() => setImageReady(true)}
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
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  useAppAssetsStore((s) => s.assets);
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const slideHeight = immersive
    ? gridFirstSkySectionHeight(topInset)
    : 232;

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
  }, [slides.length]);

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

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / windowWidth);
    setActiveIndex(idx);
  }, [windowWidth]);

  const onPress = (slide: Slide) => {
    if (slide.storeId) {
      navigateToMerchant(router, queryClient, slide.storeId);
    }
  };

  if (slides.length === 0) {
    if (!immersive) return null;
    return (
      <View style={[styles.wrap, { height: slideHeight }]}>
        <GridFirstDefaultHeroBg />
      </View>
    );
  }

  const backdropUri = slides[0]?.kind === "image" ? slides[0].mediaUrl : null;
  const [backdropReady, setBackdropReady] = useState(false);

  useEffect(() => {
    setBackdropReady(false);
  }, [backdropUri]);

  return (
    <View
      style={[
        styles.wrap,
        embeddedInSky && styles.wrapEmbedded,
        immersive && embeddedInSky && styles.wrapImmersiveAbsolute,
        immersive && !embeddedInSky && { height: slideHeight },
      ]}
    >
      {immersive ? (
        <>
          {/* Instant branded backdrop — no shimmer. Backdrop image fades in over it. */}
          <GridFirstDefaultHeroBg />
          {backdropUri ? (
            <Image
              source={{ uri: backdropUri }}
              style={[StyleSheet.absoluteFillObject, { opacity: backdropReady ? 1 : 0 }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
              recyclingKey={`backdrop-${backdropUri}`}
              onLoad={() => setBackdropReady(true)}
            />
          ) : null}
        </>
      ) : null}
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
        style={immersive ? StyleSheet.absoluteFillObject : undefined}
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
            immersive={immersive}
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
  },
  wrapEmbedded: {
    marginTop: 0,
  },
  wrapImmersiveAbsolute: {
    ...StyleSheet.absoluteFillObject,
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
