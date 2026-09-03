/**
 * Explore Nearby — light mint discovery feed.
 * Nearby merchants (food + grocery) from API; no hardcoded store media.
 */

import { useCallback, useEffect, useMemo, useState, useLayoutEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar as NativeStatusBar,
  ScrollView,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GMSearchBar } from "@/components/GMSearchBar";
import { GatiCashHeaderPill } from "@/components/home/GatiCashHeaderPill";
import { EmptyRestaurantsNearby } from "@/components/EmptyRestaurantsNearby";
import { BrandingFooter } from "@/components/BrandingFooter";
import {
  GMRestaurantCardV2,
  RESTAURANT_CARD_ESTIMATED_SIZE,
} from "@/components/GMRestaurantCardV2";
import {
  NearMeFilterSheet,
  DEFAULT_NEAR_ME_FILTERS,
  countNearMeFilters,
  merchantPassesNearMeFilters,
  type NearMeFilters,
} from "@/components/near-me/NearMeFilterSheet";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  resolveTopSafeInset,
  STATUS_BAR_TO_HEADER_GAP,
} from "@/constants/layout";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import {
  filterAndSortMerchants,
  isTopBrandMerchant,
  type MerchantListSort,
} from "@/lib/merchantListing";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { merchantService, type MerchantSummary } from "@/services/merchant.service";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { FOOD_HOME_FALLBACK, safeRouterBack } from "@/lib/safeRouterBack";

const PAGE_BG = GatiMitraColors.softBackground;
const SURFACE = "#FFFFFF";
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const BORDER = GatiMitraColors.border;
const MINT = GatiMitraColors.splashMint;
const NEARBY_LIMIT = 50;

type StoreTypeFilter = "ALL" | "FOOD" | "GROCERY";

const STORE_TABS: { id: StoreTypeFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "FOOD", label: "Food" },
  { id: "GROCERY", label: "Grocery" },
];

const SORT_OPTIONS: { id: MerchantListSort; label: string }[] = [
  { id: "default", label: "Relevance" },
  { id: "rating", label: "Rating: High to Low" },
  { id: "distance", label: "Distance: Near first" },
];

function normalizeStoreType(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

function isFoodStoreType(st: string): boolean {
  return (
    st === "FOOD" ||
    st === "RESTAURANT" ||
    st === "CLOUD_KITCHEN" ||
    st === "BAKERY" ||
    st === "CAFE"
  );
}

function matchesStoreTypeFilter(m: MerchantSummary, filter: StoreTypeFilter): boolean {
  if (filter === "ALL") return true;
  const st = normalizeStoreType(m.storeType);
  if (filter === "GROCERY") return st === "GROCERY";
  return isFoodStoreType(st) || !st;
}

function sortLabel(sortBy: MerchantListSort): string {
  if (sortBy === "rating") return "Rating";
  if (sortBy === "distance") return "Distance";
  return "Sort";
}

function NearMeSortSheet({
  visible,
  sortBy,
  onClose,
  onApply,
}: {
  visible: boolean;
  sortBy: MerchantListSort;
  onClose: () => void;
  onApply: (sort: MerchantListSort) => void;
}) {
  const [draft, setDraft] = useState<MerchantListSort>(sortBy);

  useEffect(() => {
    if (visible) setDraft(sortBy);
  }, [visible, sortBy]);

  const canApply = draft !== sortBy;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.48}>
      <View style={sortStyles.body}>
        <AppText style={sortStyles.title}>Sort by</AppText>
        {SORT_OPTIONS.map((opt) => {
          const selected = draft === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={sortStyles.row}
              activeOpacity={0.85}
              onPress={() => setDraft(opt.id)}
            >
              <AppText style={sortStyles.rowLabel}>{opt.label}</AppText>
              <View style={[sortStyles.radio, selected && sortStyles.radioOn]}>
                {selected ? <View style={sortStyles.radioDot} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={sortStyles.footer}>
        <TouchableOpacity
          onPress={() => setDraft("default")}
          hitSlop={12}
          disabled={draft === "default"}
        >
          <AppText style={[sortStyles.clear, draft === "default" && sortStyles.clearDisabled]}>
            Clear
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sortStyles.apply, !canApply && sortStyles.applyDisabled]}
          activeOpacity={0.88}
          disabled={!canApply}
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        >
          <AppText style={[sortStyles.applyText, !canApply && sortStyles.applyTextDisabled]}>
            Apply
          </AppText>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

function ActionChip({
  label,
  icon,
  active,
  showChevron,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  showChevron?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionChip, active && styles.actionChipOn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? MINT : TEXT} /> : null}
      <AppText style={[styles.actionChipText, active && styles.actionChipTextOn]} numberOfLines={1}>
        {label}
      </AppText>
      {showChevron ? (
        <Ionicons name="chevron-down" size={12} color={active ? MINT : MUTED} />
      ) : null}
    </TouchableOpacity>
  );
}

export default function ExploreNearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = resolveTopSafeInset(insets.top) + STATUS_BAR_TO_HEADER_GAP;
  const bottomPad = Math.max(insets.bottom, 12) + 20;

  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [storeType, setStoreType] = useState<StoreTypeFilter>("ALL");
  const [filters, setFilters] = useState<NearMeFilters>(DEFAULT_NEAR_ME_FILTERS);
  const [sortBy, setSortBy] = useState<MerchantListSort>("default");

  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const address = useLocationStore((s) => s.address);
  const debouncedCoords = useDebouncedCoords(coords);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  const statusMap = useStoreStatusStore((s) => s.statusMap);

  const listingCoords = locationSource === "selected" ? coords : debouncedCoords;
  const pin = useMemo(
    () =>
      resolveMerchantListingCoords({
        locationSource,
        listingCoords,
        addresses,
        activeLocation,
      }),
    [locationSource, listingCoords, addresses, activeLocation]
  );

  const locationLabel = useMemo(() => {
    const resolved = resolveDeliveryLocationLabel({
      locationSource,
      address,
      addresses,
      coords: listingCoords,
    });
    if (!resolved) return "Choose delivery location";
    return resolved.length > 36 ? `${resolved.slice(0, 33)}…` : resolved;
  }, [locationSource, address, addresses, listingCoords]);

  useFocusEffect(
    useCallback(() => {
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor("transparent", true);
        NativeStatusBar.setBarStyle("dark-content", true);
      }
      useScreenChromeStore.setState({
        statusBarBackground: PAGE_BG,
        statusBarStyle: "dark",
        hideStatusBarSpacer: true,
      });
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [])
  );

  const {
    data: merchantsRaw = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey:
      pin?.latitude != null && pin?.longitude != null
        ? (["merchants", "nearby-all", pin.latitude.toFixed(3), pin.longitude.toFixed(3)] as const)
        : (["merchants", "nearby-all", "pending"] as const),
    queryFn: async () => {
      if (pin?.latitude == null || pin?.longitude == null) return [];
      return merchantService.getMerchants({
        lat: pin.latitude,
        lng: pin.longitude,
        limit: NEARBY_LIMIT,
        vegOnly: false,
        distanceMode: "road",
        storeType: "ALL",
      });
    },
    enabled: pin?.latitude != null && pin?.longitude != null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const buildFilteredList = useCallback(
    (source: MerchantSummary[], f: NearMeFilters, type: StoreTypeFilter, sort: MerchantListSort) => {
      const typed = source.filter((m) => matchesStoreTypeFilter(m, type));
      const openGate = f.openNow || f.eventOpen;
      let list = filterAndSortMerchants(typed, statusMap, {
        openNow: openGate,
        hideClosed: openGate,
        sortBy: sort,
        nearFast: f.nearFast,
        filterHasOffers: f.hasOffers,
        selectedCuisines: f.cuisines,
      });
      if (f.topBrandsOnly) list = list.filter(isTopBrandMerchant);
      return list.filter((m) => merchantPassesNearMeFilters(m, f));
    },
    [statusMap]
  );

  const merchants = useMemo(
    () => buildFilteredList(merchantsRaw, filters, storeType, sortBy),
    [buildFilteredList, merchantsRaw, filters, storeType, sortBy]
  );

  useLayoutEffect(() => {
    if (merchantsRaw.length > 0) {
      prefetchMerchantCardImages(merchantsRaw);
      prefetchMerchantBanners(merchantsRaw);
    }
  }, [merchantsRaw]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const filterCount = countNearMeFilters(filters);
  const matchCountForDraft = useCallback(
    (draft: NearMeFilters) => buildFilteredList(merchantsRaw, draft, storeType, sortBy).length,
    [buildFilteredList, merchantsRaw, storeType, sortBy]
  );

  const renderItem: ListRenderItem<MerchantSummary> = useCallback(
    ({ item }) => <GMRestaurantCardV2 merchant={item} />,
    []
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <AppText style={styles.sectionEyebrow}>
          {merchants.length > 0
            ? `${merchants.length} place${merchants.length === 1 ? "" : "s"} near you`
            : isLoading
              ? "Finding places nearby…"
              : "Nearby places"}
        </AppText>
      </View>
    ),
    [merchants.length, isLoading]
  );

  const listEmpty = !isLoading && !isFetching && merchants.length === 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBlock, { paddingTop: topPad }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => safeRouterBack(router, FOOD_HOME_FALLBACK)}
            accessibilityLabel="Go back"
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => router.push("/location")}
            activeOpacity={0.85}
          >
            <AppText style={styles.title}>Explore nearby</AppText>
            <View style={styles.locRow}>
              <Ionicons name="location-sharp" size={12} color={MINT} />
              <AppText style={styles.locText} numberOfLines={1}>
                {locationLabel}
              </AppText>
              <Ionicons name="chevron-down" size={12} color={MUTED} />
            </View>
          </TouchableOpacity>

          <GatiCashHeaderPill />
        </View>

        <View style={styles.searchPad}>
          <GMSearchBar
            onPress={() => router.push({ pathname: "/search", params: { storeType: "FOOD" } })}
            placeholder="Search restaurants, groceries…"
            rotatingPlaceholder={false}
          />
        </View>

        <View style={styles.tabsRow}>
          {STORE_TABS.map((tab) => {
            const active = storeType === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setStoreType(tab.id)}
                activeOpacity={0.85}
              >
                <AppText style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsRow}
          style={styles.actionsScroll}
          keyboardShouldPersistTaps="handled"
        >
          <ActionChip
            label={sortLabel(sortBy)}
            icon="swap-vertical"
            showChevron
            active={sortBy !== "default"}
            onPress={() => setSortOpen(true)}
          />
          <ActionChip
            label={filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
            icon="options-outline"
            active={filterCount > 0}
            onPress={() => setFiltersOpen(true)}
          />
          <ActionChip
            label="Near & Fast"
            active={filters.nearFast}
            onPress={() =>
              setFilters((f) => ({
                ...f,
                nearFast: !f.nearFast,
              }))
            }
          />
          <ActionChip
            label="Offers"
            active={filters.hasOffers}
            onPress={() => setFilters((f) => ({ ...f, hasOffers: !f.hasOffers }))}
          />
          <ActionChip
            label="Open now"
            active={filters.openNow}
            onPress={() => setFilters((f) => ({ ...f, openNow: !f.openNow }))}
          />
        </ScrollView>
      </View>

      {isLoading && merchants.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={MINT} size="large" />
          <AppText style={styles.loadingHint}>Looking around your area…</AppText>
        </View>
      ) : isError && merchantsRaw.length === 0 ? (
        <View style={styles.centered}>
          <AppText style={styles.errorText}>Couldn’t load nearby stores.</AppText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()} activeOpacity={0.85}>
            <AppText style={styles.retryText}>Try again</AppText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          data={merchants}
          style={styles.list}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          estimatedItemSize={RESTAURANT_CARD_ESTIMATED_SIZE}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bottomPad,
            paddingTop: 4,
          }}
          ListEmptyComponent={
            listEmpty ? (
              <EmptyRestaurantsNearby onPress={() => safeRouterBack(router, FOOD_HOME_FALLBACK)} />
            ) : null
          }
          ListFooterComponent={merchants.length > 0 ? <BrandingFooter /> : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={MINT}
              colors={[MINT]}
            />
          }
        />
      )}

      <NearMeSortSheet
        visible={sortOpen}
        sortBy={sortBy}
        onClose={() => setSortOpen(false)}
        onApply={(next) => {
          setSortBy(next);
          if (next !== "default") {
            setFilters((f) => ({ ...f, nearFast: false }));
          }
        }}
      />

      <NearMeFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        merchants={merchantsRaw}
        matchCount={matchCountForDraft}
      />
    </View>
  );
}

const sortStyles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    borderColor: MINT,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  clear: {
    fontSize: 15,
    fontWeight: "700",
    color: MINT,
  },
  clearDisabled: {
    color: "#CBD5E1",
  },
  apply: {
    backgroundColor: MINT,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  applyDisabled: {
    backgroundColor: "#E5E7EB",
  },
  applyText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  applyTextDisabled: {
    color: "#94A3B8",
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  topBlock: {
    backgroundColor: PAGE_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.4,
  },
  locRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  locText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  searchPad: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: "#EEF2F1",
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: SURFACE,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
  },
  tabTextActive: {
    color: TEXT,
  },
  actionsScroll: {
    flexGrow: 0,
    marginTop: 10,
  },
  actionsRow: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: "center",
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  actionChipOn: {
    backgroundColor: "rgba(20,184,166,0.10)",
    borderColor: MINT,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
  },
  actionChipTextOn: {
    color: MINT,
  },
  list: {
    flex: 1,
  },
  listHeader: {
    paddingBottom: 8,
    paddingTop: 6,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
  },
  errorText: {
    fontSize: 15,
    color: MUTED,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: MINT,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
