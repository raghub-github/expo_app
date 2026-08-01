/**
 * Manage Orders bottom sheet:
 * - Segmented tabs (Payouts/Transactions style): Manage Order | Switch Outlet
 * - Manage Order: multi-select checkboxes → receive orders from chosen outlets
 * - Switch Outlet: single radio → active outlet for this device
 */

import React, { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  Modal,
  View,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ChildStore } from "@/context/AuthContext";
import { GatiMitraMerchant } from "@/constants/theme";

type SheetTab = "manage" | "switch";

type Props = {
  visible: boolean;
  stores: ChildStore[];
  selectedStore: ChildStore | null;
  /** Currently confirmed multi-store selection for the orders board. */
  managedStores: ChildStore[];
  /** Online/offline for the currently active store only. */
  activeStoreOnline: boolean;
  onClose: () => void;
  /** Persist which outlets feed the incoming-orders board on this device. */
  onManagedStoresChange: (stores: ChildStore[]) => void;
  /** Make this outlet the active outlet for dashboard/menu/settings on this device. */
  onSwitchOutlet: (store: ChildStore) => void;
};

function localityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return "";
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? fullAddress.trim();
}

export function ManageOrdersStoresSheet({
  visible,
  stores,
  selectedStore,
  managedStores,
  activeStoreOnline,
  onClose,
  onManagedStoresChange,
  onSwitchOutlet,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SheetTab>("manage");
  const [search, setSearch] = useState("");
  const [draftManagedIds, setDraftManagedIds] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setTab("manage");
    const ids =
      managedStores.length > 0
        ? managedStores.map((s) => s.id)
        : selectedStore
          ? [selectedStore.id]
          : [];
    setDraftManagedIds(ids);
  }, [visible, managedStores, selectedStore]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        s.store_id.toLowerCase().includes(q) ||
        (s.full_address ?? "").toLowerCase().includes(q)
    );
  }, [stores, search]);

  const allSelected =
    stores.length > 0 && stores.every((s) => draftManagedIds.includes(s.id));

  const draftDirty = useMemo(() => {
    const confirmed = new Set(
      (managedStores.length > 0
        ? managedStores
        : selectedStore
          ? [selectedStore]
          : []
      ).map((s) => s.id)
    );
    if (confirmed.size !== draftManagedIds.length) return true;
    return draftManagedIds.some((id) => !confirmed.has(id));
  }, [draftManagedIds, managedStores, selectedStore]);

  const toggleManaged = (store: ChildStore) => {
    setDraftManagedIds((prev) => {
      const has = prev.includes(store.id);
      if (has) {
        // Keep at least one outlet on the board.
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== store.id);
      }
      return [...prev, store.id];
    });
  };

  const selectAllManaged = () => {
    setDraftManagedIds(stores.map((s) => s.id));
  };

  const clearToActiveOnly = () => {
    const fallback = selectedStore?.id ?? stores[0]?.id;
    if (fallback == null) return;
    setDraftManagedIds([fallback]);
  };

  const applyManaged = () => {
    const next = stores.filter((s) => draftManagedIds.includes(s.id));
    if (next.length === 0) return;
    onManagedStoresChange(next);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.floatingCloseRow} pointerEvents="box-none">
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.floatingCloseBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close Manage Orders"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Manage Orders</Text>
          </View>

          {/* Payouts / Transactions style segmented control */}
          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setTab("manage")}
              style={[styles.tabBtn, tab === "manage" && styles.tabBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "manage" }}
            >
              <Text style={[styles.tabBtnText, tab === "manage" && styles.tabBtnTextActive]}>
                Manage Order
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("switch")}
              style={[styles.tabBtn, tab === "switch" && styles.tabBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "switch" }}
            >
              <Text style={[styles.tabBtnText, tab === "switch" && styles.tabBtnTextActive]}>
                Switch Outlet
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHint}>
            {tab === "manage"
              ? "Tick one or more outlets to receive incoming orders on this device. You can select every linked store."
              : "Choose the active outlet for this device. Dashboard, menu, reports, and settings load for that outlet."}
          </Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={GatiMitraMerchant.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search restaurant name or ID"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {tab === "manage" && stores.length > 1 ? (
            <View style={styles.bulkRow}>
              <Pressable
                onPress={allSelected ? clearToActiveOnly : selectAllManaged}
                style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.bulkBtnText}>
                  {allSelected ? "Active outlet only" : "Select all stores"}
                </Text>
              </Pressable>
              <Text style={styles.bulkCount}>
                {draftManagedIds.length}/{stores.length} selected
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {filtered.map((store, index) => {
              const isActive = selectedStore?.id === store.id;
              const isOnline = isActive ? activeStoreOnline : false;
              const locality = localityFromAddress(store.full_address);
              const checked = draftManagedIds.includes(store.id);

              if (tab === "manage") {
                return (
                  <View key={store.id}>
                    {index > 0 ? <View style={styles.dashedRule} /> : null}
                    <Pressable
                      onPress={() => toggleManaged(store)}
                      style={({ pressed }) => [
                        styles.storeRow,
                        checked && styles.storeRowChecked,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${checked ? "Deselect" : "Select"} ${store.store_name}`}
                    >
                      <View
                        style={[styles.checkbox, checked && styles.checkboxChecked]}
                      >
                        {checked ? (
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        ) : null}
                      </View>
                      <View style={styles.storeMain}>
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.statusBadge,
                              isOnline ? styles.statusOnline : styles.statusOffline,
                            ]}
                          >
                            <View
                              style={[
                                styles.statusDot,
                                isOnline ? styles.dotOnline : styles.dotOffline,
                              ]}
                            />
                            <Text
                              style={[
                                styles.statusText,
                                isOnline
                                  ? styles.statusTextOnline
                                  : styles.statusTextOffline,
                              ]}
                            >
                              {isOnline ? "Online" : "Offline"}
                            </Text>
                          </View>
                          {isActive ? (
                            <View style={styles.activeBadge}>
                              <Text style={styles.activeBadgeText}>Active on this device</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.storeName} numberOfLines={2}>
                          {store.store_name}
                        </Text>
                        {locality ? (
                          <Text style={styles.storeLocality} numberOfLines={1}>
                            {locality}
                          </Text>
                        ) : null}
                        <Text style={styles.storeId} numberOfLines={1}>
                          ID: {store.store_id}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                );
              }

              return (
                <View key={store.id}>
                  {index > 0 ? <View style={styles.dashedRule} /> : null}
                  <Pressable
                    onPress={() => {
                      if (!isActive) onSwitchOutlet(store);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.storeRow,
                      isActive && styles.storeRowActive,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Switch to ${store.store_name}`}
                  >
                    <View style={styles.storeMain}>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            isOnline ? styles.statusOnline : styles.statusOffline,
                          ]}
                        >
                          <View
                            style={[
                              styles.statusDot,
                              isOnline ? styles.dotOnline : styles.dotOffline,
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              isOnline
                                ? styles.statusTextOnline
                                : styles.statusTextOffline,
                            ]}
                          >
                            {isOnline ? "Online" : "Offline"}
                          </Text>
                        </View>
                        {isActive ? (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>Active on this device</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.storeName} numberOfLines={2}>
                        {store.store_name}
                      </Text>
                      {locality ? (
                        <Text style={styles.storeLocality} numberOfLines={1}>
                          {locality}
                        </Text>
                      ) : null}
                      <Text style={styles.storeId} numberOfLines={1}>
                        ID: {store.store_id}
                      </Text>
                    </View>
                    <View style={[styles.radioOuter, isActive && styles.radioOuterChecked]}>
                      {isActive ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>No restaurants match your search.</Text>
            ) : null}
          </ScrollView>

          {tab === "manage" ? (
            <Pressable
              onPress={applyManaged}
              disabled={!draftDirty || draftManagedIds.length === 0}
              style={({ pressed }) => [
                styles.applyBtn,
                (!draftDirty || draftManagedIds.length === 0) && styles.applyBtnDisabled,
                pressed && draftDirty && draftManagedIds.length > 0 && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Apply store selection"
            >
              <Text style={styles.applyBtnText}>
                {draftManagedIds.length > 1
                  ? `Receive orders from ${draftManagedIds.length} outlets`
                  : "Receive orders from this outlet"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "90%",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  floatingCloseRow: {
    position: "absolute",
    top: -42,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  floatingCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#EFEFEF",
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  tabBtnTextActive: {
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "700",
  },
  sectionHint: {
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraMerchant.textSecondary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    marginBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    padding: 0,
  },
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bulkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  bulkBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  bulkCount: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  list: {
    maxHeight: 360,
    marginBottom: 8,
  },
  dashedRule: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    marginVertical: 4,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  storeRowActive: {
    backgroundColor: "#ECFDF5",
  },
  storeRowChecked: {
    backgroundColor: "#F0FDF4",
  },
  storeMain: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusOnline: {
    backgroundColor: "#ECFDF5",
  },
  statusOffline: {
    backgroundColor: "#F1F5F9",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOnline: {
    backgroundColor: "#10B981",
  },
  dotOffline: {
    backgroundColor: "#94A3B8",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusTextOnline: {
    color: "#047857",
  },
  statusTextOffline: {
    color: "#64748B",
  },
  activeBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
  },
  storeName: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  storeLocality: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  storeId: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.primary,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    backgroundColor: "#fff",
  },
  radioOuterChecked: {
    borderColor: GatiMitraMerchant.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GatiMitraMerchant.primary,
  },
  applyBtn: {
    marginTop: 4,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnDisabled: {
    backgroundColor: "#94A3B8",
    opacity: 0.7,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyText: {
    textAlign: "center",
    color: GatiMitraMerchant.textTertiary,
    paddingVertical: 24,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});
