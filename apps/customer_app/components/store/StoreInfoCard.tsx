import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";

export type StoreInfoCardProps = {
  name: string;
  logoUrl?: string | null;
  rating?: string | null;
  reviewCountLabel?: string | null;
  distanceKm?: number | null;
  areaLabel?: string | null;
  etaLabel?: string | null;
  /** When user picks a slot from schedule sheet, show this instead of default ETA row. */
  scheduledLabel?: string | null;
  /** Rotating offer lines shown in the offer strip (actual offer text, not store name). */
  offerTexts?: string[];
  offerCount?: number;
  isFrequentlyReordered?: boolean;
  onInfoPress?: () => void;
  onLocationPress?: () => void;
  onSchedulePress?: () => void;
  onOffersPress?: () => void;
};

function OfferTicker({
  texts,
  onPress,
}: {
  texts: string[];
  onPress?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setIndex(0);
    opacity.setValue(1);
    translateY.setValue(0);
  }, [texts.join("|"), opacity, translateY]);

  useEffect(() => {
    if (texts.length <= 1) return;
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -6, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setIndex((i) => (i + 1) % texts.length);
        translateY.setValue(8);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [texts.length, opacity, translateY]);

  if (texts.length === 0) return null;

  return (
    <TouchableOpacity style={styles.offerTextWrap} onPress={onPress} activeOpacity={0.7}>
      <Animated.Text
        style={[styles.offerText, { opacity, transform: [{ translateY }] }]}
        numberOfLines={1}
      >
        {texts[index]}
      </Animated.Text>
    </TouchableOpacity>
  );
}

export function StoreInfoCard({
  name,
  rating,
  reviewCountLabel,
  distanceKm,
  areaLabel,
  etaLabel,
  scheduledLabel,
  offerTexts = [],
  offerCount = 0,
  isFrequentlyReordered,
  onInfoPress,
  onLocationPress,
  onSchedulePress,
  onOffersPress,
}: StoreInfoCardProps) {
  const locationText = [
    distanceKm != null ? `${distanceKm.toFixed(1)} km` : null,
    areaLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasOffers = offerTexts.length > 0 || offerCount > 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <TouchableOpacity onPress={onInfoPress} hitSlop={8} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={18} color={StoreTheme.textSecondary} />
          </TouchableOpacity>
        </View>
        {rating ? (
          <View style={styles.ratingBlock}>
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={11} color="#fff" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
            {reviewCountLabel ? (
              <Text style={styles.reviewCount}>By {reviewCountLabel}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {locationText ? (
        <TouchableOpacity style={styles.metaRow} onPress={onLocationPress} activeOpacity={0.7}>
          <Ionicons name="location-outline" size={15} color={StoreTheme.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>
            {locationText}
          </Text>
          <Ionicons name="chevron-down" size={14} color={StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {scheduledLabel ? (
        <TouchableOpacity style={styles.metaRow} onPress={onSchedulePress} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={15} color={StoreTheme.accentMint} />
          <Text style={[styles.metaText, styles.scheduledText]} numberOfLines={1}>
            {scheduledLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : etaLabel ? (
        <TouchableOpacity style={styles.metaRow} onPress={onSchedulePress} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={15} color={StoreTheme.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>
            {etaLabel} · Schedule for later
          </Text>
          <Ionicons name="chevron-down" size={14} color={StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {isFrequentlyReordered ? (
        <View style={styles.reorderBadge}>
          <Ionicons name="checkmark-circle" size={14} color={StoreTheme.reorderGreen} />
          <Text style={styles.reorderBadgeText}>Frequently reordered</Text>
        </View>
      ) : null}

      {hasOffers ? (
        <>
          <View style={styles.divider} />
          <View style={styles.offerRow}>
            <View style={styles.offerIcon}>
              <Ionicons name="pricetag" size={14} color={StoreTheme.offerBlue} />
            </View>
            <OfferTicker texts={offerTexts} onPress={onOffersPress} />
            {offerCount > 0 ? (
              <TouchableOpacity style={styles.offerCountWrap} onPress={onOffersPress} activeOpacity={0.7}>
                <Text style={styles.offerCount}>{offerCount} offers</Text>
                <Ionicons name="chevron-forward" size={14} color={StoreTheme.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Centered logo overlay on hero banner */
export function StoreHeroLogo({ logoUrl }: { logoUrl?: string | null; name?: string }) {
  if (!logoUrl) return null;
  return (
    <View style={logoStyles.wrap} pointerEvents="none">
      <Image source={{ uri: logoUrl }} style={logoStyles.logo} resizeMode="cover" />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 52,
    alignSelf: "center",
    zIndex: 3,
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#fff",
    ...StoreTheme.cardShadow,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  nameBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    minWidth: 0,
  },
  name: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 28,
  },
  infoBtn: {
    marginTop: 4,
  },
  ratingBlock: {
    alignItems: "flex-end",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: StoreTheme.ratingGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  reviewCount: {
    fontSize: 11,
    color: StoreTheme.textSecondary,
    marginTop: 3,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: StoreTheme.textSecondary,
    fontWeight: "500",
  },
  scheduledText: {
    color: StoreTheme.accentMintDark,
    fontWeight: "600",
  },
  reorderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  reorderBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: StoreTheme.reorderGreen,
  },
  divider: {
    height: 1,
    backgroundColor: StoreTheme.border,
    marginVertical: 10,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  offerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  offerTextWrap: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  offerText: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  offerCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  offerCount: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
  },
});
