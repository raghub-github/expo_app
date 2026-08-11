/**
 * Store status — independent full-screen (outside tabs).
 * Own page header only; no MerchantHeader / bottom tab bar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useMerchantGoBack, useMerchantNavigate } from "@/lib/merchantNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, type ChildStore } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  GatiMitraMerchant,
  H_PADDING,
  FONT_LORA,
  FONT_LORA_BOLD,
  FONT_POPPINS,
  CARD_RADIUS,
} from "@/constants/theme";
import { getStoreStatus, updateStoreStatus, type StoreStatus } from "@/services/storeStatusApi";
import { getStoreSettings, updateStoreSettings } from "@/services/storeSettingsApi";
import { getRushStatus, startRushWindow, stopRushWindow } from "@/services/rushApi";
import { getOperatingHours, type OperatingHours } from "@/services/outletApi";
import { RestaurantStatusFilterSheet } from "@/components/restaurant-status/RestaurantStatusFilterSheet";
import {
  deliveryStatusLabel,
  formatCurrentDeliverySlot,
  isOutsideDeliverySlot,
  matchesRestaurantStatusFilter,
  type RestaurantStatusFilterId,
  type RestaurantStatusSnapshot,
  RESTAURANT_STATUS_FILTERS,
} from "@/lib/restaurantStatusFilters";

type RowState = {
  store: ChildStore;
  status: StoreStatus | null;
  hours: OperatingHours | null;
  autoAccept: boolean;
  rushActive: boolean;
  loading: boolean;
  toggling?: "delivery" | "auto" | "rush" | null;
};

function localityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return "";
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? fullAddress.trim();
}

function toSnapshot(row: RowState): RestaurantStatusSnapshot {
  const s = row.status;
  return {
    isOpen: s?.is_open === true,
    withinOperatingHours: s?.within_operating_hours !== false,
    rushActive: row.rushActive || s?.active_rush?.is_active === true,
    statusReason: s?.status_reason ?? null,
    unavailableReason: s?.unavailable_reason ?? null,
    restrictionType: s?.restriction_type ?? null,
    manualCloseUntil: s?.manual_close_until ?? null,
    manualActivationLock: s?.block_auto_open === true,
    scheduleEndPrompt: s?.schedule_end_prompt_active === true,
  };
}

function RestaurantCard({
  row,
  onOpen,
  onOpenSettings,
  onOpenHours,
  onToggleDelivery,
  onToggleAutoAccept,
  onToggleRush,
}: {
  row: RowState;
  onOpen: () => void;
  onOpenSettings: () => void;
  onOpenHours: () => void;
  onToggleDelivery: (next: boolean) => void;
  onToggleAutoAccept: (next: boolean) => void;
  onToggleRush: (next: boolean) => void;
}) {
  const snap = toSnapshot(row);
  const online = snap.isOpen;
  const locality = localityFromAddress(row.store.full_address);
  const slot = formatCurrentDeliverySlot(
    row.hours,
    row.status?.next_open_time,
    row.status?.next_close_time
  );
  const busy = row.toggling != null || row.loading;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.store.store_name} store status`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.storeName} numberOfLines={2}>
            {row.store.store_name}
          </Text>
          <Text style={styles.storeMeta} numberOfLines={1}>
            ID: {row.store.store_id}
            {locality ? ` | ${locality}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onOpenSettings();
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Store settings"
        >
          <Ionicons name="settings-outline" size={20} color={GatiMitraMerchant.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <View style={styles.statusDotRow}>
            <View style={[styles.dot, { backgroundColor: online ? GatiMitraMerchant.storeOnline : GatiMitraMerchant.storeOffline }]} />
            <Text style={styles.toggleTitle}>Delivery status</Text>
          </View>
          <Text style={[styles.toggleSub, online ? styles.toggleSubOn : styles.toggleSubOff]} numberOfLines={1}>
            {deliveryStatusLabel(snap)}
          </Text>
        </View>
        <Switch
          value={online}
          disabled={busy}
          onValueChange={onToggleDelivery}
          trackColor={{ false: "#CBD5E1", true: GatiMitraMerchant.storeOnline }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <View style={styles.statusDotRow}>
            <Text style={styles.toggleTitle}>Auto-accept orders</Text>
            <Ionicons name="information-circle-outline" size={15} color={GatiMitraMerchant.textTertiary} style={{ marginLeft: 4 }} />
          </View>
          <Text style={styles.toggleHint} numberOfLines={1}>
            {row.autoAccept ? "Auto accept is on" : "Auto KOT printing turned off"}
          </Text>
        </View>
        <Switch
          value={row.autoAccept}
          disabled={busy}
          onValueChange={onToggleAutoAccept}
          trackColor={{ false: "#CBD5E1", true: GatiMitraMerchant.storeOnline }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleTitle}>Rush mode</Text>
        <Switch
          value={snap.rushActive}
          disabled={busy}
          onValueChange={onToggleRush}
          trackColor={{ false: "#CBD5E1", true: GatiMitraMerchant.storeOnline }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.footerLabel}>Current delivery slot</Text>
          <Text style={styles.footerValue}>{slot}</Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onOpenHours();
          }}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Open operating hours"
        >
          <Text style={styles.detailsLink}>Details ›</Text>
        </Pressable>
      </View>

      {isOutsideDeliverySlot(snap) ? (
        <View style={styles.outsideSlotBanner}>
          <Ionicons name="alert-circle" size={16} color="#FFFFFF" />
          <Text style={styles.outsideSlotText}>
            You are currently outside your scheduled delivery timings
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function RestaurantStatusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useMerchantGoBack("/(tabs)");
  const { push: navPush } = useMerchantNavigate();
  const { token, partner } = useAuth();
  const { selectedStore, setSelectedStore } = useSelectedStore();
  const { refresh: refreshActiveStoreStatus } = useStoreStatus();

  const stores = partner?.childStores ?? [];
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RestaurantStatusFilterId | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const loadAll = useCallback(async () => {
    if (!token || stores.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const initial: RowState[] = stores.map((store) => ({
      store,
      status: null,
      hours: null,
      autoAccept: false,
      rushActive: false,
      loading: true,
      toggling: null,
    }));
    setRows(initial);

    const settled = await Promise.all(
      stores.map(async (store) => {
        try {
          const [status, settings, rush, hours] = await Promise.all([
            getStoreStatus(store.id, token),
            getStoreSettings(store.id, token).catch(() => null),
            getRushStatus(store.id, token).catch(() => null),
            getOperatingHours(store.id, token).catch(() => null),
          ]);
          return {
            store,
            status,
            hours,
            autoAccept: settings?.auto_accept_orders === true,
            rushActive: rush?.is_active === true || status.active_rush?.is_active === true,
            loading: false,
            toggling: null,
          } satisfies RowState;
        } catch {
          return {
            store,
            status: null,
            hours: null,
            autoAccept: false,
            rushActive: false,
            loading: false,
            toggling: null,
          } satisfies RowState;
        }
      })
    );
    setRows(settled);
    setLoading(false);
  }, [token, stores]);

  useEffect(() => {
    setLoading(true);
    void loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const patchRow = useCallback((storeId: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.store.id === storeId ? { ...r, ...patch } : r)));
  }, []);

  const openStoreDetail = useCallback(
    (
      store: ChildStore,
      dest: "status" | "edit-store" | "preparation-time" | "auto-accept" | "hours" = "status"
    ) => {
      setSelectedStore(store);
      navPush(`/(tabs)/profile/${dest}`);
    },
    [navPush, setSelectedStore]
  );

  /** Gear → select that store, then open its Profile / Preferences settings page. */
  const openStorePreferences = useCallback(
    (store: ChildStore) => {
      setSelectedStore(store);
      router.navigate("/(tabs)/profile" as never);
    },
    [router, setSelectedStore]
  );

  const toggleDelivery = useCallback(
    async (store: ChildStore, next: boolean) => {
      if (!token) return;
      patchRow(store.id, { toggling: "delivery" });
      try {
        if (next) {
          const status = await updateStoreStatus(store.id, true, token);
          patchRow(store.id, { status, toggling: null });
        } else {
          const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          const status = await updateStoreStatus(store.id, false, token, {
            manual_close_until: until,
            manual_close_reason: "Temporarily closed",
          });
          patchRow(store.id, { status, toggling: null });
        }
        if (selectedStore?.id === store.id) void refreshActiveStoreStatus();
      } catch (e) {
        const code = (e as Error & { code?: string })?.code;
        if (code === "outside_operating_hours") {
          Alert.alert(
            "Outside operating hours",
            "This restaurant cannot go online outside its delivery slot. Open details to manage hours.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open details", onPress: () => openStoreDetail(store, "status") },
            ]
          );
        } else {
          Alert.alert("Could not update", e instanceof Error ? e.message : "Try again");
        }
        patchRow(store.id, { toggling: null });
        await loadAll();
      }
    },
    [token, patchRow, selectedStore?.id, refreshActiveStoreStatus, openStoreDetail, loadAll]
  );

  const toggleAutoAccept = useCallback(
    async (store: ChildStore, next: boolean) => {
      if (!token) return;
      patchRow(store.id, { autoAccept: next, toggling: "auto" });
      try {
        await updateStoreSettings(store.id, { auto_accept_orders: next }, token);
        patchRow(store.id, { toggling: null });
      } catch {
        patchRow(store.id, { autoAccept: !next, toggling: null });
        Alert.alert("Could not update", "Auto-accept could not be changed. Try again.");
      }
    },
    [token, patchRow]
  );

  const toggleRush = useCallback(
    async (store: ChildStore, next: boolean) => {
      if (!token) return;
      patchRow(store.id, { toggling: "rush", rushActive: next });
      try {
        if (next) {
          await startRushWindow(store.id, 30, token);
        } else {
          await stopRushWindow(store.id, token);
        }
        const status = await getStoreStatus(store.id, token);
        patchRow(store.id, {
          status,
          rushActive: next || status.active_rush?.is_active === true,
          toggling: null,
        });
        if (selectedStore?.id === store.id) void refreshActiveStoreStatus();
      } catch (e) {
        patchRow(store.id, { rushActive: !next, toggling: null });
        Alert.alert("Could not update", e instanceof Error ? e.message : "Try again");
      }
    },
    [token, patchRow, selectedStore?.id, refreshActiveStoreStatus]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = `${row.store.store_name} ${row.store.store_id} ${row.store.full_address ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return matchesRestaurantStatusFilter(toSnapshot(row), filter);
    });
  }, [rows, search, filter]);

  const filterCounts = useMemo(() => {
    const counts: Partial<Record<RestaurantStatusFilterId, number>> = {};
    for (const opt of RESTAURANT_STATUS_FILTERS) {
      counts[opt.id] = rows.filter((r) => matchesRestaurantStatusFilter(toSnapshot(r), opt.id)).length;
    }
    return counts;
  }, [rows]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Store status</Text>
          <Text style={styles.headerSub}>
            You are mapped to {stores.length} store{stores.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={GatiMitraMerchant.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search store name or ID"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            filter != null && styles.filterBtnActive,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filter stores"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filter != null ? "#FFFFFF" : GatiMitraMerchant.textPrimary}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item) => String(item.store.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={GatiMitraMerchant.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {stores.length === 0 ? "No stores mapped yet." : "No stores match this filter."}
            </Text>
          }
          renderItem={({ item }) => (
            <RestaurantCard
              row={item}
              onOpen={() => openStoreDetail(item.store, "status")}
              onOpenSettings={() => openStorePreferences(item.store)}
              onOpenHours={() => openStoreDetail(item.store, "hours")}
              onToggleDelivery={(next) => void toggleDelivery(item.store, next)}
              onToggleAutoAccept={(next) => void toggleAutoAccept(item.store, next)}
              onToggleRush={(next) => void toggleRush(item.store, next)}
            />
          )}
        />
      )}

      <RestaurantStatusFilterSheet
        visible={filterOpen}
        value={filter}
        counts={filterCounts}
        onClose={() => setFilterOpen(false)}
        onApply={setFilter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    marginTop: 2,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 22,
    color: GatiMitraMerchant.textPrimary,
  },
  headerSub: {
    fontFamily: FONT_LORA,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    gap: 10,
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_LORA,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: GatiMitraMerchant.navy,
    borderColor: GatiMitraMerchant.navy,
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeaderText: { flex: 1, paddingRight: 8 },
  storeName: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 16,
    color: GatiMitraMerchant.textPrimary,
  },
  storeMeta: {
    fontFamily: FONT_POPPINS,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 3,
  },
  gearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F7",
  },
  toggleLeft: { flex: 1, paddingRight: 12 },
  statusDotRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  toggleTitle: {
    fontFamily: FONT_LORA,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
  },
  toggleSub: {
    fontFamily: FONT_LORA,
    fontSize: 12,
    marginTop: 2,
    marginLeft: 15,
  },
  toggleSubOn: { color: GatiMitraMerchant.storeOnline },
  toggleSubOff: { color: GatiMitraMerchant.textSecondary },
  toggleHint: {
    fontFamily: FONT_LORA,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  footerLabel: {
    fontFamily: FONT_LORA,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  footerValue: {
    fontFamily: FONT_POPPINS,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    marginTop: 2,
  },
  detailsLink: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 13,
    color: "#2563EB",
  },
  outsideSlotBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DC2626",
    marginTop: 12,
    marginHorizontal: -14,
    marginBottom: -14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  outsideSlotText: {
    flex: 1,
    fontFamily: FONT_POPPINS,
    fontSize: 12,
    color: "#FFFFFF",
    lineHeight: 17,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: FONT_LORA,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
  pressed: { opacity: 0.88 },
});
