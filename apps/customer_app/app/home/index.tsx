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
  Dimensions,
  Platform,
  ScrollView,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { createAnimatedComponent } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { merchantService } from "@/services/merchant.service";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { GMHeader } from "@/components/GMHeader";
import { GMSearchBar } from "@/components/GMSearchBar";
import type { CategoryItem } from "@/components/GMCategoryRail";
import { GMRestaurantCardV2 } from "@/components/GMRestaurantCardV2";
import { GMEmptyState } from "@/components/GMEmptyState";
import { GatiMitraColors } from "@/constants/gatimitra";

const AnimatedScrollView = createAnimatedComponent(ScrollView);

const { width } = Dimensions.get("window");
const PAGE_PAD = 16;
const SECTION_GAP = 24;
const SECTION_GAP_SM = 10;
const GRID_COLS = 4;
const GRID_GAP = 14;
const CATEGORY_CARD_SIZE =
  (width - PAGE_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CATEGORY_IMAGE_SIZE = 46;
const CIRCLE_SIZE = 52;

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

const FOOD_CATEGORY_IMAGES: Record<string, ReturnType<typeof require>> = {
  "1": require("../../public/img/biryani.png"),
  "2": require("../../public/img/pizza.png"),
  "3": require("../../public/img/Cake.png"),
  "4": require("../../public/img/ndf.png"),
  "5": require("../../public/img/burger.png"),
  "6": require("../../public/img/thali.png"),
  "7": require("../../public/img/vegbiryani.png"),
  "8": require("../../public/img/Pav Bhaji.png"),
  "9": require("../../public/img/Paratha.png"),
  "10": require("../../public/img/Dosa.png"),
  "11": require("../../public/img/Noodles.png"),
  "12": require("../../public/img/gulabjamun.png"),
};

const FOOD_CATEGORIES = [
  { id: "1", name: "Biryani", slug: "biryani" },
  { id: "2", name: "Pizza", slug: "pizza" },
  { id: "3", name: "Cake", slug: "cake" },
  { id: "4", name: "Kadai Paneer", slug: "kadai-paneer" },
  { id: "5", name: "Burger", slug: "burger" },
  { id: "6", name: "Thali", slug: "thali" },
  { id: "7", name: "Butter Chicken", slug: "chicken" },
  { id: "8", name: "Pav Bhaji", slug: "pav-bhaji" },
  { id: "9", name: "North Indian", slug: "north-indian" },
  { id: "10", name: "South Indian", slug: "south-indian" },
  { id: "11", name: "Chinese", slug: "chinese" },
  { id: "12", name: "Desserts", slug: "desserts" },
];

function buildCategoryItems(): CategoryItem[] {
  return FOOD_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: FOOD_CATEGORY_IMAGES[c.id] ?? FOOD_CATEGORY_IMAGES["4"],
  }));
}

const CATEGORY_ITEMS = buildCategoryItems();

export default function FoodMerchantsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address, coords, permissionStatus, refetchLocation, requestPermissionAndFetch } =
    useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 400);
  const [vegOnly, setVegOnly] = useState(false);
  const [openNow, setOpenNow] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("any");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [filterHasOffers, setFilterHasOffers] = useState(false);

  const { data: merchantsData, isLoading, isFetching } = useQuery({
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
    enabled: true,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const merchants = Array.isArray(merchantsData) ? merchantsData : [];
  const showSkeleton = isLoading || isFetching;
  const isServiceable = !showSkeleton && merchants.length > 0;
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const statusMap = useStoreStatusStore((s) => s.statusMap);

  // When user opens \"Order Food\", ensure we have a fresh, high-accuracy location.
  useEffect(() => {
    if (permissionStatus === "granted") {
      void refetchLocation();
    } else if (permissionStatus === "undetermined") {
      void requestPermissionAndFetch();
    }
  }, [permissionStatus, refetchLocation, requestPermissionAndFetch]);

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

  // No-service: minimal header + empty state only when load complete and 0 stores. While loading, show full UI with skeleton (no blocking text).
  if (!isServiceable && !showSkeleton) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <GMHeader
          topInset={Math.max(8, insets.top - 10)}
          onBack={handleBack}
          minimal
          locationLabel={address?.primary ?? address?.fullAddress ?? "Current location"}
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

          {/* Category grid – 2 rows, 4 columns; no All button */}
          <View style={styles.categoryGridSection}>
            <View style={styles.categoryGrid}>
              {CATEGORY_ITEMS.slice(0, 8).map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryGridCard}
                  onPress={() => handleCategorySelect(cat.id, cat.slug)}
                  activeOpacity={0.96}
                >
                  <View style={styles.categoryGridCircle}>
                    <Image
                      source={cat.image!}
                      style={styles.categoryGridImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.categoryGridLabel} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
  categoryGridSection: {
    paddingHorizontal: PAGE_PAD,
    paddingVertical: 12,
    marginBottom: SECTION_GAP,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  categoryGridCard: {
    width: CATEGORY_CARD_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryGridCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
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
  categoryGridImage: {
    width: CATEGORY_IMAGE_SIZE,
    height: CATEGORY_IMAGE_SIZE,
  },
  categoryGridLabel: {
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
