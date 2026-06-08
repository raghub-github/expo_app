/**
 * Compact 3-column grid tile — "Loved by Customers" (Swiggy Recommended-style).
 * Banner only on image (no carousel dots / gallery slide).
 */

import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { formatGridOfferBadge, gridDeliveryLabel } from "@/lib/merchantOfferBadge";
import {
  GridCardImageRatingMask,
  GridCardRatingCutout,
  GRID_RATING_PILL,
} from "@/components/home/GridCardRatingCutout";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PAD = 16;
const GRID_GAP = 10;
export const LOVED_GRID_COLS = 3;
export const MERCHANT_GRID_CARD_W = Math.floor(
  (SCREEN_W - GRID_PAD * 2 - GRID_GAP * (LOVED_GRID_COLS - 1)) / LOVED_GRID_COLS
);
const CARD_RADIUS = 14;

type MerchantGridCardProps = {
  merchant: MerchantSummary;
  onPress: () => void;
  weatherDelayMinutes?: number;
};

export function MerchantGridCard({ merchant, onPress, weatherDelayMinutes = 0 }: MerchantGridCardProps) {
  const bannerUri = resolveMerchantBannerUri(merchant);
  const offerBadge = formatGridOfferBadge(merchant.offerText);
  const { label: baseDeliveryLabel } = gridDeliveryLabel(merchant, weatherDelayMinutes);
  const deliveryLabel =
    weatherDelayMinutes > 0 ? `${baseDeliveryLabel} · Rain Delay` : baseDeliveryLabel;
  const imageSize = MERCHANT_GRID_CARD_W;

  return (
    <View style={styles.card}>
      <View style={[styles.imageStage, { width: imageSize }]}>
        <View style={[styles.imageClip, { width: imageSize, height: imageSize }]}>
          <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={styles.imageTap}>
            <StoreBannerCarousel
              bannerUri={bannerUri}
              galleryUris={[]}
              width={imageSize}
              height={imageSize}
              borderRadius={CARD_RADIUS}
              hidePlaceholderIcon
              showDots={false}
            />
            {offerBadge ? (
              <View style={styles.offerImageTag}>
                <Text style={styles.offerImageTagText} numberOfLines={2}>
                  {offerBadge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <GridCardImageRatingMask imageRadius={CARD_RADIUS} />
        </View>

        <GridCardRatingCutout
          rating={merchant.avgRating}
          totalReviews={merchant.totalReviews}
        />
      </View>

      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {merchant.name}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={11} color="#9CA3AF" />
          <Text style={styles.metaText} numberOfLines={1}>
            {deliveryLabel}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MERCHANT_GRID_CARD_W,
    marginBottom: 14,
  },
  imageStage: {
    position: "relative",
    overflow: "visible",
    zIndex: 1,
  },
  imageClip: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  imageTap: {
    flex: 1,
  },
  offerImageTag: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 6,
    maxWidth: MERCHANT_GRID_CARD_W - 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 3,
  },
  offerImageTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 12,
  },
  body: {
    paddingTop: GRID_RATING_PILL.overhang + 3,
    paddingHorizontal: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    flex: 1,
  },
});
