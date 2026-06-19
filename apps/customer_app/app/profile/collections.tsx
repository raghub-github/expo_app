/**
 * Your Collections — bookmarked restaurants (GatiMitra-style bookmarks list).
 */

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { BookmarkedStoreCard } from "@/components/collections/BookmarkedStoreCard";
import { BookmarkedDishCard } from "@/components/collections/BookmarkedDishCard";
import { CollectionsEmptyState } from "@/components/collections/CollectionsEmptyState";
import { fetchBookmarkedMerchantsSummary } from "@/lib/bookmarkedMerchants";
import { useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { useMenuItemBookmarks } from "@/hooks/useMenuItemBookmarks";
import { useLocationStore } from "@/store/locationStore";
import { addressService } from "@/services/address.service";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { ProfileTheme } from "@/constants/profileTheme";
import { GatiMitraColors } from "@/constants/gatimitra";

type TabId = "restaurants" | "dishes";

export default function CollectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const { bookmarkSet, isLoading: bookmarksLoading, refetch: refetchBookmarks } = useStoreBookmarks();
  const {
    bookmarkedItems: dishItems,
    isLoading: dishBookmarksLoading,
    refetch: refetchDishBookmarks,
  } = useMenuItemBookmarks();
  const [activeTab, setActiveTab] = useState<TabId>("restaurants");
  const [hiddenStoreIds, setHiddenStoreIds] = useState<Set<string>>(() => new Set());
  const [hiddenDishIds, setHiddenDishIds] = useState<Set<number>>(() => new Set());

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60 * 1000,
  });

  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 60 * 1000,
  });

  const deliveryContext = useMemo(() => {
    const resolved = resolveCheckoutDeliveryAddress(
      addresses,
      coords,
      locationSource,
      activeLocation
    );
    if (resolved) {
      return {
        addressId: resolved.id,
        drop: {
          lat: resolved.latitude,
          lng: resolved.longitude,
          pincode: resolved.pincode,
          city: resolved.city,
        },
      };
    }
    if (coords) {
      return {
        addressId: null as number | null,
        drop: { lat: coords.latitude, lng: coords.longitude },
      };
    }
    return { addressId: null as number | null, drop: null };
  }, [addresses, coords, locationSource, activeLocation]);

  const bookmarkIds = useMemo(() => [...bookmarkSet], [bookmarkSet]);
  const visibleStoreIds = useMemo(
    () => bookmarkIds.filter((id) => !hiddenStoreIds.has(id)),
    [bookmarkIds, hiddenStoreIds]
  );
  const visibleDishItems = useMemo(
    () => dishItems.filter((item) => !hiddenDishIds.has(item.menuItemId)),
    [dishItems, hiddenDishIds]
  );

  const {
    data: merchants = [],
    isLoading: merchantsLoading,
  } = useQuery({
    queryKey: [
      "bookmarked-merchants",
      visibleStoreIds.slice().sort().join(","),
      deliveryContext.addressId,
      deliveryContext.drop?.lat ?? null,
      deliveryContext.drop?.lng ?? null,
    ],
    queryFn: () => fetchBookmarkedMerchantsSummary(visibleStoreIds, deliveryContext),
    enabled: visibleStoreIds.length > 0,
    staleTime: 60 * 1000,
  });

  const handleStoreRemoved = useCallback((storeId: string) => {
    setHiddenStoreIds((prev) => new Set(prev).add(storeId));
  }, []);

  const handleDishRemoved = useCallback((menuItemId: number) => {
    setHiddenDishIds((prev) => new Set(prev).add(menuItemId));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setHiddenStoreIds(new Set());
      setHiddenDishIds(new Set());
      void refetchBookmarks();
      void refetchDishBookmarks();
    }, [refetchBookmarks, refetchDishBookmarks])
  );

  const restaurantsLoading =
    bookmarksLoading || (visibleStoreIds.length > 0 && merchantsLoading);
  const restaurantsEmpty = visibleStoreIds.length === 0;
  const dishesLoading = dishBookmarksLoading;
  const dishesEmpty = visibleDishItems.length === 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ProfileSubpageHeader
        title={t("profile.yourCollections")}
        onBack={() => router.back()}
      />

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "dishes" && styles.tabActive]}
          onPress={() => setActiveTab("dishes")}
        >
          <Text style={[styles.tabText, activeTab === "dishes" && styles.tabTextActive]}>
            {t("collections.dishes")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "restaurants" && styles.tabActive]}
          onPress={() => setActiveTab("restaurants")}
        >
          <Text style={[styles.tabText, activeTab === "restaurants" && styles.tabTextActive]}>
            {t("collections.restaurants")}
          </Text>
        </Pressable>
      </View>

      {activeTab === "dishes" ? (
        dishesLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
          </View>
        ) : dishesEmpty ? (
          <CollectionsEmptyState
            variant="dishes"
            onExplore={() => router.push("/home")}
          />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {visibleDishItems.map((item) => (
              <BookmarkedDishCard
                key={`${item.storeId}-${item.menuItemId}`}
                item={item}
                onRemoved={handleDishRemoved}
              />
            ))}
          </ScrollView>
        )
      ) : restaurantsLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
        </View>
      ) : restaurantsEmpty ? (
        <CollectionsEmptyState
          variant="restaurants"
          onExplore={() => router.push("/home")}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          {merchants.map((m) => (
            <BookmarkedStoreCard key={m.id} merchant={m} onRemoved={handleStoreRemoved} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ProfileTheme.border,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: GatiMitraColors.primaryMint,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  tabTextActive: {
    color: "#111827",
  },
  scroll: {
    flex: 1,
    backgroundColor: ProfileTheme.pageBg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
