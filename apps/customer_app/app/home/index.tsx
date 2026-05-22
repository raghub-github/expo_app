/**
 * Food Delivery – 2025 GatiMitra UI.
 * Full rebuild: GMHeader, GMSearchBar, GMCategoryRail, GMRestaurantCardV2, GMEmptyState.
 * Real data only. Spacing: 16px page, 18px cards, 24px section gap.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { createAnimatedComponent } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { merchantService } from "@/services/merchant.service";
import { addressService } from "@/services/address.service";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import {
  fetchUserAppCategories,
  type UserAppCategoryItem,
} from "@/services/userAppCategory.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { BrandingFooter } from "@/components/BrandingFooter";
import {
  CategoryRailSkeleton,
  HomeOfferBannerSkeleton,
  LovedMerchantsGridSkeleton,
  RestaurantListSkeleton,
} from "@/components/ShimmerSkeleton";
import { HomeFeaturedOfferCard } from "@/components/home/HomeFeaturedOfferCard";
import { MerchantGridCard } from "@/components/home/MerchantGridCard";
import { pickLovedByCustomersMerchants } from "@/lib/lovedByCustomers";
import { GMHeader } from "@/components/GMHeader";
import { HEADER_TOP_PADDING_NONE } from "@/constants/layout";
import { GMSearchBar } from "@/components/GMSearchBar";
import { GMRestaurantCardV2 } from "@/components/GMRestaurantCardV2";
import { GMEmptyState } from "@/components/GMEmptyState";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  filterAndSortMerchants,
  merchantListingStoreCountLabel,
} from "@/lib/merchantListing";
import { offersService } from "@/services/offers.service";

const AnimatedScrollView = createAnimatedComponent(ScrollView);

const PAGE_PAD = 16;
const SECTION_GAP = 24;
const SECTION_GAP_SM = 10;
/** Vertical gap between the two tiles in each column. */
const RAIL_ROW_GAP = 10;
/** Target 4 category columns on screen (2 rows of pairs → 8 items visible before scroll). */
const CATEGORY_RAIL_TARGET_COLUMNS = 4;

const OFFERS_SECTION_PAD = 10;
const OFFER_CARD_HEIGHT = 148;
const OFFER_GAP = 12;

type SortOption = "default" | "rating" | "distance";

type DeliveryFilter = "any" | "30" | "45" | "60";
const DELIVERY_OPTIONS: { id: DeliveryFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "30", label: "Under 30 min" },
  { id: "45", label: "Under 45 min" },
  { id: "60", label: "Under 60 min" },
];

const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Fast Food", "Bakery", "Desserts"];

const HOME_CATEGORY_STORE_TYPE = "FOOD";

const DEFAULT_CATEGORY_GRID_IMAGE = require("../../public/img/ndf.png");

function dedupeUserAppCategories(rows: UserAppCategoryItem[]): UserAppCategoryItem[] {
  const byId = new Map<number, UserAppCategoryItem>();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const byName = new Map<string, UserAppCategoryItem>();
  for (const r of byId.values()) {
    const key = r.name.trim().toLowerCase();
    const cur = byName.get(key);
    if (!cur || r.displayOrder < cur.displayOrder || (r.displayOrder === cur.displayOrder && r.id < cur.id)) {
      byName.set(key, r);
    }
  }
  return [...byName.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id
  );
}

function HomeCategoryGridImage({ imageUrl, size }: { imageUrl: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  const uri = useMemo(
    () => (imageUrl ? (toAbsoluteImageUrl(imageUrl) ?? imageUrl) : null),
    [imageUrl]
  );
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <Image source={DEFAULT_CATEGORY_GRID_IMAGE} style={{ width: size, height: size }} resizeMode="contain" />
  );
}

function chunkIntoPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

type CategoryRailLayout = {
  itemW: number;
  columnGap: number;
  circle: number;
  imgSize: number;
};

/** Sizes the rail so N columns fit in the first viewport without clipping. */
function computeCategoryRailMetrics(windowWidth: number, insetRight: number): CategoryRailLayout {
  const n = CATEGORY_RAIL_TARGET_COLUMNS;
  const usable = Math.max(
    0,
    windowWidth - PAGE_PAD - Math.max(4, insetRight) - 2
  );
  let columnGap = 6;
  let itemW = (usable - (n - 1) * columnGap) / n;
  if (itemW < 52) {
    columnGap = 4;
    itemW = (usable - (n - 1) * columnGap) / n;
  }
  if (itemW < 50) {
    columnGap = 3;
    itemW = (usable - (n - 1) * columnGap) / n;
  }
  itemW = Math.floor(Math.max(48, itemW));
  const circle = Math.min(52, Math.max(44, Math.round(itemW - 6)));
  const imgSize = Math.round(circle * 0.88);
  return { itemW, columnGap, circle, imgSize };
}

export default function FoodMerchantsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const {
    address,
    coords,
    permissionStatus,
    locationSource,
    locationHydrated,
    refetchLocation,
    requestPermissionAndFetch,
  } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 400);
  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60 * 1000,
  });
  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
  });

  /**
   * Canonical delivery anchor for merchant listing distance:
   * - If user explicitly selected a pin, snap it to a saved address within 250m (same as checkout)
   * - Else prefer backend "active location" (saved delivery address) over device GPS drift
   * - Else fallback to current debounced coords
   *
   * This ensures distance labels stay consistent across: list → merchant page → checkout.
   */
  const merchantsAnchorCoords = useMemo(() => {
    if (
      locationSource === "selected" &&
      debouncedCoords?.latitude != null &&
      debouncedCoords.longitude != null &&
      addresses.length > 0
    ) {
      const resolved = resolveCheckoutDeliveryAddress(
        addresses,
        debouncedCoords,
        locationSource,
        activeLocation
      );
      if (resolved) {
        return { latitude: resolved.latitude, longitude: resolved.longitude };
      }
    }

    if (
      activeLocation?.latitude != null &&
      activeLocation?.longitude != null &&
      locationSource !== "selected"
    ) {
      return { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    }

    return debouncedCoords;
  }, [
    locationSource,
    debouncedCoords?.latitude,
    debouncedCoords?.longitude,
    addresses,
    activeLocation?.latitude,
    activeLocation?.longitude,
  ]);

  const [vegOnly, setVegOnly] = useState(false);
  const [openNow, setOpenNow] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("any");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [filterHasOffers, setFilterHasOffers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: merchantsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "merchants",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      vegOnly,
    ],
    queryFn: () =>
      merchantService.getMerchants({
        limit: 20,
        ...(merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null
          ? { lat: merchantsAnchorCoords.latitude, lng: merchantsAnchorCoords.longitude }
          : {}),
        vegOnly,
        distanceMode: "road",
      }),
    // Industry-standard: only fetch restaurants once we have an active location (GPS or user-selected).
    enabled: merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const offerLocationParams = useMemo(() => {
    const pincode = address?.pincode?.trim() || undefined;
    const state = address?.state?.trim() || undefined;
    const city = address?.city?.trim() || undefined;
    return { pincode, state, city };
  }, [address?.pincode, address?.state, address?.city]);

  const {
    data: featuredOffersData,
    isLoading: featuredOffersLoading,
    refetch: refetchFeaturedOffers,
  } = useQuery({
    queryKey: [
      "featured-offers-home",
      merchantsAnchorCoords?.latitude,
      merchantsAnchorCoords?.longitude,
      offerLocationParams.pincode,
      offerLocationParams.state,
      offerLocationParams.city,
    ],
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: offerLocationParams.pincode,
        state: offerLocationParams.state,
        city: offerLocationParams.city,
        lat: merchantsAnchorCoords?.latitude,
        lng: merchantsAnchorCoords?.longitude,
        serviceType: "FOOD",
        limit: 6,
      }),
    enabled:
      merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const homeFeaturedOffers = featuredOffersData?.offers ?? [];

  const {
    data: apiHomeCategories = [],
    isSuccess: homeCategoriesReady,
    isLoading: homeCategoriesLoading,
    refetch: refetchHomeCategories,
  } = useQuery({
    queryKey: ["userAppCategories", HOME_CATEGORY_STORE_TYPE],
    queryFn: () => fetchUserAppCategories({ storeType: HOME_CATEGORY_STORE_TYPE }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const homeCategoryRailItems = useMemo(() => {
    if (!homeCategoriesReady) return [];
    const deduped = dedupeUserAppCategories(apiHomeCategories ?? []);
    return deduped.map((r) => ({
      id: String(r.id),
      name: r.name,
      slug: String(r.id),
      imageUrl: r.imageUrl,
    }));
  }, [homeCategoriesReady, apiHomeCategories]);

  const homeCategoryRailColumns = useMemo(
    () => chunkIntoPairs(homeCategoryRailItems),
    [homeCategoryRailItems]
  );

  const categoryRailLayout = useMemo(
    () => computeCategoryRailMetrics(windowWidth, insets.right),
    [windowWidth, insets.right]
  );

  /** Full-bleed offer banners (same width as restaurant cards). */
  const offerCardWidth = windowWidth - PAGE_PAD * 2;
  const restaurantCardWidth = offerCardWidth;

  const offersQueryEnabled =
    merchantsAnchorCoords?.latitude != null && merchantsAnchorCoords?.longitude != null;
  const showOfferSkeleton = offersQueryEnabled && featuredOffersLoading;
  const showOffersBlock = showOfferSkeleton || homeFeaturedOffers.length > 0;

  const merchants = Array.isArray(merchantsData) ? merchantsData : [];
  /** Only block the list on first load — background refetch must not swap cards for skeleton. */
  const showSkeleton = isLoading && merchants.length === 0;
  /** True when at least one ACTIVE store exists in the area (open or closed). Not tied to Open Now filter. */
  const hasStoresInArea = merchants.length > 0;
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const statusMap = useStoreStatusStore((s) => s.statusMap);

  // Do not replace a user-selected pin with GPS when opening the food listing.
  // Stop after we already have device GPS (same loop as tabs index: refetch → source "current" → deps change).
  useEffect(() => {
    if (!locationHydrated) return;
    if (locationSource === "selected") return;
    if (locationSource === "current" && coords) return;
    if (permissionStatus === "granted") {
      if (coords) void refetchLocation();
      else void requestPermissionAndFetch();
    } else if (permissionStatus === "undetermined") {
      void requestPermissionAndFetch();
    }
  }, [
    locationHydrated,
    locationSource,
    coords,
    permissionStatus,
    refetchLocation,
    requestPermissionAndFetch,
  ]);

  useEffect(() => {
    if (!__DEV__ || !coords) return;
    const location = {
      address: address?.fullAddress,
      lat: coords.latitude,
      lng: coords.longitude,
      source: locationSource ?? "unset",
    };
    console.log("Using location:", location.source);
  }, [address?.fullAddress, coords, locationSource]);

  useEffect(() => {
    merchants.forEach((m) => {
      const raw = ((m as { liveStatus?: string }).liveStatus ?? "").toString().trim().toUpperCase();
      const liveStatus = raw === "OPEN" || raw === "CLOSED" ? (raw as "OPEN" | "CLOSED") : undefined;
      if (liveStatus) setStatusFromApi(m.id, liveStatus === "OPEN", liveStatus);
    });
  }, [merchants, setStatusFromApi]);

  const filteredAndSortedMerchants = useMemo(
    () =>
      filterAndSortMerchants(merchants, statusMap, {
        openNow,
        sortBy,
        filterHasOffers,
        deliveryFilter,
        selectedCuisines,
      }),
    [merchants, statusMap, openNow, sortBy, deliveryFilter, selectedCuisines, filterHasOffers]
  );

  const lovedByCustomers = useMemo(
    () => pickLovedByCustomersMerchants(filteredAndSortedMerchants),
    [filteredAndSortedMerchants]
  );

  const storeCountLabel = useMemo(
    () => merchantListingStoreCountLabel(filteredAndSortedMerchants, statusMap, openNow),
    [filteredAndSortedMerchants, statusMap, openNow]
  );

  const handleBack = () => router.back();
  const handleSearch = () => router.push("/search");
  const handleCategorySelect = (id: string, slug: string) => {
    setActiveCategoryId(id);
    router.push(`/home/category/${slug}`);
  };
  const toggleCuisine = (c: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };
  const clearFilters = useCallback(() => {
    setDeliveryFilter("any");
    setSelectedCuisines([]);
    setFilterHasOffers(false);
  }, []);
  const applyFilters = useCallback(() => setFilterSheetVisible(false), []);
  const hasActiveFilters = deliveryFilter !== "any" || selectedCuisines.length > 0 || filterHasOffers;
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (deliveryFilter !== "any") n += 1;
    n += selectedCuisines.length;
    if (filterHasOffers) n += 1;
    return n;
  }, [deliveryFilter, selectedCuisines, filterHasOffers]);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchHomeCategories(),
        refetchFeaturedOffers(),
        permissionStatus === "granted" && locationSource !== "selected" ? refetchLocation() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const selectedLocationLabel = useMemo(() => {
    const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
    const fullParts = (address?.fullAddress ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const secondaryParts = (address?.secondary ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const stateCandidate =
      address?.state ??
      [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
    const normalizedState = stateCandidate?.toLowerCase() ?? "";
    const areaLocality = Array.from(
      new Set(
        [...secondaryParts, ...fullParts, address?.primary ?? ""]
          .map((p) => p.trim())
          .filter(
            (p) =>
              !!p &&
              !isPincode(p) &&
              p.toLowerCase() !== "india" &&
              p.toLowerCase() !== normalizedState
          )
      )
    )
      .slice(0, 2)
      .join(", ");
    if (areaLocality && stateCandidate) return `${areaLocality} (${stateCandidate})`;
    if (areaLocality) return areaLocality;
    return address?.fullAddress ?? "Current location";
  }, [address?.fullAddress, address?.secondary, address?.primary, address?.state]);

  // No-service: only when there are zero stores listed for this location (not when all are closed).
  if (!hasStoresInArea && !showSkeleton) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <GMHeader
          topInset={HEADER_TOP_PADDING_NONE}
          onBack={handleBack}
          minimal
          locationLabel={selectedLocationLabel}
        />
        <View style={styles.nonServiceableContent}>
          <GMEmptyState />
        </View>
      </View>
    );
  }

  // Single scroll: header in flow, then content (categories → filters → list). Sticky rail inside content area only.
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header in flow – no absolute; content starts below */}
      <GMHeader
        topInset={HEADER_TOP_PADDING_NONE}
        compact
        onBack={handleBack}
        onSearchPress={handleSearch}
        showActions={true}
        vegOnly={vegOnly}
        onVegChange={setVegOnly}
        showCart={false}
        searchElement={<GMSearchBar onPress={handleSearch} rotatingPlaceholder />}
      />

      <View style={styles.contentWrap}>
        <AnimatedScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || (isFetching && !isLoading)}
              onRefresh={onRefresh}
              tintColor={GatiMitraColors.primaryMint}
              colors={[GatiMitraColors.primaryMint]}
            />
          }
        >
          {showOffersBlock ? (
            <>
              <View style={styles.offersSection}>
                {showOfferSkeleton ? (
                  <HomeOfferBannerSkeleton width={offerCardWidth} height={OFFER_CARD_HEIGHT} />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.offersScrollContent}
                    snapToInterval={offerCardWidth + OFFER_GAP}
                    snapToAlignment="start"
                    decelerationRate="fast"
                  >
                    {homeFeaturedOffers.map((o) => (
                      <TouchableOpacity
                        key={o.id}
                        style={[styles.offerCardWrap, { width: offerCardWidth }]}
                        activeOpacity={0.92}
                        onPress={() =>
                          router.push({ pathname: "/home/merchant/[id]", params: { id: o.store_id } })
                        }
                      >
                        <HomeFeaturedOfferCard
                          title={o.title}
                          sub={o.sub}
                          storeName={o.store_name}
                          couponCode={o.coupon_code}
                          minOrderAmount={o.min_order_amount}
                          maxDiscountAmount={o.max_discount_amount}
                          offerType={o.offer_type}
                          kind={o.kind}
                          width={offerCardWidth}
                          height={OFFER_CARD_HEIGHT}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={styles.sectionGap} />
            </>
          ) : null}

          {/* Category rail – all user_app_category (FOOD), horizontal scroll by display_order */}
          <View
            style={[
              styles.categoryRailSection,
              {
                minHeight:
                  categoryRailLayout.circle * 2 + RAIL_ROW_GAP + 38,
              },
            ]}
          >
            {homeCategoriesLoading || !homeCategoriesReady ? (
              <CategoryRailSkeleton
                columnCount={CATEGORY_RAIL_TARGET_COLUMNS}
                itemW={categoryRailLayout.itemW}
                columnGap={categoryRailLayout.columnGap}
                circle={categoryRailLayout.circle}
                rowGap={RAIL_ROW_GAP}
              />
            ) : homeCategoryRailItems.length === 0 ? (
              <View style={styles.categoryRailLoading}>
                <Text style={styles.categoryRailLoadingText}>No categories yet.</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                nestedScrollEnabled
                removeClippedSubviews={false}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.categoryRailScrollContent,
                  {
                    gap: categoryRailLayout.columnGap,
                    paddingRight:
                      PAGE_PAD + categoryRailLayout.columnGap + Math.max(4, insets.right),
                    paddingEnd:
                      PAGE_PAD + categoryRailLayout.columnGap + Math.max(4, insets.right),
                  },
                ]}
              >
                {homeCategoryRailColumns.map((pair) => (
                  <View
                    key={`${pair[0]?.id ?? "x"}-${pair[1]?.id ?? ""}`}
                    style={styles.categoryRailColumn}
                  >
                    {pair.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.categoryRailItem, { width: categoryRailLayout.itemW }]}
                        onPress={() => handleCategorySelect(cat.id, cat.slug)}
                        activeOpacity={0.96}
                      >
                        <View
                          style={[
                            styles.categoryRailCircle,
                            {
                              width: categoryRailLayout.circle,
                              height: categoryRailLayout.circle,
                              borderRadius: categoryRailLayout.circle / 2,
                            },
                          ]}
                        >
                          <HomeCategoryGridImage
                            imageUrl={cat.imageUrl}
                            size={categoryRailLayout.imgSize}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryRailLabel,
                            { width: categoryRailLayout.itemW },
                          ]}
                          numberOfLines={2}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
                {/* Ensures last column can scroll fully clear of screen edge */}
                <View style={styles.categoryRailScrollTrail} />
              </ScrollView>
            )}
          </View>

          {/* Dynamic filter bar – Open Now (default on) + Sort + Filters + store count */}
          <View style={[styles.section, styles.filterBar]}>
            <View style={styles.filterBarChipsRow}>
              <TouchableOpacity
                style={[styles.filterChip, openNow && styles.filterChipActive]}
                onPress={() => setOpenNow((v) => !v)}
              >
                <Ionicons name="storefront-outline" size={18} color={openNow ? "#fff" : GatiMitraColors.primaryMint} />
                <Text style={[styles.filterChipText, openNow && styles.filterChipTextActive]}>Open Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, sortBy !== "default" && styles.filterChipActive]}
                onPress={() =>
                  setSortBy((s) => (s === "default" ? "rating" : s === "rating" ? "distance" : "default"))
                }
              >
                <Ionicons
                  name="swap-vertical"
                  size={18}
                  color={sortBy !== "default" ? "#fff" : GatiMitraColors.textPrimaryNew}
                />
                <Text style={[styles.filterChipText, sortBy !== "default" && styles.filterChipTextActive]}>
                  {sortBy === "default" ? "Sort" : sortBy === "rating" ? "Rating" : "Distance"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, hasActiveFilters && styles.filterChipActive]}
                onPress={() => setFilterSheetVisible(true)}
              >
                <Ionicons name="options-outline" size={18} color={hasActiveFilters ? "#fff" : GatiMitraColors.textPrimaryNew} />
                <Text style={[styles.filterChipText, hasActiveFilters && styles.filterChipTextActive]}>Filters</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.filterStoreCount}>{storeCountLabel}</Text>
          </View>

          {/* Loved by Customers — 2-col grid (Swiggy-style); same stores also in list below */}
          {(showSkeleton || lovedByCustomers.length > 0) && (
            <View style={styles.lovedSection}>
              <Text style={styles.sectionHeading}>LOVED BY CUSTOMERS</Text>
              {showSkeleton ? (
                <LovedMerchantsGridSkeleton count={4} />
              ) : (
                <View style={styles.merchantGrid}>
                  {lovedByCustomers.map((m) => (
                    <MerchantGridCard
                      key={`loved-${m.id}`}
                      merchant={m}
                      onPress={() =>
                        router.push({ pathname: "/home/merchant/[id]", params: { id: m.id } })
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* All nearby restaurants (includes loved stores) */}
          <View style={[styles.section, styles.restaurantSection]}>
            <Text style={styles.sectionHeading}>RESTAURANTS NEAR YOU</Text>
            {showSkeleton ? (
              <RestaurantListSkeleton count={3} cardWidth={restaurantCardWidth} />
            ) : filteredAndSortedMerchants.length === 0 ? (
              <Text style={styles.restaurantEmptyHint}>No restaurants match your filters.</Text>
            ) : (
              filteredAndSortedMerchants.map((m) => (
                <GMRestaurantCardV2 key={`near-${m.id}`} merchant={m} />
              ))
            )}
          </View>

          <BrandingFooter />
        </AnimatedScrollView>
      </View>

      {/* Filter sheet — full-bleed bottom sheet, mint-forward */}
      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.filterOverlay} onPress={() => setFilterSheetVisible(false)}>
          <Pressable style={styles.filterSheetStack} onPress={() => {}}>
            <View style={[styles.filterSheetCard, { maxHeight: windowHeight * 0.9 }]}>
              <LinearGradient
                colors={[GatiMitraColors.mintSoft, "#FFFFFF"]}
                locations={[0, 0.35]}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.filterSheetHandleWrap}>
                <View style={styles.filterSheetHandle} />
              </View>
              <View style={styles.filterSheetHeader}>
                <View style={styles.filterSheetTitleBlock}>
                  <Text style={styles.filterSheetTitle}>Filters</Text>
                  <Text style={styles.filterSheetSubtitle}>
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active — tap Apply to update the list`
                      : "Refine delivery time, cuisine, and offers"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={clearFilters}
                  hitSlop={12}
                  disabled={!hasActiveFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                  accessibilityState={{ disabled: !hasActiveFilters }}
                >
                  <Text style={[styles.filterSheetClear, !hasActiveFilters && styles.filterSheetClearDisabled]}>
                    Clear all
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={{ maxHeight: Math.min(440, windowHeight * 0.5) }}
                contentContainerStyle={styles.filterSheetScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                <Text style={styles.filterSectionLabel}>Delivery time</Text>
                <View style={styles.filterChipsRow}>
                  {DELIVERY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.filterSheetChip, deliveryFilter === opt.id && styles.filterSheetChipActive]}
                      onPress={() => setDeliveryFilter(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.filterSheetChipText,
                          deliveryFilter === opt.id && styles.filterSheetChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.filterSectionLabel}>Cuisine</Text>
                <View style={styles.filterChipsRow}>
                  {CUISINE_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.filterSheetChip,
                        selectedCuisines.includes(c) && styles.filterSheetChipActive,
                      ]}
                      onPress={() => toggleCuisine(c)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.filterSheetChipText,
                          selectedCuisines.includes(c) && styles.filterSheetChipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.filterSectionLabel}>Other</Text>
                <TouchableOpacity
                  style={[styles.filterSheetRow, filterHasOffers && styles.filterSheetRowActive]}
                  onPress={() => setFilterHasOffers((v) => !v)}
                  activeOpacity={0.88}
                >
                  <View
                    style={[
                      styles.filterSheetRowIconWrap,
                      filterHasOffers && styles.filterSheetRowIconWrapActive,
                    ]}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={20}
                      color={filterHasOffers ? "#fff" : GatiMitraColors.primaryMint}
                    />
                  </View>
                  <Text
                    style={[
                      styles.filterSheetRowText,
                      filterHasOffers && styles.filterSheetRowTextOnMint,
                    ]}
                  >
                    Has offers
                  </Text>
                  {filterHasOffers ? (
                    <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.filterSheetRowTrailing} />
                  ) : null}
                </TouchableOpacity>
              </ScrollView>
              <View
                style={[
                  styles.filterSheetFooter,
                  { paddingBottom: Math.max(insets.bottom, 14) },
                ]}
              >
                <TouchableOpacity
                  style={styles.filterApplyBtnOuter}
                  onPress={applyFilters}
                  activeOpacity={0.92}
                  accessibilityRole="button"
                  accessibilityLabel="Apply filters"
                >
                  <LinearGradient
                    colors={GatiMitraColors.checkoutGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.filterApplyBtnGradient}
                  >
                    <Text style={styles.filterApplyBtnText}>Apply</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  contentWrap: {
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  nonServiceableContent: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: PAGE_PAD,
    marginBottom: SECTION_GAP,
  },
  offersSection: {
    paddingVertical: OFFERS_SECTION_PAD,
    paddingHorizontal: PAGE_PAD,
    marginBottom: 4,
  },
  offersScrollContent: {
    gap: OFFER_GAP,
    paddingRight: PAGE_PAD,
    paddingVertical: 4,
  },
  offerCardWrap: {
    height: OFFER_CARD_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  restaurantEmptyHint: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  sectionGap: {
    height: SECTION_GAP_SM,
  },
  categoryRailSection: {
    paddingVertical: 12,
    marginBottom: SECTION_GAP,
    overflow: "visible",
  },
  categoryRailScrollContent: {
    paddingLeft: PAGE_PAD,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  categoryRailScrollTrail: {
    width: PAGE_PAD,
    flexShrink: 0,
  },
  categoryRailColumn: {
    flexDirection: "column",
    gap: RAIL_ROW_GAP,
    alignItems: "center",
  },
  categoryRailItem: {
    alignItems: "center",
  },
  categoryRailCircle: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 1, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    }),
    elevation: 3,
  },
  categoryRailLoading: {
    paddingHorizontal: PAGE_PAD,
    paddingVertical: 24,
    alignItems: "center",
  },
  categoryRailLoadingText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
  },
  categoryRailLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: SECTION_GAP,
    paddingBottom: SECTION_GAP,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  filterBarChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterStoreCount: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  filterChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  restaurantSection: {
    borderTopWidth: 0,
  },
  lovedSection: {
    marginBottom: SECTION_GAP,
  },
  merchantGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: GatiMitraColors.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 16,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    marginBottom: 12,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  /** Full-bleed bottom sheet — no horizontal inset on the card. */
  filterSheetStack: {
    width: "100%",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  filterSheetCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 16 },
    }),
  },
  filterSheetHandleWrap: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: "center",
  },
  filterSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(34, 197, 94, 0.35)",
  },
  filterSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 16,
    gap: 12,
  },
  filterSheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  filterSheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.3,
  },
  filterSheetSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
  },
  filterSheetClear: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.primaryMint,
    paddingTop: 4,
  },
  filterSheetClearDisabled: {
    color: GatiMitraColors.textSecondary,
    opacity: 0.5,
  },
  filterSheetScrollContent: {
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 8,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: GatiMitraColors.textSecondary,
    marginBottom: 12,
    marginTop: 6,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  filterSheetChip: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
  },
  filterSheetChipActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterSheetChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetChipTextActive: {
    color: "#fff",
  },
  filterSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.22)",
    marginBottom: 4,
  },
  filterSheetRowActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterSheetRowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSheetRowIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterSheetRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetRowTextOnMint: {
    color: "#fff",
  },
  filterSheetRowTrailing: {
    marginLeft: 4,
  },
  filterSheetFooter: {
    paddingTop: 12,
    paddingHorizontal: PAGE_PAD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      android: { elevation: 10 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
    }),
  },
  filterApplyBtnOuter: {
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
    }),
  },
  filterApplyBtnGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterApplyBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
});
