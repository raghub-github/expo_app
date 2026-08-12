import { useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChildStore } from "@/context/AuthContext";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  stores: ChildStore[];
  initialStoreId?: number | null;
  title?: string;
  proceedLabel?: string;
  showAllRestaurants?: boolean;
  onClose: () => void;
  onProceed: (store: ChildStore) => void;
  onPickAll?: () => void;
};

export function OfferStorePickSheet({
  visible,
  stores,
  initialStoreId,
  title = "Create offer for",
  proceedLabel = "Proceed",
  showAllRestaurants = false,
  onClose,
  onProceed,
  onPickAll,
}: Props) {
  const [pickedId, setPickedId] = useState<number | "all">(() => {
    if (initialStoreId == null && showAllRestaurants) return "all";
    return initialStoreId ?? stores[0]?.id ?? "all";
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => {
      const name = (s.store_name ?? "").toLowerCase();
      const id = (s.store_id ?? "").toLowerCase();
      const addr = (s.full_address ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || addr.includes(q);
    });
  }, [stores, search]);

  const picked = typeof pickedId === "number" ? stores.find((s) => s.id === pickedId) ?? stores[0] ?? null : null;

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="78%"
      footer={
        <Pressable
          onPress={() => {
            if (pickedId === "all") {
              onPickAll?.();
              onClose();
              return;
            }
            if (picked) onProceed(picked);
          }}
          disabled={pickedId === "all" ? !onPickAll : !picked}
          style={({ pressed }) => [
            styles.proceedBtn,
            (pickedId === "all" ? !onPickAll : !picked) && styles.proceedBtnDisabled,
            pressed && (pickedId === "all" ? onPickAll : picked) && { opacity: 0.92 },
          ]}
        >
          <Text style={styles.proceedText}>{proceedLabel}</Text>
        </Pressable>
      }
    >
      <Text style={styles.title}>{title}</Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search outlet name or ID"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {stores.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
          <Text style={styles.emptyText}>No outlets available.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showAllRestaurants ? (
            <Pressable
              onPress={() => setPickedId("all")}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
            >
              <View style={styles.rowText}>
                <Text style={styles.storeName}>All restaurants ({stores.length})</Text>
                <Text style={styles.storeMeta}>Combined performance & campaigns</Text>
              </View>
              <View style={[styles.radio, pickedId === "all" && styles.radioSelected]}>
                {pickedId === "all" ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          ) : null}
          {filtered.map((store, index) => {
            const selected = store.id === pickedId;
            const location = store.full_address?.trim() || "";
            return (
              <View key={store.id}>
                {index > 0 || showAllRestaurants ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => setPickedId(store.id)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.storeName} numberOfLines={2}>
                      {store.store_name ?? "Outlet"}
                    </Text>
                    {location ? (
                      <Text style={styles.storeMeta} numberOfLines={1}>
                        {location}
                      </Text>
                    ) : null}
                    <Text style={styles.storeId}>ID: {store.store_id}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
          {filtered.length === 0 ? (
            <Text style={styles.noMatch}>No outlets match your search.</Text>
          ) : null}
        </ScrollView>
      )}
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
    paddingHorizontal: H_PADDING,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: H_PADDING,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    padding: 0,
  },
  listScroll: { maxHeight: 340 },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowText: { flex: 1, minWidth: 0 },
  storeName: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  storeMeta: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 3,
  },
  storeId: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: GatiMitraMerchant.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GatiMitraMerchant.primary,
  },
  divider: {
    height: 1,
    borderStyle: "dashed",
    borderTopWidth: 1,
    borderColor: GatiMitraMerchant.divider,
  },
  noMatch: {
    textAlign: "center",
    color: GatiMitraMerchant.textTertiary,
    fontSize: 13,
    paddingVertical: 20,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 32,
  },
  emptyText: { fontSize: 13, color: GatiMitraMerchant.textTertiary },
  proceedBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
  },
  proceedBtnDisabled: { opacity: 0.45 },
  proceedText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
