import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { OfferHoldEraseText } from "./OfferHoldEraseText";
import { StoreOfferBadgeIcon } from "./StoreInnerContinueCartBar";

export type StoreInfoCardProps = {
  name: string;
  logoUrl?: string | null;
  avgRating?: number | null;
  totalReviews?: number | null;
  distanceKm?: number | null;
  areaLabel?: string | null;
  etaLabel?: string | null;
  /** When user picks a slot from schedule sheet, show this instead of default ETA row. */
  scheduledLabel?: string | null;
  /** Rotating offer lines shown in the offer strip (actual offer text, not store name). */
  offerTexts?: string[];
  offerCount?: number;
  /** Reserve offer strip space before network offers resolve (prevents layout jump). */
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
  scheduledLabel,
  offerTexts = [],
  offerCount = 0,
  reserveOfferRow = false,
  isFrequentlyReordered,
  onInfoPress,
  onLocationPress,
  onSchedulePress,
  onOffersPress,
  onRatingHintPress,
}: StoreInfoCardProps) {
  const locationText = [
    distanceKm != null ? `${distanceKm.toFixed(1)} km` : null,
    areaLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasOffers = offerTexts.length > 0 || offerCount > 0;
  const showOfferRow = hasOffers || reserveOfferRow;

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
        <MerchantRatingBadge
          rating={avgRating}
          totalReviews={totalReviews}
          showReviewHint
          size="md"
          onReviewHintPress={onRatingHintPress}
        />
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

      {showOfferRow ? (
        <>
          <View style={styles.divider} />
          <View style={styles.offerRow}>
            <StoreOfferBadgeIcon size={24} />
            <OfferHoldEraseText
              texts={offerTexts}
              onPress={onOffersPress}
            />
            {offerCount > 0 ? (
              <TouchableOpacity style={styles.offerCountWrap} onPress={onOffersPress} activeOpacity={0.7}>
                <Text style={styles.offerCount}>
                  {offerCount} {offerCount === 1 ? "offer" : "offers"}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={StoreTheme.textSecondary} />
              </TouchableOpacity>
            ) : offerTexts.length > 0 || reserveOfferRow ? (
              <TouchableOpacity style={styles.offerCountWrap} onPress={onOffersPress} activeOpacity={0.7}>
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
