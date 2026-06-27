/**
 * Ride home UI sections — promo banner, value props, safety banner (single module for Metro/OneDrive).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageBackground,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { HomeBannerOffer } from "@/services/offers.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { formatRideOfferSubline } from "@/lib/ride-offers";
import { AppAssetImage } from "@/components/AppAssetImage";
import { getAppAssetUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import type { ImageSourcePropType } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 36;
const SLIDE_GAP = 12;
const CARD_H = 148;
const AUTO_MS = 5000;

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
        <Text style={promoStyles.title} numberOfLines={2}>
          {slide.title}
          <Text style={promoStyles.titleAccent}>{slide.titleAccent}</Text>
        </Text>
        <Text style={promoStyles.sub} numberOfLines={2}>
          {slide.sub}
        </Text>
        <View style={promoStyles.ctaBtn}>
          <Text style={promoStyles.ctaText}>Book Now</Text>
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onBookNow} style={promoStyles.cardOuter}>
      {bgUrl ? (
        <ImageBackground
          source={{ uri: bgUrl }}
          style={[promoStyles.card, { height: CARD_H }]}
          imageStyle={promoStyles.cardImage}
          resizeMode="cover"
        >
          {content}
        </ImageBackground>
      ) : (
        <View style={[promoStyles.card, { height: CARD_H, backgroundColor: "#ECFDF5" }]}>
          {content}
        </View>
      )}
    </TouchableOpacity>
  );
}

export function RideHomePromoBanner({ offers = [], onBookNow }: PromoProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = useMemo(() => {
    const platform = offers.filter((o) => o.kind === "platform").slice(0, 10);
    if (platform.length > 0) return platform.map(offerToSlide);
    return DEFAULT_SLIDES;
  }, [offers]);

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
    }, AUTO_MS);
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

  return (
    <View style={promoStyles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={slides.length > 1}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + SLIDE_GAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={promoStyles.scrollContent}
      >
        {slides.map((slide) => (
          <View
            key={slide.id}
            style={[promoStyles.cardShadowClip, { width: CARD_W, marginRight: SLIDE_GAP }]}
          >
            <PromoSlideCard slide={slide} onBookNow={onBookNow} />
          </View>
        ))}
      </ScrollView>

      <View style={promoStyles.dotsRow}>
        {slides.map((s, i) => (
          <View
            key={s.id}
            style={[promoStyles.dot, i === activeIndex ? promoStyles.dotActive : promoStyles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const promoStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  scrollContent: { paddingTop: 2 },
  cardShadowClip: {
    overflow: "hidden",
    paddingLeft: 10,
    marginLeft: -10,
  },
  cardOuter: {
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  card: {
    borderRadius: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.8)",
    overflow: "hidden",
  },
  cardImage: { borderRadius: 20 },
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
          <Text style={safetyStyles.title}>Your Safety. Our Priority.</Text>
          <Text style={safetyStyles.sub}>
            All rides are insured. Share trip details with your loved ones.
          </Text>
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
