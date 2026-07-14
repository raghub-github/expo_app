/**
 * Auto-sliding promotional banner — live store/platform offers near customer.
 * No static fallback; hidden when there are no active offers.
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useLocationStore } from "@/store/locationStore";
import { offersService, type HomeBannerOffer } from "@/services/offers.service";
import { navigateToMerchant } from "@/lib/navigateToMerchant";

const { width } = Dimensions.get("window");
const PAD = 16;
const BANNER_WIDTH = width - PAD * 2;
const SLIDE_GAP = 12;
const AUTO_INTERVAL_MS = 5000;

const GRADIENT_SETS: [string, string, string][] = [
  [GatiMitraColors.emerald, GatiMitraColors.emeraldLight, GatiMitraColors.warmOrange],
  ["#7c3aed", "#a855f7", "#ec4899"],
  ["#0ea5e9", "#38bdf8", "#06b6d4"],
  ["#f59e0b", "#fbbf24", "#f97316"],
  ["#10b981", "#34d399", "#059669"],
];

type SlideData = {
  id: string;
  storeId: string;
  title: string;
  sub: string;
  cta: string;
  gradientIndex: number;
};

function offerToSlide(o: HomeBannerOffer, idx: number): SlideData {
  return {
    id: o.id,
    storeId: o.store_id,
    title: o.title,
    sub: o.sub || o.store_name || "Offer",
    cta: "View menu",
    gradientIndex: idx % GRADIENT_SETS.length,
  };
}

export function ShopPromoBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const locationAddress = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const pincode = locationAddress?.pincode ?? undefined;
  const state = locationAddress?.state ?? undefined;
  const city = locationAddress?.city ?? undefined;
  const lat = coords?.latitude ?? undefined;
  const lng = coords?.longitude ?? undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["featured-offers", pincode, state, city, lat, lng],
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode,
        state,
        city,
        lat,
        lng,
        serviceType: "FOOD",
        limit: 5,
      }),
    enabled: lat != null && lng != null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const slides: SlideData[] = data?.offers?.map(offerToSlide) ?? [];

  useEffect(() => {
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        scrollRef.current?.scrollTo({
          x: next * (BANNER_WIDTH + SLIDE_GAP),
          animated: true,
        });
        return next;
      });
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(x / (BANNER_WIDTH + SLIDE_GAP));
    if (newIndex >= 0 && newIndex < slides.length) setIndex(newIndex);
  };

  if (isLoading) {
    return (
      <View style={[styles.wrap, styles.loadingWrap]}>
        <ActivityIndicator color={GatiMitraColors.emerald} />
      </View>
    );
  }

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={BANNER_WIDTH + SLIDE_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide) => (
          <TouchableOpacity
            key={slide.id}
            activeOpacity={0.9}
            style={[styles.slideWrap, { width: BANNER_WIDTH, marginRight: SLIDE_GAP }]}
            onPress={() => navigateToMerchant(router, queryClient, slide.storeId)}
          >
            <LinearGradient
              colors={GRADIENT_SETS[slide.gradientIndex]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>{slide.title}</Text>
                <Text style={styles.bannerSub} numberOfLines={2}>
                  {slide.sub}
                </Text>
                <View style={styles.ctaWrap}>
                  <Text style={styles.ctaText}>{slide.cta}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              </View>
              <View style={styles.bannerDeco}>
                <Ionicons name="pricetag" size={32} color="rgba(255,255,255,0.3)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const BANNER_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 3,
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  loadingWrap: { height: 124, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: PAD, paddingBottom: 8 },
  slideWrap: {},
  banner: {
    borderRadius: 16,
    padding: 18,
    minHeight: 108,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    ...BANNER_SHADOW,
  },
  bannerContent: { flex: 1 },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textOnGradient,
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.92)",
    marginBottom: 10,
  },
  ctaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.28)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  ctaText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  bannerDeco: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GatiMitraColors.border,
  },
  dotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraColors.emerald,
  },
});
