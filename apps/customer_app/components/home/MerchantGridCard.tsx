/**
 * Swiggy-style 2-column grid tile for "Loved by Customers" (reference-matched).
 */

import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import {
  resolveMerchantBannerUri,
  resolveMerchantGalleryUris,
} from "@/lib/merchantBanner";
import { formatGridOfferBadge, gridDeliveryLabel } from "@/lib/merchantOfferBadge";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PAD = 16;
const GRID_GAP = 12;
export const LOVED_GRID_COLS = 2;
export const MERCHANT_GRID_CARD_W = Math.floor(
  (SCREEN_W - GRID_PAD * 2 - GRID_GAP * (LOVED_GRID_COLS - 1)) / LOVED_GRID_COLS
);
const IMAGE_H = 132;
const IMAGE_RADIUS = 12;

type MerchantGridCardProps = {
  merchant: MerchantSummary;
  onPress: () => void;
};

export function MerchantGridCard({ merchant, onPress }: MerchantGridCardProps) {
  const bannerUri = resolveMerchantBannerUri(merchant);
  const galleryUris = resolveMerchantGalleryUris(merchant);
  const rating =
    merchant.avgRating != null && Number(merchant.avgRating) >= 0
      ? Number(merchant.avgRating).toFixed(1)
      : null;
  const offerLabel = formatGridOfferBadge(merchant.offerText);
  const { label: deliveryLabel, isFast } = gridDeliveryLabel(merchant);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.imageWrap}>
        <StoreBannerCarousel
          bannerUri={bannerUri}
          galleryUris={galleryUris}
          width={MERCHANT_GRID_CARD_W}
          height={IMAGE_H}
          borderRadius={IMAGE_RADIUS}
          hidePlaceholderIcon
          showDots={false}
        />
        {offerLabel ? (
          <View style={styles.offerTag}>
            <Text style={styles.offerTagText} numberOfLines={2}>
              {offerLabel}
            </Text>
          </View>
        ) : null}
        {rating ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={styles.ratingText}>{rating}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {merchant.name}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons
          name={isFast ? "flash" : "time-outline"}
          size={13}
          color={isFast ? "#24963e" : "#9ca3af"}
        />
        <Text style={[styles.metaText, isFast && styles.metaTextFast]} numberOfLines={1}>
          {deliveryLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MERCHANT_GRID_CARD_W,
    marginBottom: 14,
  },
  imageWrap: {
    width: "100%",
    height: IMAGE_H,
    borderRadius: IMAGE_RADIUS,
    overflow: "hidden",
    backgroundColor: "#e8eaed",
    position: "relative",
  },
  offerTag: {
    position: "absolute",
    top: 8,
    left: 8,
    maxWidth: MERCHANT_GRID_CARD_W * 0.88,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 13,
  },
  ratingBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#24963e",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1c1c1c",
    marginTop: 8,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    flex: 1,
  },
  metaTextFast: {
    color: "#24963e",
    fontWeight: "600",
  },
});
