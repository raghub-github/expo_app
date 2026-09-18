import React from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { MerchantOfferRow } from "@/components/home/MerchantOfferRow";
import {
  ClassicLowestPriceStamp,
  CLASSIC_LOWEST_PRICE_STAMP_WIDTH,
} from "@/components/home/ClassicLowestPriceStamp";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
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
  /** Classic/grid-first storefront — stamp + single meta row + GM promo. */
  classicLayout?: boolean;
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
  classicLayout = false,
  onInfoPress,
  onLocationPress,
  onSchedulePress,
  onOffersPress,
  onRatingHintPress,
}: StoreInfoCardProps) {
  const dark = useMerchantUiDark();
  const useClassic = classicLayout && !dark;
  const locationText = [
    formatMerchantDistanceKm(distanceKm),
    areaLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const areaOnly = (areaLabel ?? "").trim() || null;
  const ratingValue =
    avgRating != null && Number.isFinite(Number(avgRating)) && Number(avgRating) > 0
      ? Number(avgRating).toFixed(1)
      : null;

  // Only show when platform/store offers are actually mapped — never reserve empty space.
  const showOfferRow = offerTexts.length > 0 || offerCount > 0;

  if (useClassic) {
    return (
      <View style={[styles.card, styles.cardClassic, !showOfferRow && styles.cardPadBottom]}>
        <View style={styles.classicTopRow}>
          <View style={styles.classicNameBlock}>
            <AppText style={styles.name} numberOfLines={2}>
              {name}
            </AppText>
            <TouchableOpacity onPress={onInfoPress} hitSlop={8} style={styles.infoBtn}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={StoreTheme.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.classicStampWrap} pointerEvents="none">
            <ClassicLowestPriceStamp />
          </View>
        </View>

        <TouchableOpacity
          style={styles.classicMetaRow}
          onPress={onLocationPress ?? onSchedulePress}
          activeOpacity={0.75}
          disabled={!onLocationPress && !onSchedulePress}
        >
          {ratingValue ? (
            <>
              <TouchableOpacity
                onPress={onRatingHintPress}
                disabled={!onRatingHintPress}
                hitSlop={6}
                style={styles.classicRatingChip}
              >
                <Ionicons name="star" size={12} color={GatiMitraColors.deepMintStart} />
                <AppText style={styles.classicRatingText}>{ratingValue}</AppText>
              </TouchableOpacity>
              {(etaLabel || areaOnly) ? <View style={styles.classicMetaSep} /> : null}
            </>
          ) : null}
          {etaLabel ? (
            <AppText style={styles.classicMetaText} numberOfLines={1}>
              {etaLabel}
            </AppText>
          ) : null}
          {etaLabel && areaOnly ? <View style={styles.classicMetaSep} /> : null}
          {areaOnly ? (
            <View style={styles.classicArea}>
              <AppText style={styles.classicMetaText} numberOfLines={1}>
                {areaOnly}
              </AppText>
              <Ionicons name="chevron-down" size={13} color={StoreTheme.textSecondary} />
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.classicPromo}>
          <View style={styles.classicPromoHearts} pointerEvents="none">
            <Ionicons name="heart" size={12} color={GatiMitraColors.deepMintStart} />
            <Ionicons
              name="heart"
              size={12}
              color={GatiMitraColors.deepMintStart}
              style={styles.classicPromoHeartOverlap}
            />
          </View>
          <View style={styles.classicPromoTextCol}>
            <AppText style={styles.classicPromoTitle} numberOfLines={1}>
              35-45% LOWER PRICES vs OTHER APPS
            </AppText>
            <AppText style={styles.classicPromoSub} numberOfLines={1}>
              Prices seen only on GatiMitra
            </AppText>
          </View>
        </View>

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

  return (
    <View style={[styles.card, dark && styles.cardDark, !showOfferRow && styles.cardPadBottom]}>
      <View style={styles.topRow}>
        <View style={styles.nameBlock}>
          <AppText style={[styles.name, dark && styles.nameDark]} numberOfLines={2}>
            {name}
          </AppText>
          <TouchableOpacity onPress={onInfoPress} hitSlop={8} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={18} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
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
          <Ionicons name="location-outline" size={15} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
          <AppText style={[styles.metaText, dark && styles.metaTextDark]} numberOfLines={1}>
            {locationText}
          </AppText>
          <Ionicons name="chevron-down" size={14} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {etaLabel ? (
        <TouchableOpacity style={styles.metaRow} onPress={onSchedulePress} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={15} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
          <AppText style={[styles.metaText, dark && styles.metaTextDark]} numberOfLines={1}>
            {etaLabel} · Schedule for later
          </AppText>
          <Ionicons name="chevron-down" size={14} color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary} />
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
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    zIndex: 2,
  },
  cardClassic: {
    overflow: "visible",
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.bg,
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
  classicTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
    overflow: "visible",
  },
  classicNameBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    minWidth: 0,
    paddingRight: 4,
  },
  classicStampWrap: {
    width: CLASSIC_LOWEST_PRICE_STAMP_WIDTH,
    alignItems: "center",
    flexShrink: 0,
    marginTop: -4,
    overflow: "visible",
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
  nameDark: {
    color: MerchantDarkPalette.text,
  },
  infoBtn: {
    marginTop: 5,
    flexShrink: 0,
  },
  ratingWrap: {
    flexShrink: 0,
    marginTop: 2,
  },
  classicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
    marginBottom: 10,
  },
  classicRatingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  classicRatingText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  classicMetaSep: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: "#D1D5DB",
  },
  classicMetaText: {
    fontSize: 13,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    flexShrink: 1,
  },
  classicArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  classicPromo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  classicPromoHearts: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    width: 20,
  },
  classicPromoHeartOverlap: {
    marginLeft: -6,
  },
  classicPromoTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  classicPromoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraColors.deepMintStart,
    letterSpacing: 0.2,
  },
  classicPromoSub: {
    fontSize: 11,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
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
  metaTextDark: {
    color: MerchantDarkPalette.textMuted,
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
