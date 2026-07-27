/**
 * Bottom sheet — "Manage orders from" store picker (lite theme).
 * Multi-select checkboxes + confirm; primary selection switches active store.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { Modal, View, Pressable, TextInput, ScrollView, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ChildStore } from "@/context/AuthContext";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  stores: ChildStore[];
  selectedStore: ChildStore | null;
  /** Currently confirmed multi-store selection. */
  managedStores: ChildStore[];
  /** Online/offline for the currently active store only. */
  activeStoreOnline: boolean;
  onClose: () => void;
  /** Called when user confirms 2+ restaurants. */
  onConfirm: (selected: ChildStore[]) => void;
  /** Called when sheet closes with exactly one restaurant checked. */
  onSingleStoreSelected: (store: ChildStore) => void;
};

function localityFromAddress(fullAddress: string | null | undefined): string {
  if (!fullAddress?.trim()) return "";
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? fullAddress.trim();
}

function SheetCheckbox({
  checked,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.checkboxOuter, checked && styles.checkboxOuterChecked, pressed && styles.pressed]}
    >
      {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
    </Pressable>
  );
}

export function ManageOrdersStoresSheet({
  visible,
  stores,
  selectedStore,
  managedStores,
  activeStoreOnline,
  onClose,
  onConfirm,
  onSingleStoreSelected,
}: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDialogVisible, setConfirmDialogVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setConfirmDialogVisible(false);
      return;
    }
    setSearch("");
    const initial = new Set<number>();
    const source = managedStores.length > 0 ? managedStores : selectedStore ? [selectedStore] : stores;
    source.forEach((s) => initial.add(s.id));
    if (initial.size === 0 && stores.length > 0) initial.add(stores[0].id);
    setSelectedIds(initial);
  }, [visible, selectedStore?.id, managedStores, stores]);

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

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = stores.filter((s) => selectedIds.has(s.id)).length;
  const showConfirmButton = selectedCount > 1;
  const confirmLabel = `Confirm (${selectedCount} restaurants)`;

  const handleClose = () => {
    const selected = stores.filter((s) => selectedIds.has(s.id));
    if (selected.length === 1) {
      onSingleStoreSelected(selected[0]);
    }
    onClose();
  };

  const handleConfirmPress = () => {
    if (selectedCount <= 1) return;
    setConfirmDialogVisible(true);
  };

  const handleConfirmDialog = () => {
    const selected = stores.filter((s) => selectedIds.has(s.id));
    if (selected.length <= 1) return;
    setConfirmDialogVisible(false);
    onConfirm(selected);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Manage orders from</Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

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

          <Pressable
            onPress={toggleAll}
            style={({ pressed }) => [styles.selectAllRow, pressed && styles.pressed]}
          >
            <Text style={styles.selectAllLabel}>
              All Restaurants ({stores.length})
            </Text>
            <SheetCheckbox
              checked={allFilteredSelected && filtered.length > 0}
              onPress={toggleAll}
              accessibilityLabel="Select all restaurants"
            />
          </Pressable>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {filtered.map((store, index) => {
              const isActive = selectedStore?.id === store.id;
              const isOnline = isActive ? activeStoreOnline : false;
              const locality = localityFromAddress(store.full_address);
              const checked = selectedIds.has(store.id);
              return (
                <View key={store.id}>
                  {index > 0 ? <View style={styles.dashedRule} /> : null}
                  <Pressable
                    onPress={() => toggleOne(store.id)}
                    style={({ pressed }) => [styles.storeRow, pressed && styles.pressed]}
                  >
                    <View style={styles.storeMain}>
                      <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
                        <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
                        <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextOffline]}>
                          {isOnline ? "Online" : "Offline"}
                        </Text>
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
                    <SheetCheckbox
                      checked={checked}
                      onPress={() => toggleOne(store.id)}
                      accessibilityLabel={`Select ${store.store_name}`}
                    />
                  </Pressable>
                </View>
              );
            })}
            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>No restaurants match your search.</Text>
            ) : null}
          </ScrollView>

          {showConfirmButton ? (
            <Pressable
              onPress={handleConfirmPress}
              style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}
            >
              <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
            </Pressable>
          ) : null}
        </View>

        {confirmDialogVisible ? (
          <View style={styles.confirmOverlay}>
            <Pressable
              style={styles.confirmBackdrop}
              onPress={() => setConfirmDialogVisible(false)}
              accessibilityLabel="Cancel"
            />
            <View style={styles.confirmCard}>
              <View style={styles.confirmIconWrap}>
                <Ionicons name="sync" size={28} color={GatiMitraMerchant.primary} />
              </View>
              <Text style={styles.confirmCardTitle}>{confirmLabel}</Text>
              <Text style={styles.confirmCardBody}>
                {`After you confirm, new orders from all ${selectedCount} selected restaurants will land on this same orders board. Each incoming order will show the store locality so you know which outlet it belongs to.`}
              </Text>
              <Pressable
                onPress={handleConfirmDialog}
                style={({ pressed }) => [styles.confirmCardPrimaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.confirmCardPrimaryText}>Confirm</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmDialogVisible(false)}
                style={({ pressed }) => [styles.confirmCardCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.confirmCardCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
    maxHeight: "88%",
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
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
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
    marginBottom: 16,
    backgroundColor: "#FAFAFA",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    padding: 0,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  selectAllLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  list: {
    maxHeight: 340,
    marginBottom: 16,
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
  },
  storeMain: {
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
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
  checkboxOuter: {
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
  checkboxOuterChecked: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  confirmBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
    zIndex: 1,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  confirmCardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  confirmCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  confirmCardPrimaryBtn: {
    width: "100%",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmCardPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  confirmCardCancelBtn: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  confirmCardCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
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
