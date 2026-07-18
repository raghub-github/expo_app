/**
 * Compact horizontal restaurant card for home "Popular Restaurants Near You".
 */

import { useState, useCallback } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import {
  resolveMerchantBannerUri,
  resolveMerchantGalleryUris,
} from "@/lib/merchantBanner";
import { gridDeliveryLabel } from "@/lib/merchantOfferBadge";

export const HOME_RESTAURANT_CARD_W = 220;
const IMAGE_H = 130;

type Props = {
  merchant: MerchantSummary;
  weatherDelayMinutes?: number;
};

export function HomePopularRestaurantCard({ merchant, weatherDelayMinutes = 0 }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);

  const bannerUri = resolveMerchantBannerUri(merchant);
  const galleryUris = resolveMerchantGalleryUris(merchant);
  const rating =
    merchant.avgRating != null && Number(merchant.avgRating) >= 0
      ? Number(merchant.avgRating).toFixed(1)
      : null;
  const { label: deliveryLabel } = gridDeliveryLabel(merchant, weatherDelayMinutes);
  const etaLabel =
    weatherDelayMinutes > 0 ? `${deliveryLabel} · Rain` : deliveryLabel.replace(/\bmins\b/, "min");

  const cuisine = merchant.cuisines?.[0]?.trim() || "Multi-cuisine";
  const priceForTwo = "₹200 for two";

  const onPress = () => router.push(`/home/merchant/${merchant.id}` as never);

  const onToggleSave = useCallback(async () => {
    if (savedLoading) return;
    setSavedLoading(true);
    const next = !saved;
    setSaved(next);
    try {
      await setStoreBookmark(merchant.id, next);
    } catch {
      setSaved(!next);
    } finally {
      setSavedLoading(false);
    }
  }, [merchant.id, saved, savedLoading]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.imageWrap}>
        <StoreBannerCarousel
          bannerUri={bannerUri}
          galleryUris={galleryUris}
          width={HOME_RESTAURANT_CARD_W}
          height={IMAGE_H}
          borderRadius={14}
          hidePlaceholderIcon
          showDots={false}
        />
        <View style={styles.etaBadge}>
          <Ionicons name="time-outline" size={10} color="#fff" />
          <AppText style={styles.etaText} numberOfLines={1}>
            {etaLabel}
          </AppText>
        </View>
        <TouchableOpacity
          style={styles.heartBtn}
          onPress={onToggleSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={saved ? "Remove from favorites" : "Add to favorites"}
        >
          <Ionicons
            name={saved ? "heart" : "heart-outline"}
            size={18}
            color={saved ? "#EF4444" : "#fff"}
          />
        </TouchableOpacity>
      </View>

      <AppText style={styles.name} numberOfLines={1}>
        {merchant.name}
      </AppText>

      <View style={styles.metaRow}>
        {rating ? (
          <>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <AppText style={styles.rating}>{rating}</AppText>
            <AppText style={styles.dot}>•</AppText>
          </>
        ) : null}
        <AppText style={styles.metaText} numberOfLines={1}>
          {cuisine}
        </AppText>
        <AppText style={styles.dot}>•</AppText>
        <AppText style={styles.metaText} numberOfLines={1}>
          {priceForTwo}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: HOME_RESTAURANT_CARD_W,
    marginRight: 12,
  },
  imageWrap: {
    width: "100%",
    height: IMAGE_H,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    position: "relative",
  },
  etaBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: HOME_RESTAURANT_CARD_W * 0.72,
  },
  etaText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  heartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "nowrap",
    gap: 4,
  },
  rating: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    flexShrink: 1,
  },
  dot: {
    fontSize: 12,
    color: "#D1D5DB",
  },
});
