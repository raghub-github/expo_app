/**
 * Your Collections — bookmarked restaurants (GatiMitra-style bookmarks list).
 */

import { useCallback, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, StyleSheet, ActivityIndicator, Pressable } from "react-native";
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
  const {
    bookmarkSet,
    isLoading: bookmarksLoading,
    isError: bookmarksError,
    isAuthenticated: storeBookmarksAuthed,
    refetch: refetchBookmarks,
  } = useStoreBookmarks();
  const {
    bookmarkedItems: dishItems,
    isLoading: dishBookmarksLoading,
    isError: dishBookmarksError,
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
    isError: merchantsError,
    refetch: refetchMerchants,
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
  // Distinguish a FAILED fetch from a genuinely empty collection. Previously both
  // read as "empty", so an API error silently hid the user's saved restaurants.
  const restaurantsErrored =
    bookmarksError || (visibleStoreIds.length > 0 && (merchantsError || merchants.length === 0));
  const restaurantsEmpty = !restaurantsErrored && visibleStoreIds.length === 0;
  const dishesLoading = dishBookmarksLoading;
  const dishesErrored = dishBookmarksError;
  const dishesEmpty = !dishesErrored && visibleDishItems.length === 0;

  const retryRestaurants = useCallback(() => {
    void refetchBookmarks();
    void refetchMerchants();
  }, [refetchBookmarks, refetchMerchants]);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[collections] render decision", {
      tab: activeTab,
      authed: storeBookmarksAuthed,
      restaurants: {
        bookmarkIds: visibleStoreIds.length,
        merchantsResolved: merchants.length,
        state: restaurantsLoading
          ? "loading"
          : restaurantsErrored
            ? "error"
            : restaurantsEmpty
              ? "empty"
              : "data",
      },
      dishes: {
        items: visibleDishItems.length,
        state: dishesLoading
          ? "loading"
          : dishesErrored
            ? "error"
            : dishesEmpty
              ? "empty"
              : "data",
      },
    });
  }

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
          <AppText style={[styles.tabText, activeTab === "dishes" && styles.tabTextActive]}>
            {t("collections.dishes")}
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "restaurants" && styles.tabActive]}
          onPress={() => setActiveTab("restaurants")}
        >
          <AppText style={[styles.tabText, activeTab === "restaurants" && styles.tabTextActive]}>
            {t("collections.restaurants")}
          </AppText>
        </Pressable>
      </View>

      {activeTab === "dishes" ? (
        dishesLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
          </View>
        ) : dishesErrored ? (
          <CollectionsErrorState onRetry={() => void refetchDishBookmarks()} />
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
      ) : restaurantsErrored ? (
        <CollectionsErrorState onRetry={retryRestaurants} />
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

/**
 * Shown when a bookmarks fetch FAILS (as opposed to being genuinely empty). A
 * transient/API error must offer a retry instead of masquerading as "no items".
 */
function CollectionsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorWrap}>
      <AppText style={styles.errorTitle}>Couldn&apos;t load your collections</AppText>
      <AppText style={styles.errorSub}>Check your connection and try again.</AppText>
      <Pressable style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
        <AppText style={styles.retryBtnText}>Retry</AppText>
      </Pressable>
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
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  errorSub: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
