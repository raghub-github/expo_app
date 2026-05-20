/**
 * Category browse – Zomato-style inner page for GatiMitra.
 * Header with search, horizontal category chips, filter/offer pills,
 * Recommended For You grid, All Restaurants section.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  type ImageSourcePropType,
  type ImageStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { merchantService, type MerchantSummary } from "@/services/merchant.service";
import { fetchUserAppCategories, type UserAppCategoryItem } from "@/services/userAppCategory.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { BrandingFooter } from "@/components/BrandingFooter";
import { RestaurantListSkeleton } from "@/components/ShimmerSkeleton";
import { EmptyRestaurantsNearby } from "@/components/EmptyRestaurantsNearby";
import { GMRestaurantCardV2 } from "@/components/GMRestaurantCardV2";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { filterAndSortMerchants } from "@/lib/merchantListing";

const { width, height: WINDOW_HEIGHT } = Dimensions.get("window");
/** Cuisines bottom sheet height (~72% screen): taller drawer, still leaves header/chips visible. */
const SHEET_MAX_HEIGHT = Math.round(WINDOW_HEIGHT * 0.72);
/** Vertical for user_app_category rows (PHARMA / GROCERY / FASHION when those homes ship). */
const SHEET_STORE_TYPE = "FOOD";
/** Max category icons on the top rail before "See all" (full list stays in the sheet). */
const RAIL_MAX_CATEGORY_ITEMS = 14;
/** First screen: try to fit this many rail chips without horizontal clip. */
const CATEGORY_BROWSE_RAIL_COLS = 5;
const PAD = 16;
const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#FFFFFF";
const BG = "#F8F8F8";
const SHADOW = { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 };

type BrowseCategoryChip =
  | { kind: "all"; id: "all"; name: string }
  | { kind: "item"; id: string; name: string; remoteUri: string | null }
  | { kind: "seeAll"; id: "see-all"; name: string };

/** De-dupe API rows (same id or same display name; keep lowest display_order). */
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

/** Single source of truth with the `[slug]` route segment. */
function normalizeCategorySlugParam(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || s.trim().length === 0) return "all";
  const t = s.trim();
  if (t.toLowerCase() === "all") return "all";
  return t;
}

function computeCategoryBrowseRailMetrics(windowWidth: number): {
  chipW: number;
  gap: number;
  icon: number;
  iconInner: number;
} {
  const usable = Math.max(0, windowWidth - PAD * 2 - 4);
  const n = CATEGORY_BROWSE_RAIL_COLS;
  let gap = 12;
  let chipW = (usable - (n - 1) * gap) / n;
  if (chipW < 64) {
    gap = 8;
    chipW = (usable - (n - 1) * gap) / n;
  }
  if (chipW < 58) {
    gap = 5;
    chipW = (usable - (n - 1) * gap) / n;
  }
  chipW = Math.floor(Math.max(56, Math.min(72, chipW)));
  const icon = Math.min(56, Math.max(48, Math.round(chipW * (56 / 72))));
  const iconInner = Math.max(44, Math.round(icon * (50 / 56)));
  return { chipW, gap, icon, iconInner };
}

const OFFER_PILLS = [
  { id: "fast", label: "Near & Fast", icon: "flash" },
  { id: "meals", label: "Meals under ₹250", tag: "New" },
  { id: "flat50", label: "Flat 50% OFF" },
  { id: "hyderabadi", label: "Hyderabadi" },
];

type DeliveryFilter = "any" | "30" | "45" | "60";
const DELIVERY_OPTIONS: { id: DeliveryFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "30", label: "Under 30 min" },
  { id: "45", label: "Under 45 min" },
  { id: "60", label: "Under 60 min" },
];
const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Fast Food", "Bakery", "Desserts"];

const DEFAULT_MERCHANT_IMAGE = require("../../../public/img/ndf.png");

function CuisinesSheetTileImage({
  remoteUri,
  localSource,
  style,
}: {
  remoteUri: string | null;
  localSource: ImageSourcePropType | null;
  style: ImageStyle;
}) {
  const [remoteFailed, setRemoteFailed] = useState(false);
  const absolute = remoteUri ? (toAbsoluteImageUrl(remoteUri) ?? remoteUri) : null;

  useEffect(() => {
    setRemoteFailed(false);
  }, [remoteUri]);
  if (absolute && !remoteFailed) {
    return (
      <Image
        source={{ uri: absolute }}
        style={style}
        resizeMode="contain"
        onError={() => setRemoteFailed(true)}
      />
    );
  }
  if (localSource) {
    return <Image source={localSource} style={style} resizeMode="contain" />;
  }
  return <Image source={DEFAULT_MERCHANT_IMAGE} style={style} resizeMode="contain" />;
}

/** Same hero as home cards: displayImage / banner_url from GET /merchants (not legacy imageUrl). */
function merchantCardImageUri(m: MerchantSummary): string | undefined {
  return toAbsoluteImageUrl(m.displayImage ?? m.banner_url ?? null) ?? undefined;
}

function DishCard({
  id,
  name,
  rating,
  deliveryTime,
  offerBadge,
  imageUrl,
  onPress,
}: {
  id: string;
  name: string;
  rating?: number;
  deliveryTime?: string;
  offerBadge?: string;
  imageUrl?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.dishCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.dishImageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.dishImage} resizeMode="cover" />
        ) : (
          <Image source={DEFAULT_MERCHANT_IMAGE} style={styles.dishImage} resizeMode="cover" />
        )}
        {offerBadge ? (
          <View style={[styles.offerTag, offerBadge.includes("50") && styles.offerTagBlue]}>
            <Text style={styles.offerTagText}>{offerBadge}</Text>
          </View>
        ) : null}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#fff" />
          <Text style={styles.ratingText}>{rating ?? "—"}</Text>
        </View>
      </View>
      <Text style={styles.dishName} numberOfLines={1}>{name}</Text>
      <View style={styles.dishMeta}>
        {deliveryTime ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={TEXT_GRAY} />
            <Text style={styles.metaText}>{deliveryTime}</Text>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Ionicons name="flash" size={12} color={TEAL} />
            <Text style={[styles.metaText, { color: TEAL }]}>Near & Fast</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const SHEET_COLUMNS = 4;
/** Same horizontal inset as sheet panel → equal gap from screen left/right. */
const SHEET_GRID_WIDTH = width - PAD * 2;
const SHEET_COL_GAP = 14;
const SHEET_ROW_GAP = 20;
/** Column width: 4 tiles + 3 gaps = full inner width (no skewed margins). */
const SHEET_TILE =
  (SHEET_GRID_WIDTH - SHEET_COL_GAP * (SHEET_COLUMNS - 1)) / SHEET_COLUMNS;
/** Photo slightly narrower than column for clear separation; no grey ring (transparent). */
const SHEET_IMG_SIZE = Math.round(SHEET_TILE - 6);

export default function CategoryBrowseScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>();
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const activeCategory = useMemo(() => normalizeCategorySlugParam(slugParam), [slugParam]);
  const railMetrics = useMemo(
    () => computeCategoryBrowseRailMetrics(windowWidth),
    [windowWidth]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [cuisinesSheetOpen, setCuisinesSheetOpen] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("any");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [filterHasOffers, setFilterHasOffers] = useState(false);
  const [openNow, setOpenNow] = useState(true);

  const setCategoryRoute = useCallback(
    (slug: string) => {
      try {
        router.setParams({ slug });
      } catch {
        router.replace({ pathname: "/home/category/[slug]", params: { slug } });
      }
    },
    [router]
  );

  const closeCuisinesSheet = useCallback(() => setCuisinesSheetOpen(false), []);

  const applyCuisineFromSheet = useCallback(
    (categoryId: string) => {
      setCuisinesSheetOpen(false);
      setCategoryRoute(categoryId);
    },
    [setCategoryRoute]
  );

  const { coords } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords, 400);
  const { data, isLoading } = useQuery({
    queryKey: ["merchants", activeCategory, debouncedCoords?.latitude, debouncedCoords?.longitude],
    queryFn: () =>
      merchantService.getMerchants({
        limit: activeCategory !== "all" ? 50 : 20,
        ...(debouncedCoords?.latitude != null && debouncedCoords?.longitude != null
          ? { lat: debouncedCoords.latitude, lng: debouncedCoords.longitude }
          : {}),
      }),
    enabled: debouncedCoords?.latitude != null && debouncedCoords?.longitude != null,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: apiSheetCategories = [], isSuccess: sheetCategoriesReady, isFetching: sheetCategoriesFetching } =
    useQuery({
      queryKey: ["userAppCategories", SHEET_STORE_TYPE],
      queryFn: () => fetchUserAppCategories({ storeType: SHEET_STORE_TYPE }),
      staleTime: 10 * 60 * 1000,
      retry: 1,
    });

  const cuisinesSheetRows = useMemo(() => {
    if (!sheetCategoriesReady) return [];
    const deduped = dedupeUserAppCategories(apiSheetCategories ?? []);
    return deduped.map((r) => ({
      key: String(r.id),
      slug: String(r.id),
      label: r.name,
      remoteUri: r.imageUrl,
    }));
  }, [sheetCategoriesReady, apiSheetCategories]);

  /** Top rail: All always first; selected category (if any) second; then the rest. */
  const browseCategoryChips = useMemo((): BrowseCategoryChip[] => {
    const allChip: BrowseCategoryChip = { kind: "all", id: "all", name: "All" };
    if (!sheetCategoriesReady) return [allChip];
    const deduped = dedupeUserAppCategories(apiSheetCategories ?? []);
    const more = deduped.length > RAIL_MAX_CATEGORY_ITEMS;
    const seeAll: BrowseCategoryChip | null = more
      ? { kind: "seeAll", id: "see-all", name: "See all" }
      : null;

    const rowToChip = (r: UserAppCategoryItem): BrowseCategoryChip => ({
      kind: "item",
      id: String(r.id),
      name: r.name,
      remoteUri: r.imageUrl,
    });

    const limited = deduped.slice(0, RAIL_MAX_CATEGORY_ITEMS);
    const limitedChips = limited.map(rowToChip);

    const defaultOrder = (): BrowseCategoryChip[] =>
      seeAll ? [allChip, ...limitedChips, seeAll] : [allChip, ...limitedChips];

    if (activeCategory === "all") return defaultOrder();

    const selRow = deduped.find((r) => String(r.id) === activeCategory);
    if (!selRow) return defaultOrder();

    const selectedChip = rowToChip(selRow);
    const othersChips = deduped
      .filter((r) => String(r.id) !== activeCategory)
      .slice(0, RAIL_MAX_CATEGORY_ITEMS)
      .map(rowToChip);

    const ordered: BrowseCategoryChip[] = [allChip, selectedChip, ...othersChips];
    return seeAll ? [...ordered, seeAll] : ordered;
  }, [sheetCategoriesReady, apiSheetCategories, activeCategory]);

  const merchants = Array.isArray(data) ? data : [];
  const searchQ = searchQuery.trim().toLowerCase();
  const filteredMerchants = useMemo(() => {
    if (!searchQ) return merchants;
    return merchants.filter((m) => {
      if (m.name.toLowerCase().includes(searchQ)) return true;
      if (m.cuisines?.some((c) => c.toLowerCase().includes(searchQ))) return true;
      return false;
    });
  }, [merchants, searchQ]);

  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const statusMap = useStoreStatusStore((s) => s.statusMap);

  useEffect(() => {
    merchants.forEach((m) => {
      const raw = ((m as { liveStatus?: string }).liveStatus ?? "").toString().trim().toUpperCase();
      const liveStatus = raw === "OPEN" || raw === "CLOSED" ? (raw as "OPEN" | "CLOSED") : undefined;
      if (liveStatus) setStatusFromApi(m.id, liveStatus === "OPEN", liveStatus);
    });
  }, [merchants, setStatusFromApi]);

  const selectedCategoryLabel = useMemo(() => {
    if (activeCategory === "all") return null;
    const deduped = dedupeUserAppCategories(apiSheetCategories ?? []);
    return deduped.find((r) => String(r.id) === activeCategory)?.name?.trim() ?? null;
  }, [activeCategory, apiSheetCategories]);

  const categoryScopedMerchants = useMemo(() => {
    let list = filteredMerchants;
    if (activeCategory !== "all" && selectedCategoryLabel) {
      const needle = selectedCategoryLabel.toLowerCase();
      list = list.filter((m) => {
        if (m.cuisines?.some((c) => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase())))
          return true;
        if (m.name.toLowerCase().includes(needle)) return true;
        return false;
      });
    }
    return list;
  }, [filteredMerchants, activeCategory, selectedCategoryLabel]);

  const displayMerchants = useMemo(
    () =>
      filterAndSortMerchants(categoryScopedMerchants, statusMap, {
        openNow,
        filterHasOffers,
        deliveryFilter,
        selectedCuisines,
      }),
    [categoryScopedMerchants, statusMap, openNow, deliveryFilter, selectedCuisines, filterHasOffers]
  );

  const isCategoryFocus = activeCategory !== "all";
  const recommended = displayMerchants.slice(0, 6);
  const allRestaurants = displayMerchants;

  const toggleCuisine = useCallback((c: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }, []);

  const hasActiveFilters =
    deliveryFilter !== "any" || selectedCuisines.length > 0 || filterHasOffers;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (deliveryFilter !== "any") n += 1;
    n += selectedCuisines.length;
    if (filterHasOffers) n += 1;
    return n;
  }, [deliveryFilter, selectedCuisines, filterHasOffers]);

  const clearFilters = useCallback(() => {
    setDeliveryFilter("any");
    setSelectedCuisines([]);
    setFilterHasOffers(false);
  }, []);

  const applyFilters = useCallback(() => setFilterSheetVisible(false), []);

  const openFullSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (q) router.push({ pathname: "/search", params: { q } });
    else router.push("/search");
  }, [router, searchQuery]);

  return (
    <View style={styles.container}>
      <Modal
        visible={cuisinesSheetOpen}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeCuisinesSheet}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeCuisinesSheet} accessibilityRole="button" />
          <View style={styles.sheetShell} pointerEvents="box-none">
            <View style={styles.sheetFloatingCloseWrap} pointerEvents="box-none">
              <TouchableOpacity
                onPress={closeCuisinesSheet}
                style={styles.sheetFloatingClose}
                hitSlop={14}
                accessibilityLabel="Close"
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <View
              style={[styles.sheetPanel, { paddingBottom: Math.max(insets.bottom, 12), height: SHEET_MAX_HEIGHT }]}
            >
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Cuisines & Dishes</Text>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.sheetGrid,
                cuisinesSheetRows.length === 0 ? styles.sheetGridEmpty : null,
              ]}
              nestedScrollEnabled
            >
              {sheetCategoriesFetching && cuisinesSheetRows.length === 0 ? (
                <View style={styles.sheetStateBlock}>
                  <ActivityIndicator size="large" color={TEAL} />
                </View>
              ) : cuisinesSheetRows.length === 0 ? (
                <View style={styles.sheetStateBlock}>
                  <Text style={styles.sheetEmptyText}>No cuisines to show yet.</Text>
                  <Text style={styles.sheetEmptyHint}>Add rows in user_app_category (FOOD, active).</Text>
                </View>
              ) : (
                cuisinesSheetRows.map((item) => {
                  const sheetTileActive =
                    activeCategory !== "all" && item.slug === activeCategory;
                  const sheetRing = sheetTileActive ? 2 : 0;
                  const sheetImgSz = Math.max(36, SHEET_IMG_SIZE - sheetRing * 2);
                  return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.sheetTile}
                    onPress={() => applyCuisineFromSheet(item.slug)}
                    activeOpacity={0.88}
                  >
                    <View
                      style={[
                        styles.sheetTileImageWrap,
                        {
                          borderWidth: sheetRing,
                          borderColor: sheetTileActive ? TEAL : "transparent",
                          backgroundColor: sheetTileActive
                            ? "rgba(20, 184, 166, 0.08)"
                            : "transparent",
                        },
                      ]}
                    >
                      <CuisinesSheetTileImage
                        remoteUri={item.remoteUri}
                        localSource={null}
                        style={{
                          width: sheetImgSz,
                          height: sheetImgSz,
                          borderRadius: sheetImgSz / 2,
                        }}
                      />
                    </View>
                    <Text
                      style={[
                        styles.sheetTileLabel,
                        sheetTileActive ? styles.sheetTileLabelActive : null,
                      ]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
      {/* Header: back, search (no cart on food) */}
      <View style={[styles.header, SHADOW]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={TEXT_GRAY} />
          <TextInput
            style={styles.searchInput}
            placeholder="Restaurant name or a dish..."
            placeholderTextColor={TEXT_GRAY}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={openFullSearch}
            blurOnSubmit
          />
          <TouchableOpacity
            style={styles.micBtn}
            hitSlop={8}
            onPress={() => router.push({ pathname: "/search", params: { voice: "1" } })}
            accessibilityLabel="Voice search"
          >
            <Ionicons name="mic-outline" size={22} color={TEAL} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Category chips – horizontal */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.categoryChipsWrap,
            { gap: railMetrics.gap, paddingRight: PAD + railMetrics.gap },
          ]}
          style={styles.categoryChipsScroll}
        >
          {browseCategoryChips.map((c) => {
            const chipKey =
              c.kind === "all" ? "all" : c.kind === "seeAll" ? "see-all" : c.id;
            const allActive = c.kind === "all" && activeCategory === "all";
            const itemActive = c.kind === "item" && activeCategory === c.id;
            const ringW = allActive || itemActive ? 2 : 0;
            const imgSide = Math.max(40, railMetrics.icon - ringW * 2);
            const ringColor =
              allActive || itemActive ? TEAL : "transparent";

            return (
            <TouchableOpacity
              key={chipKey}
              onPress={() => {
                if (c.kind === "all") {
                  setCategoryRoute("all");
                  setCuisinesSheetOpen(true);
                  return;
                }
                if (c.kind === "seeAll") {
                  setCuisinesSheetOpen(true);
                  return;
                }
                setCuisinesSheetOpen(false);
                setCategoryRoute(c.id);
              }}
              style={[styles.categoryChip, { width: railMetrics.chipW }]}
              activeOpacity={0.8}
            >
              {c.kind === "all" ? (
                <View
                  style={{
                    width: railMetrics.icon,
                    height: railMetrics.icon,
                    marginBottom: 6,
                    borderRadius: railMetrics.icon / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderWidth: ringW,
                    borderColor: ringColor,
                    backgroundColor: allActive ? "rgba(20, 184, 166, 0.06)" : "transparent",
                  }}
                >
                  <Ionicons
                    name="storefront"
                    size={Math.round(26 * (imgSide / 56))}
                    color={allActive ? TEAL : TITLE_DARK}
                  />
                </View>
              ) : c.kind === "seeAll" ? (
                <View
                  style={[
                    styles.categoryChipImage,
                    styles.seeAllChipCircle,
                    {
                      width: railMetrics.icon,
                      height: railMetrics.icon,
                      borderRadius: railMetrics.icon / 2,
                    },
                  ]}
                >
                  <Ionicons name="apps" size={Math.round(22 * (railMetrics.icon / 56))} color={TEAL} />
                </View>
              ) : (
                <View
                  collapsable={Platform.OS === "android" ? false : undefined}
                  style={{
                    width: railMetrics.icon,
                    height: railMetrics.icon,
                    marginBottom: 6,
                    borderRadius: railMetrics.icon / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderWidth: ringW,
                    borderColor: ringColor,
                    backgroundColor: itemActive ? "rgba(20, 184, 166, 0.06)" : "transparent",
                  }}
                >
                  <CuisinesSheetTileImage
                    remoteUri={c.remoteUri}
                    localSource={null}
                    style={{
                      width: imgSide,
                      height: imgSide,
                      borderRadius: imgSide / 2,
                      backgroundColor: "transparent",
                    }}
                  />
                </View>
              )}
              <Text
                style={[
                  styles.categoryChipText,
                  allActive || itemActive ? styles.categoryChipTextActive : null,
                ]}
                numberOfLines={2}
              >
                {c.name}
              </Text>
            </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Filter / offer pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsWrap}
        >
          <TouchableOpacity
            style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
            activeOpacity={0.8}
            onPress={() => setFilterSheetVisible(true)}
          >
            <Ionicons name="options-outline" size={18} color={hasActiveFilters ? "#fff" : TITLE_DARK} />
            <Text style={[styles.filterBtnText, hasActiveFilters && styles.filterBtnTextActive]}>Filters</Text>
            <Ionicons name="chevron-down" size={14} color={hasActiveFilters ? "#fff" : TEXT_GRAY} />
          </TouchableOpacity>
          {OFFER_PILLS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.pill, p.tag && styles.pillNew]}
              activeOpacity={0.8}
            >
              {p.tag ? (
                <View style={styles.pillNewTag}><Text style={styles.pillNewTagText}>{p.tag}</Text></View>
              ) : null}
              {p.icon === "flash" ? (
                <Ionicons name="flash" size={14} color={TEAL} />
              ) : null}
              <Text style={[styles.pillText, p.tag && styles.pillTextNew]} numberOfLines={1}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isCategoryFocus ? (
          <>
            <Text style={styles.sectionHeading}>ALL RESTAURANTS</Text>
            {selectedCategoryLabel ? (
              <Text style={[styles.sectionSub, styles.sectionSubAccent]}>{selectedCategoryLabel}</Text>
            ) : null}
            {isLoading ? (
              <View style={styles.skeletonListWrap}>
                <RestaurantListSkeleton count={5} />
              </View>
            ) : allRestaurants.length === 0 ? (
              <EmptyRestaurantsNearby />
            ) : (
              <View style={styles.fullBleedList}>
                {allRestaurants.map((m) => (
                  <GMRestaurantCardV2 key={m.id} merchant={m} />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionHeading}>RECOMMENDED FOR YOU</Text>
            {isLoading ? (
              <View style={styles.skeletonListWrap}>
                <RestaurantListSkeleton count={3} />
              </View>
            ) : (
              <View style={styles.dishGrid}>
                {recommended.map((m) => (
                  <DishCard
                    key={m.id}
                    id={m.id}
                    name={m.name}
                    rating={m.avgRating ?? undefined}
                    deliveryTime={m.deliveryTime}
                    offerBadge="FLAT 50% OFF"
                    imageUrl={merchantCardImageUri(m)}
                    onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: m.id } })}
                  />
                ))}
              </View>
            )}

            <Text style={styles.sectionHeading}>ALL RESTAURANTS</Text>
            <Text style={styles.sectionSub}>Featured</Text>
            {isLoading ? (
              <View style={styles.skeletonListWrap}>
                <RestaurantListSkeleton count={4} />
              </View>
            ) : allRestaurants.length === 0 ? (
              <EmptyRestaurantsNearby />
            ) : (
              allRestaurants.map((m) => {
                const featuredHero = merchantCardImageUri(m);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.featuredCard}
                    onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: m.id } })}
                    activeOpacity={0.9}
                  >
                    <View style={styles.featuredImageWrap}>
                      {featuredHero ? (
                        <Image source={{ uri: featuredHero }} style={styles.featuredImage} resizeMode="cover" />
                      ) : (
                        <Image source={DEFAULT_MERCHANT_IMAGE} style={styles.featuredImage} resizeMode="cover" />
                      )}
                      <View style={styles.featuredOfferTag}>
                        <Text style={styles.featuredOfferText}>Flat 50% OFF</Text>
                      </View>
                      <View style={styles.featuredOverlay}>
                        <Text style={styles.featuredTitle} numberOfLines={1}>
                          {m.name}
                        </Text>
                        <Text style={styles.featuredPrice}>
                          ₹{(m as MerchantSummary & { costForTwo?: number }).costForTwo ?? 299} for two
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        <BrandingFooter />
      </ScrollView>

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
                  style={[styles.filterSheetRow, openNow && styles.filterSheetRowActive]}
                  onPress={() => setOpenNow((v) => !v)}
                  activeOpacity={0.88}
                >
                  <View
                    style={[
                      styles.filterSheetRowIconWrap,
                      openNow && styles.filterSheetRowIconWrapActive,
                    ]}
                  >
                    <Ionicons
                      name="storefront-outline"
                      size={20}
                      color={openNow ? "#fff" : GatiMitraColors.primaryMint}
                    />
                  </View>
                  <Text style={[styles.filterSheetRowText, openNow && styles.filterSheetRowTextOnMint]}>
                    Open Now — open first, closed below
                  </Text>
                  {openNow ? (
                    <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.filterSheetRowTrailing} />
                  ) : null}
                </TouchableOpacity>
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
                  <Text style={[styles.filterSheetRowText, filterHasOffers && styles.filterSheetRowTextOnMint]}>
                    Has offers
                  </Text>
                  {filterHasOffers ? (
                    <Ionicons name="checkmark-circle" size={22} color="#fff" style={styles.filterSheetRowTrailing} />
                  ) : null}
                </TouchableOpacity>
              </ScrollView>
              <View style={[styles.filterSheetFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                <TouchableOpacity style={styles.filterApplyBtnOuter} onPress={applyFilters} activeOpacity={0.92}>
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

const CARD_WIDTH = (width - PAD * 2 - 12) / 2;
const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  /** Pinned to bottom; height cap matches SHEET_MAX_HEIGHT so it reads as a drawer, not full bleed. */
  sheetShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    maxHeight: SHEET_MAX_HEIGHT,
    zIndex: 2,
  },
  sheetFloatingCloseWrap: {
    position: "absolute",
    top: -26,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  sheetFloatingClose: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4b5563",
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW,
    elevation: 6,
  },
  sheetPanel: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: PAD,
    ...SHADOW,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetHeaderRow: {
    marginBottom: 16,
    paddingTop: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TITLE_DARK,
  },
  sheetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: SHEET_COL_GAP,
    rowGap: SHEET_ROW_GAP,
    width: SHEET_GRID_WIDTH,
    alignSelf: "center",
    paddingBottom: 24,
  },
  sheetGridEmpty: {
    flexGrow: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetStateBlock: {
    width: SHEET_GRID_WIDTH,
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEmptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_DARK,
    textAlign: "center",
  },
  sheetEmptyHint: {
    fontSize: 13,
    color: TEXT_GRAY,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 12,
  },
  sheetTile: {
    width: SHEET_TILE,
    alignItems: "center",
  },
  /** Transparent — no grey circle; optional soft clip only. */
  sheetTileImageWrap: {
    width: SHEET_IMG_SIZE,
    height: SHEET_IMG_SIZE,
    borderRadius: SHEET_IMG_SIZE / 2,
    overflow: "hidden",
    backgroundColor: "transparent",
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTileLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: TEXT_GRAY,
    textAlign: "center",
    lineHeight: 13,
    width: SHEET_TILE,
    paddingHorizontal: 2,
  },
  sheetTileLabelActive: {
    color: TEAL,
    fontWeight: "700",
  },
  seeAllChipCircle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFEFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.35)",
    borderRadius: 28,
  },
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    paddingHorizontal: PAD,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  backBtn: { padding: 6 },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  micBtn: { padding: 4 },
  cartBtn: { padding: 6, position: "relative" },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  categoryChipsScroll: { marginBottom: 8 },
  categoryChipsWrap: {
    paddingHorizontal: PAD,
    paddingVertical: 12,
    gap: 16,
  },
  categoryChip: {
    alignItems: "center",
    width: 72,
  },
  categoryChipImage: {
    width: 56,
    height: 56,
    marginBottom: 6,
    backgroundColor: "transparent",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
    textDecorationLine: "none",
  },
  categoryChipTextActive: {
    color: TEAL,
    fontWeight: "700",
    textDecorationLine: "none",
  },
  pillsWrap: {
    paddingHorizontal: PAD,
    paddingBottom: 8,
    marginBottom: 12,
    gap: 10,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterBtnActive: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderColor: GatiMitraColors.primaryMint,
  },
  filterBtnText: { fontSize: 14, fontWeight: "600", color: TITLE_DARK },
  filterBtnTextActive: { color: "#fff" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillNew: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  pillNewTag: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillNewTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  pillText: { fontSize: 13, fontWeight: "600", color: TITLE_DARK },
  pillTextNew: { color: "#991b1b" },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginHorizontal: PAD,
    marginTop: 20,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginHorizontal: PAD,
    marginBottom: 12,
  },
  sectionSubAccent: {
    color: GatiMitraColors.primaryMint,
    fontWeight: "700",
  },
  fullBleedList: {
    paddingBottom: 8,
  },
  dishGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: 12,
  },
  dishCard: {
    width: CARD_WIDTH,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },
  dishCardSkeleton: { height: 180, backgroundColor: BORDER },
  dishImageWrap: {
    width: "100%",
    height: 120,
    backgroundColor: "#eee",
    position: "relative",
  },
  dishImage: { width: "100%", height: "100%" },
  offerTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: TEAL,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerTagBlue: { backgroundColor: "#3b82f6" },
  offerTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  ratingBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  dishName: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginTop: 8,
    marginHorizontal: 10,
  },
  dishMeta: { marginHorizontal: 10, marginBottom: 10, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: TEXT_GRAY },
  gridPlaceholder: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: 12,
  },
  skeletonListWrap: { marginBottom: 16 },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
    marginHorizontal: PAD,
  },
  emptyText: { fontSize: 15, color: TEXT_GRAY, marginTop: 8 },
  featuredCard: {
    marginHorizontal: PAD,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  featuredImageWrap: {
    height: 160,
    position: "relative",
    backgroundColor: "#eee",
  },
  featuredImage: { width: "100%", height: "100%" },
  featuredOfferTag: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  featuredOfferText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  featuredOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  featuredTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  featuredPrice: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
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
    paddingHorizontal: PAD,
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
    paddingHorizontal: PAD,
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
    marginBottom: 8,
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
    paddingHorizontal: PAD,
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
