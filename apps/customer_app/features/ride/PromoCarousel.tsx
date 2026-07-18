/**
 * Horizontal auto-sliding promotional banner for ride offers.
 * Gradient background, "Book Now" CTA, smooth rounded edges.
 */

import { useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const { width } = Dimensions.get("window");
const PAD = 18;
const BANNER_WIDTH = width - PAD * 2;
const SLIDE_GAP = 14;
const AUTO_SCROLL_INTERVAL_MS = 5000;

const PROMO_SLIDES = [
  {
    id: "1",
    title: "Ride more, save more",
    sub: "Get 20% off on your next 3 rides.",
    cta: "Book Now",
  },
  {
    id: "2",
    title: "We're now closer to you",
    sub: "Now in more cities. Tap to see where we run.",
    cta: "Book Now",
  },
];

type PromoCarouselProps = {
  onBookNow?: () => void;
};

export function PromoCarousel({ onBookNow }: PromoCarouselProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % PROMO_SLIDES.length;
        scrollRef.current?.scrollTo({
          x: next * (BANNER_WIDTH + SLIDE_GAP),
          animated: true,
        });
        return next;
      });
    }, AUTO_SCROLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(x / (BANNER_WIDTH + SLIDE_GAP));
    if (newIndex >= 0 && newIndex < PROMO_SLIDES.length) setIndex(newIndex);
  };

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
        {PROMO_SLIDES.map((slide) => (
          <TouchableOpacity
            key={slide.id}
            activeOpacity={0.88}
            onPress={onBookNow}
            style={[styles.slideWrap, { width: BANNER_WIDTH, marginRight: SLIDE_GAP }]}
          >
            <LinearGradient
              colors={[
                GatiMitraColors.emerald,
                GatiMitraColors.emeraldLight,
                GatiMitraColors.warmOrange,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.6 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <AppText style={styles.bannerTitle}>{slide.title}</AppText>
                <AppText style={styles.bannerSub}>{slide.sub}</AppText>
                <View style={styles.ctaWrap}>
                  <AppText style={styles.ctaText}>{slide.cta}</AppText>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              </View>
              <View style={styles.bannerDeco}>
                <Ionicons
                  name="car-sport"
                  size={40}
                  color="rgba(255,255,255,0.25)"
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {PROMO_SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingBottom: 14,
  },
  slideWrap: {},
  banner: {
    borderRadius: 22,
    padding: 22,
    minHeight: 128,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  bannerContent: { flex: 1 },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textOnGradient,
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
    marginBottom: 12,
  },
  ctaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.32)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 2,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  bannerDeco: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
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
    backgroundColor: GatiMitraColors.border,
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraColors.emerald,
  },
});
