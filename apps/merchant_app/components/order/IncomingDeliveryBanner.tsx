import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

export type IncomingBannerSlide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone: "delivery" | "cutlery" | "note";
};

type Props = {
  slides: IncomingBannerSlide[];
  /** Reset slideshow when the open order changes. */
  resetKey: string;
};

const SLIDE_MS = 3200;

/**
 * Auto-rotating banner: GatiMitra delivery → cutlery / kitchen instructions
 * (same row — no separate instruction cards).
 */
export function IncomingDeliveryBanner({ slides, resetKey }: Props) {
  const safeSlides = useMemo(
    () => (slides.length > 0 ? slides : [{ key: "delivery", icon: "bicycle-outline" as const, text: "GatiMitra delivery", tone: "delivery" as const }]),
    [slides]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [resetKey]);

  useEffect(() => {
    if (safeSlides.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % safeSlides.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [safeSlides.length, resetKey]);

  const slide = safeSlides[Math.min(index, safeSlides.length - 1)]!;
  const toneStyle =
    slide.tone === "cutlery"
      ? styles.toneCutlery
      : slide.tone === "note"
        ? styles.toneNote
        : styles.toneDelivery;
  const iconColor =
    slide.tone === "cutlery"
      ? "#047857"
      : slide.tone === "note"
        ? "#6D28D9"
        : GatiMitraMerchant.primaryDark;
  const textStyle =
    slide.tone === "cutlery"
      ? styles.textCutlery
      : slide.tone === "note"
        ? styles.textNote
        : styles.textDelivery;

  return (
    <View style={[styles.banner, toneStyle]}>
      <Ionicons name={slide.icon} size={14} color={iconColor} />
      <Text style={[styles.text, textStyle]} numberOfLines={2}>
        {slide.text}
      </Text>
      {safeSlides.length > 1 ? (
        <View style={styles.dots}>
          {safeSlides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 8,
    borderWidth: 1,
    minHeight: 36,
  },
  toneDelivery: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  toneCutlery: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  toneNote: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  textDelivery: {
    color: GatiMitraMerchant.primaryDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  textCutlery: {
    color: "#065F46",
    textTransform: "none",
    letterSpacing: 0.1,
    fontWeight: "700",
  },
  textNote: {
    color: "#4C1D95",
    textTransform: "none",
    letterSpacing: 0.1,
    fontWeight: "700",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(15,23,42,0.18)",
  },
  dotActive: {
    width: 10,
    backgroundColor: GatiMitraMerchant.primaryDark,
  },
});
