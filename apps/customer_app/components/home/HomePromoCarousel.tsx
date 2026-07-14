/**
 * Home promo carousel — reference-matched offer banner + live platform offers.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  type ImageSourcePropType,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { HomeBannerOffer } from "@/services/offers.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { formatRideOfferSubline } from "@/lib/ride-offers";
import { getAppAssetUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import { AppText } from "@/components/AppText";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { useQueryClient } from "@tanstack/react-query";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const CARD_W = SCREEN_W - PAD * 2;
const SLIDE_GAP = 12;
const DEFAULT_CARD_H = 136;
const FOOD_OFFER_ASSET_KEYS = [CX.home.promoOffer, CX.home.promoOffer2] as const;
const RIDE_OFFER_ASSET_KEYS = [CX.home.promoRideOffer1, CX.home.promoRideOffer2] as const;

function offerBannerArt(
  index: number,
  mode: "home" | "food" | "ride" = "home"
): ImageSourcePropType | null {
  const keys = mode === "ride" ? RIDE_OFFER_ASSET_KEYS : FOOD_OFFER_ASSET_KEYS;
  const key = keys[index % keys.length];
  const uri = getAppAssetUrl(key);
  return uri ? { uri } : null;
}
const PROMO_AUTO_MS = 5500;
const LIMITED_TIME_MAX_DAYS = 5;

function daysUntilOfferExpiry(validTill: string | null | undefined): number | null {
  if (!validTill?.trim()) return null;
  const end = new Date(validTill);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function shouldShowLimitedTimeBadge(validTill: string | null | undefined): boolean {
  const days = daysUntilOfferExpiry(validTill);
  return days != null && days <= LIMITED_TIME_MAX_DAYS;
}

const BADGE_BG = "#FFFFFF";
const BADGE_TEXT = "#15803D";
const CTA_TEXT = GatiMitraColors.splashMint;
const DOT_ACTIVE = GatiMitraColors.splashMint;

type Slide = {
  id: string;
  kind: "merchant" | "platform";
  showLimitedBadge: boolean;
  title: string;
  sub: string;
  cta: string;
  storeId: string;
  /** Merchant custom banner from merchant_offers.offer_image_url; null → default GatiMitra art. */
  imageUrl: string | null;
};

const DEFAULT_FALLBACK_SLIDES: Slide[] = [
  {
    id: "fallback-1",
    kind: "merchant",
    showLimitedBadge: false,
    title: "Offers for you",
    sub: "Get deals on your first order",
    cta: "Explore now",
    storeId: "",
    imageUrl: null,
  },
  {
    id: "fallback-2",
    kind: "merchant",
    showLimitedBadge: false,
    title: "Flat deals nearby",
    sub: "Explore restaurants on GatiMitra",
    cta: "Explore now",
    storeId: "",
    imageUrl: null,
  },
];

function pickOffersForCarousel(
  offers: HomeBannerOffer[],
  mode: "home" | "food" | "ride"
): HomeBannerOffer[] {
  const merchant = offers.filter((o) => o.kind === "merchant");
  const platform = offers.filter((o) => o.kind === "platform");

  if (mode === "ride") {
    return platform.slice(0, 10);
  }

  if (mode === "food") {
    return merchant;
  }

  // Home tab: platform + nearby store offers (API order: platform first, then merchant).
  if (platform.length > 0 || merchant.length > 0) {
    return [...platform, ...merchant];
  }
  return offers;
}

function slideBackgroundSource(
  slide: Slide,
  index: number,
  imageFailed: boolean,
  mode: "home" | "food" | "ride"
): ImageSourcePropType | null {
  const useMerchantUpload =
    slide.kind === "merchant" && !!slide.imageUrl && !imageFailed;
  if (useMerchantUpload) return { uri: slide.imageUrl! };
  return offerBannerArt(index, mode);
}

function hasCustomMerchantBanner(slide: Slide, imageFailed: boolean): boolean {
  return slide.kind === "merchant" && !!slide.imageUrl && !imageFailed;
}

function parseTitle(title: string, offer: HomeBannerOffer): string {
  const raw = (title ?? "").trim();
  if (!raw) return "Offers for you";

  const type = String(offer.offer_type ?? "").toUpperCase();
  const pct = offer.discount_percentage;
  const val = offer.discount_value;

  if (type === "FREE_DELIVERY" || /free delivery/i.test(raw)) return "Free Delivery";
  if (pct != null && pct > 0) return `Flat ${Math.round(pct)}% OFF`;
  if (val != null && val > 0) return `Flat ₹${Math.round(val)} OFF`;
  if (/%\s*OFF/i.test(raw)) {
    const pctMatch = raw.match(/(\d+)\s*%\s*OFF/i);
    if (pctMatch) return `Flat ${pctMatch[1]}% OFF`;
    return raw;
  }
  if (/₹\s*\d/.test(raw)) {
    const amount = raw.replace(/\s*OFF\s*$/i, "").trim();
    return amount.toLowerCase().includes("flat") ? `${amount} OFF` : `Flat ${amount} OFF`;
  }
  if (/^flat\s/i.test(raw)) return raw;
  return raw;
}

function buildSubline(offer: HomeBannerOffer, mode: "home" | "food" | "ride"): string {
  if (mode === "ride") {
    return formatRideOfferSubline(offer.sub, {
      minFare: offer.min_order_amount,
      maxDiscount: offer.max_discount_amount,
    });
  }

  const trimmed = offer.sub?.trim();
  if (!trimmed) {
    if (offer.min_order_amount != null && offer.min_order_amount > 0) {
      return `on orders above ₹${Math.round(offer.min_order_amount)}`;
    }
    return "Get deals on your first order";
  }
  const primary = trimmed.split(" · ")[0]?.trim();
  return primary || trimmed;
}

function offerToSlide(offer: HomeBannerOffer, mode: "home" | "food" | "ride"): Slide {
  const rawImage =
    offer.kind === "merchant" ? offer.offer_image_url?.trim() || null : null;
  const imageUrl = rawImage ? toAbsoluteImageUrl(rawImage) ?? rawImage : null;
  return {
    id: offer.id,
    kind: offer.kind,
    showLimitedBadge: shouldShowLimitedTimeBadge(offer.valid_till),
    title: parseTitle(offer.title, offer),
    sub: buildSubline(offer, mode),
    cta: mode === "ride" ? "Book now" : "Explore now",
    storeId: offer.store_id?.trim() ?? "",
    imageUrl,
  };
}

type PromoSlideCardProps = {
  slide: Slide;
  index: number;
  cardHeight: number;
  mode: "home" | "food" | "ride";
  onPress: (slide: Slide) => void;
};

function PromoSlideCard({ slide, index, cardHeight, mode, onPress }: PromoSlideCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const customBanner = hasCustomMerchantBanner(slide, imageFailed);
  const showParty = slide.sub.toLowerCase().includes("first order");
  const bgSource = slideBackgroundSource(slide, index, imageFailed, mode);
  useAppAssetsStore((s) => s.assets);

  useEffect(() => {
    setImageFailed(false);
  }, [slide.id, slide.imageUrl, index]);

  const content = (
    <>
      {!customBanner ? (
        <LinearGradient
          colors={["rgba(12,100,68,0.22)", "rgba(12,100,68,0.06)", "transparent"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : (
        <LinearGradient
          colors={["rgba(0,0,0,0.28)", "rgba(0,0,0,0.08)", "transparent"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      <View style={styles.promoTextCol}>
        {slide.showLimitedBadge ? (
          <View style={styles.promoLimitedBadge}>
            <AppText style={styles.promoLimitedText}>LIMITED TIME</AppText>
          </View>
        ) : null}

        <AppText style={styles.promoTitle} numberOfLines={2}>
          {slide.title}
        </AppText>

        <AppText style={styles.promoSub} numberOfLines={2}>
          {slide.sub}
          {showParty ? " 🎉" : ""}
        </AppText>

        <View style={styles.promoBtn}>
          <AppText style={styles.promoBtnText}>{slide.cta}</AppText>
          <Ionicons name="chevron-forward" size={14} color={CTA_TEXT} />
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity
      style={[styles.promoCardOuter, { width: CARD_W, height: cardHeight }]}
      activeOpacity={0.92}
      onPress={() => onPress(slide)}
    >
      <View style={[styles.promoCard, { height: cardHeight }]}>
        {/* Soft mint base — image paints on top instantly (no skeleton flash). */}
        <View style={[styles.promoBgFallback, { height: cardHeight }]} />
        {bgSource ? (
          <Image
            source={bgSource}
            style={[styles.promoBgImage, { height: cardHeight }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            priority="high"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        {content}
      </View>
    </TouchableOpacity>
  );
}

type Props = {
  offers?: HomeBannerOffer[];
  cardHeight?: number;
  /** Home: platform + store offers. Food listing: store offers only. Ride: platform ride offers. */
  mode?: "home" | "food" | "ride";
  /** When no live offers, show default GatiMitra art banners (food page). */
  showDefaultWhenEmpty?: boolean;
};

export function HomePromoCarousel({
  offers = [],
  cardHeight = DEFAULT_CARD_H,
  mode = "home",
  showDefaultWhenEmpty = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  useAppAssetsStore((s) => s.assets);

  const slides: Slide[] = useMemo(() => {
    const picked = pickOffersForCarousel(offers, mode);
    if (picked.length > 0) return picked.map((offer) => offerToSlide(offer, mode));
    // Prefer default art banners over a loading skeleton so home never flashes grey.
    if (showDefaultWhenEmpty || mode === "home") return DEFAULT_FALLBACK_SLIDES;
    return [];
  }, [offers, mode, showDefaultWhenEmpty]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({
          x: next * (CARD_W + SLIDE_GAP),
          animated: true,
        });
        return next;
      });
    }, PROMO_AUTO_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / (CARD_W + SLIDE_GAP));
      setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
    },
    [slides.length]
  );

  const handlePress = useCallback(
    (slide: Slide) => {
      if (mode === "ride") {
        router.push("/home/service/ride" as never);
        return;
      }
      if (slide.storeId) {
        navigateToMerchant(router, queryClient, slide.storeId);
        return;
      }
      router.push("/home" as never);
    },
    [router, queryClient, mode]
  );

  if (slides.length === 0) {
    return <View style={[styles.wrap, { minHeight: cardHeight + 20 }]} />;
  }

  return (
    <View style={[styles.wrap, { minHeight: cardHeight + 20 }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        scrollEnabled={slides.length > 1}
        bounces={false}
        pagingEnabled={false}
        snapToInterval={CARD_W + SLIDE_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        delaysContentTouches={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide, index) => (
          <PromoSlideCard
            key={slide.id}
            slide={slide}
            index={index}
            cardHeight={cardHeight}
            mode={mode}
            onPress={handlePress}
          />
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {slides.map((s, i) => (
          <View
            key={s.id}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD,
    marginBottom: 2,
  },
  scrollContent: {
    gap: SLIDE_GAP,
    paddingTop: 4,
  },
  promoCardOuter: {
    borderRadius: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  promoCard: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#12804E",
    justifyContent: "center",
  },
  promoBgImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    width: "100%",
  },
  promoBgFallback: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: "#12804E",
  },
  promoTextCol: {
    flex: 1,
    maxWidth: "62%",
    paddingLeft: 18,
    paddingRight: 8,
    paddingTop: 10,
    paddingBottom: 14,
    justifyContent: "center",
    zIndex: 2,
  },
  promoLimitedBadge: {
    alignSelf: "flex-start",
    backgroundColor: BADGE_BG,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: -4,
    marginBottom: 5,
  },
  promoLimitedText: {
    fontSize: 8,
    fontWeight: "800",
    color: BADGE_TEXT,
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  promoTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 4,
  },
  promoSub: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 18,
    marginBottom: 10,
  },
  promoBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 2,
  },
  promoBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: CTA_TEXT,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: DOT_ACTIVE,
    width: 16,
  },
  dotInactive: {
    backgroundColor: "rgba(0,0,0,0.18)",
  },
});
