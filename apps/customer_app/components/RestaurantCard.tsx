/**
 * Premium discovery card: hero image, gradient overlay, rating capsule,
 * delivery/distance, offers row (pill chips). GatiMitra styling (mint, 20px radius, soft shadow).
 * Renders only from API data; no dummy/fallback values.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Image, Dimensions, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { formatMerchantDistanceKm } from "@/lib/merchantDistance";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { GatiMitraColors } from "@/constants/gatimitra";

const { width } = Dimensions.get("window");
const PAD = 24;
const CARD_WIDTH = width - PAD * 2;
/** Reference: full-width image 210px, rounded top 18px. */
const HERO_HEIGHT = 210;
const CARD_RADIUS = 18;
const IMAGE_RADIUS = 18;
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 4,
};
const CARD_MARGIN_BOTTOM = 18;
const RATING_BG = "#16A34A";
const OFFER_CHIP_BG_PREMIUM = "#FFF7ED";
const OFFER_CHIP_BG_DISCOUNT = "#EFF6FF";

const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const MINT = GatiMitraColors.mintStart;
const BORDER = "#E8E8E8";

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K+`;
  return `${n}+`;
}

export type RestaurantCardProps = {
  merchant: MerchantSummary;
  /** When provided, show bookmark and allow toggle; initial saved state from parent (e.g. from list endpoint later). */
  initialSaved?: boolean;
};

export function RestaurantCard({ merchant, initialSaved = false }: RestaurantCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(initialSaved);
  const [savedLoading, setSavedLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const heroUri = useMemo(
    () => toAbsoluteImageUrl(merchant.displayImage ?? merchant.banner_url ?? null),
    [merchant.displayImage, merchant.banner_url]
  );

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [heroUri]);

  const toggleBookmark = useCallback(
    async (e: any) => {
      e?.stopPropagation?.();
      if (savedLoading) return;
      setSavedLoading(true);
      try {
        const res = await setStoreBookmark(merchant.id, !saved);
        setSaved(res.saved);
      } catch {
        // Keep previous state on error
      } finally {
        setSavedLoading(false);
      }
    },
    [merchant.id, saved, savedLoading]
  );

  const hasImage = Boolean(heroUri && !imageError);
  const distanceStr = formatMerchantDistanceKm(merchant.distanceKm);
  const hasRating = merchant.avgRating != null && merchant.avgRating >= 0;
  const ratingLabel =
    hasRating && merchant.totalReviews != null && merchant.totalReviews > 0
      ? `${Number(merchant.avgRating).toFixed(1)} (${formatReviewCount(merchant.totalReviews)})`
      : hasRating
        ? `${Number(merchant.avgRating).toFixed(1)}`
        : "New";
  const offerChips = merchant.offerText
    ? merchant.offerText.split(/\s*\|\s*/).filter(Boolean).slice(0, 2)
    : [];

  const openMerchant = () => {
    navigateToMerchant(router, queryClient, merchant.id, merchant);
  };

  const warmMerchantDetail = useCallback(() => {
    warmMerchantHeroImage(merchant.id, heroUri ?? null);
  }, [merchant.id, heroUri]);

  return (
    <TouchableOpacity
      onPress={openMerchant}
      onPressIn={warmMerchantDetail}
      style={[styles.card, CARD_SHADOW]}
      activeOpacity={0.92}
    >
      {/* Hero: full-width rounded image, gradient overlay, overlay badges, bookmark */}
      <View style={styles.heroWrap}>
        {hasImage ? (
          <>
            <Image
              source={{ uri: heroUri! }}
              style={[styles.heroImage, !imageLoaded && styles.heroImageOpaque]}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
            {!imageLoaded && (
              <View style={styles.heroPlaceholder}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </>
        ) : (
          <LinearGradient
            colors={["#374151", "#1f2937"]}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.4)", "transparent", "transparent"]}
          style={styles.gradientOverlay}
        />
        {merchant.cuisines && merchant.cuisines.length > 0 && (
          <View style={styles.overlayBadge}>
            <AppText style={styles.overlayBadgeText} numberOfLines={1}>
              {merchant.cuisines[0]}
            </AppText>
          </View>
        )}
        <TouchableOpacity
          onPress={toggleBookmark}
          style={styles.bookmarkBtn}
          hitSlop={12}
          disabled={savedLoading}
        >
          {savedLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={24}
              color={saved ? "#22c55e" : "#fff"}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Info: name, rating (top-right), delivery • distance. Reference: image→title 10px, title→meta 6px. */}
      <View style={styles.content}>
        <View style={styles.contentLeft}>
          <View style={styles.titleRow}>
            <AppText style={styles.storeName} numberOfLines={1}>
              {merchant.name}
            </AppText>
            <View style={[styles.ratingCapsule, !hasRating && styles.ratingCapsuleNew]}>
              {hasRating && <Ionicons name="star" size={12} color="#fff" />}
              <AppText style={styles.ratingCapsuleText}>{ratingLabel}</AppText>
            </View>
          </View>
          <View style={styles.metaRow}>
            {merchant.deliveryTime && (
              <>
                <Ionicons name="time-outline" size={14} color={TEXT_GRAY} />
                <AppText style={styles.metaText}>{merchant.deliveryTime}</AppText>
              </>
            )}
            {distanceStr && (
              <>
                {merchant.deliveryTime && <AppText style={styles.metaDot}> · </AppText>}
                <AppText style={styles.metaText}>{distanceStr}</AppText>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Offer chips: crown = premium, second = discount. Reference: meta→offer 8px, chip 8px radius, 4px 8px, 12px. */}
      {offerChips.length > 0 && (
        <View style={styles.offersRow}>
          {offerChips.map((text, i) => (
            <View key={i} style={[styles.offerPill, i === 0 ? styles.offerPillPremium : styles.offerPillDiscount]}>
              <AppText style={styles.offerPillText} numberOfLines={1}>
                {i === 0 ? "👑 " : ""}{text}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    alignSelf: "center",
    marginHorizontal: PAD,
    marginBottom: CARD_MARGIN_BOTTOM,
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...(Platform.OS === "ios" && CARD_SHADOW),
  },
  heroWrap: {
    width: "100%",
    height: HERO_HEIGHT,
    position: "relative" as const,
    overflow: "hidden",
    borderTopLeftRadius: IMAGE_RADIUS,
    borderTopRightRadius: IMAGE_RADIUS,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: IMAGE_RADIUS,
    borderTopRightRadius: IMAGE_RADIUS,
  },
  heroImageOpaque: {
    opacity: 0.85,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: IMAGE_RADIUS,
    borderTopRightRadius: IMAGE_RADIUS,
  },
  overlayBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    maxWidth: "70%",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overlayBadgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  bookmarkBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
  },
  contentLeft: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  storeName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  ratingCapsule: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: RATING_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  ratingCapsuleNew: {
    backgroundColor: RATING_BG,
  },
  ratingCapsuleText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 2,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    color: TEXT_GRAY,
  },
  metaDot: {
    fontSize: 13,
    color: TEXT_GRAY,
  },
  offersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  offerPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "100%",
  },
  offerPillPremium: {
    backgroundColor: OFFER_CHIP_BG_PREMIUM,
  },
  offerPillDiscount: {
    backgroundColor: OFFER_CHIP_BG_DISCOUNT,
  },
  offerPillText: {
    fontSize: 12,
    color: TITLE_DARK,
    fontWeight: "600",
  },
});
