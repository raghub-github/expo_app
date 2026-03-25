/**
 * Food Delivery – 2025 GatiMitra UI.
 * Full rebuild: GMHeader, GMSearchBar, GMCategoryRail, GMRestaurantCardV2, GMEmptyState.
 * Real data only. Spacing: 16px page, 18px cards, 24px section gap.
 */

import { useState, useMemo, useEffect } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { merchantService } from "@/services/merchant.service";
import {
  fetchUserAppCategories,
  type UserAppCategoryItem,
} from "@/services/userAppCategory.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { GMHeader } from "@/components/GMHeader";
import { GMSearchBar } from "@/components/GMSearchBar";
import { GMRestaurantCardV2 } from "@/components/GMRestaurantCardV2";
import { GMEmptyState } from "@/components/GMEmptyState";
import { GatiMitraColors } from "@/constants/gatimitra";

const AnimatedScrollView = createAnimatedComponent(ScrollView);

const PAGE_PAD = 16;
const SECTION_GAP = 24;
const SECTION_GAP_SM = 10;
/** Vertical gap between the two tiles in each column. */
const RAIL_ROW_GAP = 10;
/** Target 4 category columns on screen (2 rows of pairs → 8 items visible before scroll). */
const CATEGORY_RAIL_TARGET_COLUMNS = 4;

const OFFERS_SECTION_PAD = 14;
const OFFER_CARD_WIDTH = 260;
const OFFER_CARD_HEIGHT = 120;
const OFFER_GAP = 12;

const OFFERS = [
  { id: "o1", title: "Flat 50% OFF", sub: "On First Order", cta: "Explore Now" },
  { id: "o2", title: "MIN ₹120 OFF", sub: "Free Delivery above ₹99", cta: "Order now" },
];

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
  const uri = imageUrl ? (toAbsoluteImageUrl(imageUrl) ?? imageUrl) : null;
  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);
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
  const { width: windowWidth } = useWindowDimensions();
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
      debouncedCoords?.latitude,
      debouncedCoords?.longitude,
      vegOnly,
    ],
    queryFn: () =>
      merchantService.getMerchants({
        limit: 20,
        ...(debouncedCoords?.latitude != null && debouncedCoords?.longitude != null
          ? { lat: debouncedCoords.latitude, lng: debouncedCoords.longitude }
          : {}),
        vegOnly,
      }),
    // Industry-standard: only fetch restaurants once we have an active location (GPS or user-selected).
    enabled: debouncedCoords?.latitude != null && debouncedCoords?.longitude != null,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const {
    data: apiHomeCategories = [],
    isSuccess: homeCategoriesReady,
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

  const merchants = Array.isArray(merchantsData) ? merchantsData : [];
  const showSkeleton = isLoading || isFetching;
  const isServiceable = !showSkeleton && merchants.length > 0;
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

  const filteredAndSortedMerchants = useMemo(() => {
    let list = merchants.filter((m) => {
      const rawApi = ((m as { liveStatus?: string }).liveStatus ?? "").toString().trim().toUpperCase();
      const apiStatus = rawApi === "OPEN" || rawApi === "CLOSED" ? rawApi : null;
      const liveStatus = statusMap[m.id] ?? apiStatus ?? "CLOSED";
      if (openNow && liveStatus !== "OPEN") return false;
      if (filterHasOffers && !m.offerText) return false;
      if (deliveryFilter !== "any" && m.deliveryTime) {
        const mins = parseInt(m.deliveryTime.replace(/\D/g, ""), 10);
        if (!Number.isNaN(mins)) {
          const max = parseInt(deliveryFilter, 10);
          if (mins > max) return false;
        }
      }
      if (selectedCuisines.length > 0 && m.cuisines?.length) {
        const hasMatch = selectedCuisines.some((c) =>
          m.cuisines!.some((mc) => mc.toLowerCase().includes(c.toLowerCase())))
        if (!hasMatch) return false;
      } else if (selectedCuisines.length > 0) return false;
      return true;
    });
    // Open restaurants first, closed later; then by sort option (rating / distance / default)
    const isOpen = (m: (typeof list)[0]) => {
      const raw = ((m as { liveStatus?: string }).liveStatus ?? "").toString().trim().toUpperCase();
      const st = raw === "OPEN" || raw === "CLOSED" ? raw : null;
      return (statusMap[m.id] ?? st ?? "CLOSED") === "OPEN";
    };
    list = [...list].sort((a, b) => {
      const aOpen = isOpen(a);
      const bOpen = isOpen(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1; // open first, closed later
      if (sortBy === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      if (sortBy === "distance") return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      return 0;
    });
    return list;
  }, [merchants, statusMap, openNow, sortBy, deliveryFilter, selectedCuisines, filterHasOffers]);

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
  const clearFilters = () => {
    setDeliveryFilter("any");
    setSelectedCuisines([]);
    setFilterHasOffers(false);
    setFilterSheetVisible(false);
  };
  const applyFilters = () => setFilterSheetVisible(false);
  const hasActiveFilters = deliveryFilter !== "any" || selectedCuisines.length > 0 || filterHasOffers;
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchHomeCategories(),
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

  // No-service: minimal header + empty state only when load complete and 0 stores. While loading, show full UI with skeleton (no blocking text).
  if (!isServiceable && !showSkeleton) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <GMHeader
          topInset={Math.max(8, insets.top - 10)}
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
        topInset={Math.max(8, insets.top - 10)}
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
          {/* Offers carousel – above category, horizontal scroll, snap */}
          <View style={styles.offersSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offersScrollContent}
              snapToInterval={OFFER_CARD_WIDTH + OFFER_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {OFFERS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={styles.offerCardWrap}
                  activeOpacity={0.95}
                >
                  <LinearGradient
                    colors={["#19c37d", "#00a86b"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.offerCard}
                  >
                    <Text style={styles.offerCardTitle}>{o.title}</Text>
                    <Text style={styles.offerCardSub}>{o.sub}</Text>
                    <View style={styles.offerCardCta}>
                      <Text style={styles.offerCardCtaText}>{o.cta}</Text>
                      <Ionicons name="arrow-forward" size={16} color="#00a86b" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.sectionGap} />

          {/* Category rail – all user_app_category (FOOD), horizontal scroll by display_order */}
          <View style={styles.categoryRailSection}>
            {homeCategoryRailItems.length === 0 && !homeCategoriesReady ? (
              <View style={styles.categoryRailLoading}>
                <Text style={styles.categoryRailLoadingText}>Loading categories…</Text>
              </View>
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
            <Text style={styles.filterStoreCount}>
              {filteredAndSortedMerchants.length} {filteredAndSortedMerchants.length === 1 ? "store" : "stores"}
            </Text>
          </View>

          {/* Restaurant feed */}
          <View style={[styles.section, styles.restaurantSection]}>
            <Text style={styles.sectionTitle}>Restaurants near you</Text>
            {showSkeleton ? (
              <RestaurantListSkeleton count={6} />
            ) : (
              filteredAndSortedMerchants.map((m) => <GMRestaurantCardV2 key={m.id} merchant={m} />)
            )}
          </View>

          <BrandingFooter />
        </AnimatedScrollView>
      </View>

      {/* Filter sheet – delivery time, cuisine, has offers */}
      <Modal visible={filterSheetVisible} transparent animationType="slide">
        <Pressable style={styles.filterOverlay} onPress={() => setFilterSheetVisible(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterSheetHandle} />
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filters</Text>
              <TouchableOpacity onPress={clearFilters} hitSlop={12}>
                <Text style={styles.filterSheetClear}>Clear all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.filterSheetScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterSectionLabel}>Delivery time</Text>
              <View style={styles.filterChipsRow}>
                {DELIVERY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterSheetChip, deliveryFilter === opt.id && styles.filterSheetChipActive]}
                    onPress={() => setDeliveryFilter(opt.id)}
                  >
                    <Text style={[styles.filterSheetChipText, deliveryFilter === opt.id && styles.filterSheetChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.filterSectionLabel}>Cuisine</Text>
              <View style={styles.filterChipsRow}>
                {CUISINE_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.filterSheetChip, selectedCuisines.includes(c) && styles.filterSheetChipActive]}
                    onPress={() => toggleCuisine(c)}
                  >
                    <Text style={[styles.filterSheetChipText, selectedCuisines.includes(c) && styles.filterSheetChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.filterSectionLabel}>Other</Text>
              <TouchableOpacity
                style={[styles.filterSheetRow, filterHasOffers && styles.filterSheetRowActive]}
                onPress={() => setFilterHasOffers((v) => !v)}
              >
                <Ionicons name="pricetag-outline" size={20} color={filterHasOffers ? "#fff" : GatiMitraColors.textPrimaryNew} />
                <Text style={[styles.filterSheetRowText, filterHasOffers && styles.filterSheetChipTextActive]}>Has offers</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={[styles.filterSheetFooter, { paddingBottom: insets.bottom + 12 }]}>
              <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters} activeOpacity={0.9}>
                <Text style={styles.filterApplyBtnText}>Apply</Text>
              </TouchableOpacity>
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
  },
  offersScrollContent: {
    gap: OFFER_GAP,
    paddingRight: PAGE_PAD,
  },
  offerCardWrap: {
    width: OFFER_CARD_WIDTH,
    height: OFFER_CARD_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 22,
    }),
    elevation: 6,
  },
  offerCard: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  offerCardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  offerCardSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.95)",
  },
  offerCardCta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  offerCardCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00a86b",
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    marginBottom: 12,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  filterSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: PAGE_PAD,
    paddingTop: 12,
    maxHeight: "80%",
    paddingBottom: 0,
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 16,
  },
  filterSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetClear: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.primaryMint,
  },
  filterSheetScroll: {
    maxHeight: 320,
  },
  filterSectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    marginBottom: 10,
    marginTop: 4,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  filterSheetChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
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
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    marginBottom: 16,
  },
  filterSheetRowActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterSheetRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  filterSheetFooter: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 }),
  },
  filterApplyBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    ...(Platform.OS === "android"
      ? { elevation: 4 }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }),
  },
  filterApplyBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
