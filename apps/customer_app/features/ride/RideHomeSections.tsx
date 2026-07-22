/**
 * Ride home UI sections — promo banner, value props, safety banner (single module for Metro/OneDrive).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { HomeBannerOffer } from "@/services/offers.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { formatRideOfferSubline } from "@/lib/ride-offers";
import { AppAssetImage } from "@/components/AppAssetImage";
import { getAppAssetUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import { prefetchFoodHomeImageUri } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchCriticalRideAssetImagesSync } from "@/lib/rideCriticalAssets";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 36;
const SLIDE_GAP = 12;
const SLIDE_STRIDE = CARD_W + SLIDE_GAP;
const CARD_H = 148;
const AUTO_MS = 5000;
const LOOP_SCROLL_MS = 420;

const OFFER_ASSET_KEYS = [CX.ride.banner, CX.home.promoRideOffer1, CX.home.promoRideOffer2] as const;

type Slide = {
  id: string;
  title: string;
  titleAccent: string;
  sub: string;
  assetKey: string;
};

const DEFAULT_SLIDES: Slide[] = [
  {
    id: "default-1",
    title: "Go More, ",
    titleAccent: "Save More!",
    sub: "Get exciting offers on every ride.",
    assetKey: CX.ride.banner,
  },
  {
    id: "default-2",
    title: "Ride safe, ",
    titleAccent: "ride smart",
    sub: "Trusted captains and insured trips.",
    assetKey: CX.ride.banner,
  },
  {
    id: "default-3",
    title: "Book in ",
    titleAccent: "seconds",
    sub: "Auto, bike, or cab — your choice.",
    assetKey: CX.ride.banner,
  },
];

function offerToSlide(offer: HomeBannerOffer, index: number): Slide {
  const title = offer.title?.trim() || "Ride offer";
  const parts = title.split(/\s+/);
  const accent = parts.length > 2 ? parts.slice(-2).join(" ") : parts[parts.length - 1] ?? title;
  const lead = parts.length > 2 ? `${parts.slice(0, -2).join(" ")} ` : "";
  const artKey = OFFER_ASSET_KEYS[index % OFFER_ASSET_KEYS.length] ?? CX.ride.banner;
  return {
    id: offer.id,
    title: lead,
    titleAccent: accent,
    sub: formatRideOfferSubline(offer.sub, {
      minFare: offer.min_order_amount,
      maxDiscount: offer.max_discount_amount,
    }),
    assetKey: artKey,
  };
}

type PromoProps = {
  offers?: HomeBannerOffer[];
  onBookNow?: () => void;
};

function PromoSlideCard({
  slide,
  onBookNow,
}: {
  slide: Slide;
  onBookNow?: () => void;
}) {
  useAppAssetsStore((s) => s.assets);
  const bgUrl = getAppAssetUrl(slide.assetKey);

  const content = (
    <>
      <LinearGradient
        colors={["rgba(255,255,255,0.94)", "rgba(255,255,255,0.72)", "rgba(255,255,255,0.08)"]}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={promoStyles.textCol}>
        <AppText style={promoStyles.title} numberOfLines={2}>
          {slide.title}
          <AppText style={promoStyles.titleAccent}>{slide.titleAccent}</AppText>
        </AppText>
        <AppText style={promoStyles.sub} numberOfLines={2}>
          {slide.sub}
        </AppText>
        <View style={promoStyles.ctaBtn}>
          <AppText style={promoStyles.ctaText}>Book Now</AppText>
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onBookNow} style={promoStyles.cardOuter}>
      <View style={[promoStyles.card, { height: CARD_H }, !bgUrl && promoStyles.cardFallback]}>
        {bgUrl ? (
          <Image
            source={{ uri: bgUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
            recyclingKey={slide.assetKey}
          />
        ) : null}
        {content}
      </View>
    </TouchableOpacity>
  );
}

export function RideHomePromoBanner({ offers = [], onBookNow }: PromoProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const loopResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assets = useAppAssetsStore((s) => s.assets);

  const slides = useMemo(() => {
    const platform = offers.filter((o) => o.kind === "platform").slice(0, 10);
    if (platform.length > 0) return platform.map(offerToSlide);
    return DEFAULT_SLIDES;
  }, [offers]);

  const loopSlides = useMemo(() => {
    if (slides.length <= 1) return slides;
    const first = slides[0];
    return [...slides, { ...first, id: `${first.id}-loop-clone` }];
  }, [slides]);

  useLayoutEffect(() => {
    prefetchCriticalRideAssetImagesSync(assets);
    for (const slide of slides) {
      const uri = getAppAssetUrl(slide.assetKey);
      if (uri) prefetchFoodHomeImageUri(uri);
    }
  }, [assets, slides]);

  useEffect(() => {
    return () => {
      if (loopResetTimerRef.current) clearTimeout(loopResetTimerRef.current);
    };
  }, []);

  const resetLoopToStart = useCallback(() => {
    activeIndexRef.current = 0;
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    setActiveIndex(0);
  }, []);

  const scheduleLoopReset = useCallback(() => {
    if (loopResetTimerRef.current) clearTimeout(loopResetTimerRef.current);
    loopResetTimerRef.current = setTimeout(() => {
      loopResetTimerRef.current = null;
      resetLoopToStart();
    }, LOOP_SCROLL_MS);
  }, [resetLoopToStart]);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      const current = activeIndexRef.current >= slides.length ? 0 : activeIndexRef.current;
      const next = current + 1;

      if (next >= slides.length) {
        scrollRef.current?.scrollTo({
          x: slides.length * SLIDE_STRIDE,
          animated: true,
        });
        activeIndexRef.current = slides.length;
        setActiveIndex(slides.length);
        scheduleLoopReset();
        return;
      }

      scrollRef.current?.scrollTo({
        x: next * SLIDE_STRIDE,
        animated: true,
      });
      activeIndexRef.current = next;
      setActiveIndex(next);
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [slides.length, scheduleLoopReset]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / SLIDE_STRIDE);
      if (idx >= slides.length) {
        resetLoopToStart();
        return;
      }
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    },
    [resetLoopToStart, slides.length]
  );

  const dotIndex = activeIndex >= slides.length ? 0 : activeIndex;

  return (
    <View style={promoStyles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_STRIDE}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={promoStyles.scrollContent}
      >
        {loopSlides.map((slide) => (
          <View key={slide.id} style={[promoStyles.slideWrap, { width: CARD_W, marginRight: SLIDE_GAP }]}>
            <PromoSlideCard slide={slide} onBookNow={onBookNow} />
          </View>
        ))}
      </ScrollView>

      <View style={promoStyles.dotsRow}>
        {slides.map((s, i) => (
          <View
            key={s.id}
            style={[promoStyles.dot, i === dotIndex ? promoStyles.dotActive : promoStyles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const promoStyles = StyleSheet.create({
  wrap: { marginBottom: 16, overflow: "hidden" },
  scrollContent: { paddingTop: 2 },
  slideWrap: {
    overflow: "hidden",
    borderRadius: 20,
  },
  cardOuter: {
    borderRadius: 20,
  },
  card: {
    borderRadius: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.8)",
    overflow: "hidden",
  },
  cardFallback: {
    backgroundColor: "#ECFDF5",
  },
  textCol: { maxWidth: "58%", paddingLeft: 18, paddingRight: 8, paddingVertical: 16, zIndex: 2 },
  title: { fontSize: 22, fontWeight: "800", color: "#111827", letterSpacing: -0.4, lineHeight: 26 },
  titleAccent: { color: GatiMitraColors.deepMintStart },
  sub: { marginTop: 4, fontSize: 12, fontWeight: "500", color: "#6B7280", lineHeight: 17 },
  ctaBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: GatiMitraColors.deepMintStart,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ctaText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, minHeight: 8 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 18, backgroundColor: GatiMitraColors.primaryMint },
  dotInactive: { width: 6, backgroundColor: "#D1D5DB" },
});

export function RideSafetyBanner() {
  const cardW = SCREEN_W - 36;

  return (
    <View style={safetyStyles.wrap}>
      <View style={[safetyStyles.card, { width: cardW }]}>
        <View style={safetyStyles.shieldWrap}>
          <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
        </View>

        <View style={safetyStyles.textCol}>
          <AppText style={safetyStyles.title}>Your Safety. Our Priority.</AppText>
          <AppText style={safetyStyles.sub}>
            All rides are insured. Share trip details with your loved ones.
          </AppText>
        </View>

        <View style={safetyStyles.rightArt}>
          <AppAssetImage
            assetKey={CX.ride.bottomBanner}
            style={safetyStyles.rightArtImg}
            contentFit="cover"
          />
        </View>
      </View>
    </View>
  );
}

const safetyStyles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.65)",
    overflow: "hidden",
    minHeight: 78,
  },
  shieldWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.deepMintStart,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 6,
    paddingRight: 2,
  },
  title: { fontSize: 14, fontWeight: "800", color: "#111827", lineHeight: 18 },
  sub: { marginTop: 3, fontSize: 11, fontWeight: "500", color: "#4B5563", lineHeight: 15 },
  rightArt: {
    width: 54,
    height: 58,
    overflow: "hidden",
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  rightArtImg: {
    width: 160,
    height: 58,
    position: "absolute",
    right: -6,
  },
});
