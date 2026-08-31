/**
 * Horizontal discovery restaurant card — image left, meta right, teal offer badge.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { MenuItemImagePlaceholder } from "@/components/store/MenuItemImagePlaceholder";
import { setStoreBookmark, type MerchantSummary } from "@/services/merchant.service";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import { useMerchantLiveStatus } from "@/hooks/useMerchantLiveStatus";
import { usePreventServicesAtPin } from "@/hooks/usePreventServicesAtPin";
import { resolveMerchantFoodHeroPrimaryUri } from "@/lib/merchantHeroMedia";
import { StoreOpenStatusBadge } from "@/components/home/StoreOpenStatusBadge";
import { formatMerchantDeliveryTime } from "@/lib/merchantDeliveryTime";
import { formatMerchantDistanceKm } from "@/lib/merchantDistance";
import { formatCardOfferLine, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { useStoreBookmarkMutations, useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { DiscoveryColors, DISCOVERY_PAGE_PAD, DISCOVERY_RESTAURANT_CARD_H } from "./discoveryTheme";

const IMG = 96;
const RADIUS = 14;

/** Distance (m/km) when known; otherwise "Near & Fast" — never "0.0km". */
function formatDistanceArea(merchant: MerchantSummary): string {
  const distance = formatMerchantDistanceKm(merchant.distanceKm) ?? "Near & Fast";
  const area = merchant.cuisines?.[0]?.trim() || null;
  if (area) return `${distance}, ${area}`;
  return distance;
}

function formatOfferBadge(offerText: string | null | undefined): string | null {
  const line = formatCardOfferLine(offerText);
  if (!line) return null;
  const pctUpto = line.match(/(\d+)\s*%\s*OFF(?:\s+upto\s+₹\s*(\d+))?/i);
  if (pctUpto) {
    const pct = pctUpto[1];
    const cap = pctUpto[2];
    return cap ? `Save ${pct}% up to ₹${cap}` : `Save ${pct}%`;
  }
  const flat = line.match(/₹\s*(\d+)\s*OFF/i);
  if (flat) return `Save ₹${flat[1]}`;
  return line.length <= 28 ? line : `${line.slice(0, 26).trim()}…`;
}

type Props = {
  merchant: MerchantSummary;
  weatherDelayMinutes?: number;
};

function DiscoveryRestaurantCardInner({ merchant, weatherDelayMinutes = 0 }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookmarkSet } = useStoreBookmarks();
  const { syncBookmark } = useStoreBookmarkMutations();
  const saved = bookmarkSet.has(merchant.id);
  const { foodLocked } = usePreventServicesAtPin();
  const liveStatus = useMerchantLiveStatus(merchant);
  const isOpen = liveStatus === "OPEN";
  const listingBlocked = foodLocked;
  const { width } = useWindowDimensions();
  const cardW = width - DISCOVERY_PAGE_PAD * 2;

  const bannerUri = useMemo(() => resolveMerchantFoodHeroPrimaryUri(merchant), [merchant]);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!bannerUri && !imageFailed;
  const offerBadge = useMemo(() => formatOfferBadge(merchant.offerText), [merchant.offerText]);
  const meta = formatDistanceArea(merchant);
  const eta = useMemo(
    () =>
      formatMerchantDeliveryTime(merchant, {
        weatherDelayMinutes,
        unit: "mins",
      }),
    [merchant, weatherDelayMinutes]
  );
  const costForTwo = (merchant as MerchantSummary & { costForTwo?: number }).costForTwo;
  const ratingValue =
    merchant.avgRating != null && Number.isFinite(Number(merchant.avgRating)) && Number(merchant.avgRating) >= 0
      ? Number(merchant.avgRating).toFixed(1)
      : null;

  const openMerchant = useCallback(() => {
    if (listingBlocked) return;
    navigateToMerchant(router, queryClient, merchant.id, merchant);
  }, [listingBlocked, merchant, queryClient, router]);

  const cardPress = useScrollSafePress(openMerchant, {
    onPressIn: () => {
      if (listingBlocked) return;
      warmMerchantHeroImage(merchant.id, bannerUri);
    },
  });

  const onHeart = useCallback(async () => {
    const next = !saved;
    syncBookmark(merchant.id, next);
    try {
      const res = await setStoreBookmark(merchant.id, next);
      if (res.saved !== next) syncBookmark(merchant.id, res.saved);
    } catch {
      syncBookmark(merchant.id, saved);
    }
  }, [merchant.id, saved, syncBookmark]);

  return (
    <Pressable
      style={[styles.card, { width: cardW }, (!isOpen || listingBlocked) && styles.cardDim]}
      onPress={cardPress.onPress}
      onPressIn={cardPress.onPressIn}
      onPressOut={cardPress.onPressOut}
      onTouchMove={cardPress.onTouchMove}
      disabled={listingBlocked}
    >
      <View style={styles.imageWrap}>
        {showImage ? (
          <Image
            source={{ uri: bannerUri! }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MenuItemImagePlaceholder size="md" fill />
        )}
        <StoreOpenStatusBadge
          compact
          isOpen={isOpen}
          nextOpenAt={merchant.nextOpenAt}
          nextCloseAt={merchant.nextCloseAt}
        />
        <Pressable
          style={styles.heartHit}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            void onHeart();
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove bookmark" : "Save store"}
        >
          <View style={styles.heartBtn}>
            <Ionicons name={saved ? "heart" : "heart-outline"} size={14} color={saved ? "#F43F5E" : "#FFFFFF"} />
          </View>
        </Pressable>
      </View>

      <View style={styles.body}>
        <AppText style={styles.name} numberOfLines={1}>
          {merchant.name}
        </AppText>
        {meta ? (
          <AppText style={styles.meta} numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
        <View style={styles.dashRow}>
          {Array.from({ length: 18 }, (_, i) => (
            <View key={i} style={styles.dashDot} />
          ))}
        </View>
        {costForTwo != null && Number.isFinite(costForTwo) && costForTwo > 0 ? (
          <AppText style={styles.price} numberOfLines={1}>
            ₹{Math.round(costForTwo)} for two
          </AppText>
        ) : null}
        <View style={styles.footerRow}>
          <AppText style={styles.eta} numberOfLines={1}>
            Delivers in {eta}
          </AppText>
          {ratingValue ? (
            <View style={styles.ratingPill} accessibilityLabel={`${ratingValue} rating`}>
              <Ionicons name="star" size={10} color="#FFFFFF" />
              <AppText style={styles.ratingText}>{ratingValue}</AppText>
            </View>
          ) : null}
        </View>
      </View>

      {offerBadge ? (
        <View style={styles.offerBadge} pointerEvents="none">
          <AppText style={styles.offerBadgeText} numberOfLines={2}>
            {offerBadge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    flexDirection: "row",
    minHeight: DISCOVERY_RESTAURANT_CARD_H,
    backgroundColor: DiscoveryColors.card,
    borderRadius: RADIUS,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardDim: {
    opacity: 0.55,
  },
  imageWrap: {
    width: IMG,
    height: IMG,
    margin: 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  heartHit: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 4,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingTop: 12,
    paddingRight: 72,
    paddingBottom: 12,
    justifyContent: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.2,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
  dashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    marginBottom: 8,
    width: "88%",
    overflow: "hidden",
  },
  dashDot: {
    width: 4,
    height: 1,
    backgroundColor: DiscoveryColors.dashed,
  },
  price: {
    fontSize: 12,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
    marginBottom: 2,
  },
  eta: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: DiscoveryColors.text,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    marginRight: -60,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: RATING_PILL_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  offerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    maxWidth: 108,
    backgroundColor: DiscoveryColors.offerBadge,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomLeftRadius: 10,
  },
  offerBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 13,
    textAlign: "right",
  },
});

export const DiscoveryRestaurantCard = memo(DiscoveryRestaurantCardInner);
