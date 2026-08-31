/**
 * 2-column store card for the Free Packaging inner page (magic9-style item grid).
 */

import { memo, useCallback, useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
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
import { RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { useStoreBookmarkMutations, useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { DiscoveryColors } from "./discoveryTheme";

type Props = {
  merchant: MerchantSummary;
  weatherDelayMinutes?: number;
};

function DiscoveryPackagingGridCardInner({
  merchant,
  weatherDelayMinutes = 0,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookmarkSet } = useStoreBookmarks();
  const { syncBookmark } = useStoreBookmarkMutations();
  const saved = bookmarkSet.has(merchant.id);
  const { foodLocked } = usePreventServicesAtPin();
  const liveStatus = useMerchantLiveStatus(merchant);
  const isOpen = liveStatus === "OPEN";
  const listingBlocked = foodLocked;

  const bannerUri = useMemo(() => resolveMerchantFoodHeroPrimaryUri(merchant), [merchant]);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!bannerUri && !imageFailed;
  const eta = useMemo(
    () =>
      formatMerchantDeliveryTime(merchant, {
        weatherDelayMinutes,
        unit: "mins",
      }),
    [merchant, weatherDelayMinutes]
  );
  const ratingValue =
    merchant.avgRating != null && Number.isFinite(Number(merchant.avgRating)) && Number(merchant.avgRating) >= 0
      ? Number(merchant.avgRating).toFixed(1)
      : null;
  const cuisine = merchant.cuisines?.[0]?.trim() || null;
  const costForTwo = Number(
    (merchant as MerchantSummary & { costForTwo?: number }).costForTwo
  );

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
      style={[styles.card, (!isOpen || listingBlocked) && styles.cardDim]}
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
          <MenuItemImagePlaceholder size="lg" fill />
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
          <Ionicons name={saved ? "heart" : "heart-outline"} size={18} color={saved ? "#F43F5E" : "#FFFFFF"} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <AppText style={styles.name} numberOfLines={1}>
            {merchant.name}
          </AppText>
          {ratingValue ? (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={9} color="#FFFFFF" />
              <AppText style={styles.ratingText}>{ratingValue}</AppText>
            </View>
          ) : null}
        </View>
        {cuisine ? (
          <AppText style={styles.meta} numberOfLines={1}>
            {cuisine}
          </AppText>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.etaRow}>
            <Ionicons name="timer-outline" size={12} color={DiscoveryColors.textMuted} />
            <AppText style={styles.eta}>{eta}</AppText>
          </View>
          {Number.isFinite(costForTwo) && costForTwo > 0 ? (
            <AppText style={styles.price}>₹{Math.round(costForTwo)}</AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginBottom: 16,
  },
  cardDim: {
    opacity: 0.55,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  heartHit: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 4,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.2,
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
  footer: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  eta: {
    fontSize: 11,
    fontWeight: "600",
    color: DiscoveryColors.textMuted,
  },
  price: {
    fontSize: 14,
    fontWeight: "800",
    color: DiscoveryColors.gold,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: RATING_PILL_GREEN,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

export const DiscoveryPackagingGridCard = memo(DiscoveryPackagingGridCardInner);
