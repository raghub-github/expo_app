/**
 * Horizontal "Back for More" rail — stores the user opened in the last 24h.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { MenuItemImagePlaceholder } from "@/components/store/MenuItemImagePlaceholder";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { resolveMerchantFoodHeroPrimaryUri } from "@/lib/merchantHeroMedia";
import { StoreOpenStatusBadge } from "@/components/home/StoreOpenStatusBadge";
import {
  recentlyViewedToLiveSummary,
  type RecentlyViewedStore,
} from "@/lib/recentlyViewedStores";
import { setStoreBookmark, type MerchantSummary } from "@/services/merchant.service";
import { useStoreBookmarkMutations, useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import { useMerchantLiveStatus } from "@/hooks/useMerchantLiveStatus";
import { isMerchantPureVeg } from "@/lib/pureVegFilter";
import { isMerchantCurrentlyOpen } from "@/lib/merchantListing";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { DiscoveryColors, DISCOVERY_PAGE_PAD } from "./discoveryTheme";

const CARD_W = 148;
const IMAGE_H = 148;
const RADIUS = 18;

type Props = {
  stores: RecentlyViewedStore[];
  /** Nearby-list merchants — same OPEN/CLOSED source as grid/classic cards. */
  liveMerchants?: MerchantSummary[];
  vegOnly?: boolean;
};

function formatMeta(store: RecentlyViewedStore, liveMerchant?: MerchantSummary): string {
  const kmRaw = liveMerchant?.distanceKm ?? store.distanceKm;
  const km =
    kmRaw != null && Number.isFinite(kmRaw)
      ? `${kmRaw >= 10 ? kmRaw.toFixed(0) : kmRaw.toFixed(1)}km`
      : null;
  const area = store.cuisines?.[0]?.trim() || liveMerchant?.cuisines?.[0]?.trim() || null;
  if (km && area) return `${km}, ${area}`;
  return km ?? area ?? "";
}

function BackForMoreCard({
  store,
  liveMerchant,
}: {
  store: RecentlyViewedStore;
  liveMerchant?: MerchantSummary;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookmarkSet } = useStoreBookmarks();
  const { syncBookmark } = useStoreBookmarkMutations();
  const saved = bookmarkSet.has(store.id);
  const merchant = useMemo(
    () => recentlyViewedToLiveSummary(store, liveMerchant),
    [store, liveMerchant]
  );
  const uri = useMemo(() => resolveMerchantFoodHeroPrimaryUri(merchant), [merchant]);
  const liveStatus = useMerchantLiveStatus(merchant, { seed: false });
  const isOpen = liveStatus === "OPEN";
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!uri && !imageFailed;
  const meta = formatMeta(store, liveMerchant);

  const open = useCallback(() => {
    navigateToMerchant(router, queryClient, merchant.id, merchant);
  }, [merchant, queryClient, router]);
  const cardPress = useScrollSafePress(open);

  const onHeart = useCallback(async () => {
    const next = !saved;
    syncBookmark(store.id, next);
    try {
      await setStoreBookmark(store.id, next);
    } catch {
      syncBookmark(store.id, saved);
    }
  }, [saved, store.id, syncBookmark]);

  return (
    <Pressable
      style={[styles.card, !isOpen && styles.cardDim]}
      onPress={cardPress.onPress}
      onPressIn={cardPress.onPressIn}
      onPressOut={cardPress.onPressOut}
      onTouchMove={cardPress.onTouchMove}
    >
      <View style={styles.imageWrap}>
        {showImage ? (
          <Image
            source={{ uri: uri! }}
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
          <View style={styles.heartBtn}>
            <Ionicons name={saved ? "heart" : "heart-outline"} size={15} color={saved ? "#F43F5E" : "#FFFFFF"} />
          </View>
        </Pressable>
      </View>
      <AppText style={styles.name} numberOfLines={1}>
        {store.name}
      </AppText>
      {meta ? (
        <AppText style={styles.meta} numberOfLines={1}>
          {meta}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function DiscoveryBackForMoreSectionInner({
  stores,
  liveMerchants = [],
  vegOnly = false,
}: Props) {
  const statusMap = useStoreStatusStore((s) => s.statusMap);
  const liveById = useMemo(() => {
    const map = new Map<string, MerchantSummary>();
    for (const merchant of liveMerchants) map.set(merchant.id, merchant);
    return map;
  }, [liveMerchants]);
  const visible = (vegOnly ? stores.filter((store) => isMerchantPureVeg(store)) : stores).filter(
    (store) =>
      isMerchantCurrentlyOpen(recentlyViewedToLiveSummary(store, liveById.get(store.id)), statusMap)
  );
  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <AppText style={styles.title}>Back for More</AppText>
        <LinearGradient
          colors={["#2DD4BF", "rgba(45,212,191,0.18)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.rule}
        />
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {visible.map((store) => (
          <BackForMoreCard
            key={store.id}
            store={store}
            liveMerchant={liveById.get(store.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: DISCOVERY_PAGE_PAD,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.3,
    flexShrink: 0,
  },
  rule: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  row: {
    paddingHorizontal: DISCOVERY_PAGE_PAD,
    gap: 12,
  },
  card: {
    width: CARD_W,
  },
  cardDim: {
    opacity: 0.55,
  },
  imageWrap: {
    width: CARD_W,
    height: IMAGE_H,
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: DiscoveryColors.card,
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
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "800",
    color: DiscoveryColors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
});

export const DiscoveryBackForMoreSection = memo(DiscoveryBackForMoreSectionInner);
