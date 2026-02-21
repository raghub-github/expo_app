/**
 * Auto-sliding promotional banner – gradient cards, Shop Now CTA.
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { PROMO_SLIDES } from "./data";

const { width } = Dimensions.get("window");
const PAD = 16;
const BANNER_WIDTH = width - PAD * 2;
const SLIDE_GAP = 12;
const AUTO_INTERVAL_MS = 5000;

export function ShopPromoBanner() {
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
    }, AUTO_INTERVAL_MS);
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
            activeOpacity={0.9}
            style={[styles.slideWrap, { width: BANNER_WIDTH, marginRight: SLIDE_GAP }]}
          >
            <LinearGradient
              colors={[
                GatiMitraColors.emerald,
                GatiMitraColors.emeraldLight,
                GatiMitraColors.warmOrange,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>{slide.title}</Text>
                <Text style={styles.bannerSub}>{slide.sub}</Text>
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
      <View style={styles.dots}>
        {PROMO_SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
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
