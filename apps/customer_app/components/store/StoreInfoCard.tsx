import React from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { MerchantOfferRow } from "@/components/home/MerchantOfferRow";
import { formatMerchantDistanceKm } from "@/lib/merchantDistance";

export type StoreInfoCardProps = {
  name: string;
  logoUrl?: string | null;
  avgRating?: number | null;
  totalReviews?: number | null;
  distanceKm?: number | null;
  areaLabel?: string | null;
  etaLabel?: string | null;
  /** @deprecated Scheduling disabled — ignored; row always shows ETA · Schedule for later. */
  scheduledLabel?: string | null;
  /** Rotating offer lines shown in the offer strip (actual offer text, not store name). */
  offerTexts?: string[];
  offerCount?: number;
  /** @deprecated Empty offer row is no longer reserved; only shown when offers exist. */
  reserveOfferRow?: boolean;
  isFrequentlyReordered?: boolean;
  onInfoPress?: () => void;
  onLocationPress?: () => void;
  onSchedulePress?: () => void;
  onOffersPress?: () => void;
  onRatingHintPress?: () => void;
};

export function StoreInfoCard({
  name,
  avgRating,
  totalReviews,
  distanceKm,
  areaLabel,
  etaLabel,
  offerTexts = [],
  offerCount = 0,
  isFrequentlyReordered,
  onInfoPress,
  onLocationPress,
  onSchedulePress,
  onOffersPress,
  onRatingHintPress,
}: StoreInfoCardProps) {
  const locationText = [
    formatMerchantDistanceKm(distanceKm),
    areaLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  // Only show when platform/store offers are actually mapped — never reserve empty space.
  const showOfferRow = offerTexts.length > 0 || offerCount > 0;

  return (
    <View style={[styles.card, !showOfferRow && styles.cardPadBottom]}>
      <View style={styles.topRow}>
        <View style={styles.nameBlock}>
          <AppText style={styles.name} numberOfLines={2}>
            {name}
          </AppText>
          <TouchableOpacity onPress={onInfoPress} hitSlop={8} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={18} color={StoreTheme.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.ratingWrap}>
          <MerchantRatingBadge
            rating={avgRating}
            totalReviews={totalReviews}
            showReviewHint
            size="md"
            onPillPress={onRatingHintPress}
            onReviewHintPress={onRatingHintPress}
          />
        </View>
      </View>

      {locationText ? (
        <TouchableOpacity style={styles.metaRow} onPress={onLocationPress} activeOpacity={0.7}>
          <Ionicons name="location-outline" size={15} color={StoreTheme.textSecondary} />
          <AppText style={styles.metaText} numberOfLines={1}>
            {locationText}
          </AppText>
          <Ionicons name="chevron-down" size={14} color={StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {etaLabel ? (
        <TouchableOpacity style={styles.metaRow} onPress={onSchedulePress} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={15} color={StoreTheme.textSecondary} />
          <AppText style={styles.metaText} numberOfLines={1}>
            {etaLabel} · Schedule for later
          </AppText>
          <Ionicons name="chevron-down" size={14} color={StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {isFrequentlyReordered ? (
        <View style={styles.reorderBadge}>
          <Ionicons name="checkmark-circle" size={14} color={StoreTheme.reorderGreen} />
          <AppText style={styles.reorderBadgeText}>Frequently reordered</AppText>
        </View>
      ) : null}

      {showOfferRow ? (
        <TouchableOpacity
          style={styles.offerRow}
          onPress={onOffersPress}
          activeOpacity={0.7}
          disabled={!onOffersPress}
        >
          {/* Same slide-up ticker as list-card MerchantOfferRow (not wipe/write). */}
          {offerTexts.length > 0 ? (
            <MerchantOfferRow texts={offerTexts} style={styles.offerTicker} />
          ) : (
            <View style={styles.offerTicker} />
          )}
          <View style={styles.offerCountWrap}>
            {offerCount > 0 ? (
              <AppText style={styles.offerCount}>
                {offerCount} {offerCount === 1 ? "offer" : "offers"}
              </AppText>
            ) : null}
            <Ionicons name="chevron-forward" size={14} color={StoreTheme.textSecondary} />
          </View>
        </TouchableOpacity>
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
    // Soft tuck under the banner — content must sit fully on white, never in the image.
    marginTop: -12,
    paddingHorizontal: 16,
    // paddingTop > |marginTop| so name / rating / info stay below the banner edge.
    paddingTop: 24,
    // Offer row owns its bottom hairline — avoid double gap under the card.
    paddingBottom: 0,
    zIndex: 2,
  },
  cardPadBottom: {
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
    marginTop: 5,
    flexShrink: 0,
  },
  ratingWrap: {
    flexShrink: 0,
    marginTop: 2,
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
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
    marginTop: 10,
    paddingVertical: 10,
    // Lite hairlines only — no elevation / shadow.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E8E8",
    borderBottomColor: "#E8E8E8",
  },
  offerTicker: {
    flex: 1,
    minWidth: 0,
  },
  offerCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  offerCount: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
  },
});
