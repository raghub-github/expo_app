import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import type { LineItem } from "@/hooks/useOrders";
import type { RejectPickItem } from "@/lib/rejectOrderPickItems";

type Row = {
  key: string;
  name: string;
  quantity: number;
  menuItemId: number | null;
  pickable: boolean;
};

function buildRows(items: LineItem[]): Row[] {
  const rows: Row[] = [];
  const seenIds = new Set<number>();
  let idx = 0;
  for (const it of items) {
    const name = String(it.name ?? "Item").trim() || "Item";
    const quantity = Math.max(1, Number(it.qty) || 1);
    const id = it.menuItemId;
    if (id != null && Number.isFinite(Number(id))) {
      const menuItemId = Number(id);
      if (seenIds.has(menuItemId)) continue;
      seenIds.add(menuItemId);
      rows.push({ key: `id-${menuItemId}`, name, quantity, menuItemId, pickable: true });
    } else {
      rows.push({ key: `row-${idx++}`, name, quantity, menuItemId: null, pickable: false });
    }
  }
  return rows;
}

export function RejectOrderItemsPickSheet({
  visible,
  lineItems,
  onClose,
  onContinue,
}: {
  visible: boolean;
  lineItems: LineItem[];
  onClose: () => void;
  onContinue: (selected: RejectPickItem[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const rows = useMemo(() => buildRows(lineItems), [lineItems]);
  const pickableRows = rows.filter((r) => r.pickable);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!visible) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set());
  }, [visible, lineItems]);

  const toggle = (menuItemId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuItemId)) next.delete(menuItemId);
      else next.add(menuItemId);
      return next;
    });
  };

  const allPickableSelected =
    pickableRows.length > 0 &&
    pickableRows.every((r) => r.menuItemId != null && selectedIds.has(r.menuItemId));

  const toggleSelectAll = () => {
    if (allPickableSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pickableRows.map((r) => r.menuItemId!)));
  };

  const handleContinue = () => {
    const selected: RejectPickItem[] = pickableRows
      .filter((r) => r.menuItemId != null && selectedIds.has(r.menuItemId))
      .map((r) => ({
        menuItemId: r.menuItemId!,
        name: r.name,
        quantity: r.quantity,
      }));
    onContinue(selected);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Which items are out of stock?</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Select items from this order to mark unavailable.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {rows.length === 0 ? (
              <Text style={styles.empty}>No line items found on this order.</Text>
            ) : (
              <View style={styles.listCard}>
                {pickableRows.length > 0 ? (
                  <Pressable
                    onPress={toggleSelectAll}
                    style={[styles.row, styles.selectAllRow, allPickableSelected && styles.rowActive]}
                  >
                    <Ionicons
                      name={allPickableSelected ? "checkbox" : "square-outline"}
                      size={22}
                      color={GatiMitraMerchant.primary}
                    />
                    <Text style={styles.selectAllLabel}>Select all</Text>
                  </Pressable>
                ) : null}
                {rows.map((row, index) => {
                  const checked = row.menuItemId != null && selectedIds.has(row.menuItemId);
                  return (
                    <Pressable
                      key={row.key}
                      disabled={!row.pickable}
                      onPress={() => row.menuItemId != null && toggle(row.menuItemId)}
                      style={[
                        styles.row,
                        index > 0 || pickableRows.length > 0 ? styles.rowDivider : null,
                        !row.pickable && styles.rowDisabled,
                        checked && styles.rowActive,
                      ]}
                    >
                      <Ionicons
                        name={checked ? "checkbox" : "square-outline"}
                        size={22}
                        color={row.pickable ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
                      />
                      <View style={styles.rowText}>
                        <Text style={styles.rowName}>
                          {row.quantity > 1 ? `${row.quantity} × ` : ""}
                          {row.name}
                        </Text>
                        {!row.pickable ? (
                          <Text style={styles.rowHint}>Cannot mark unavailable — menu link missing</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.skipBtn}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>
            <Pressable
              onPress={handleContinue}
              disabled={pickableRows.length > 0 && selectedIds.size === 0}
              style={[
                styles.continueBtn,
                pickableRows.length > 0 && selectedIds.size === 0 && styles.continueBtnDisabled,
              ]}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: H_PADDING,
    maxHeight: "85%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerText: { flex: 1, paddingRight: 8 },
  title: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  subtitle: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  list: { maxHeight: 320, marginBottom: 12 },
  listCard: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  empty: { fontSize: 14, color: GatiMitraMerchant.textSecondary, paddingVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  selectAllRow: { backgroundColor: "#F9FAFB" },
  selectAllLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  rowDivider: { borderTopWidth: 1, borderTopColor: GatiMitraMerchant.border },
  rowActive: { borderColor: GatiMitraMerchant.primary, backgroundColor: "#F8FAFF" },
  rowDisabled: { opacity: 0.55 },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  rowHint: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  footer: { flexDirection: "row", gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: GatiMitraMerchant.border },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
  },
  skipBtnText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  continueBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
  },
  continueBtnDisabled: { opacity: 0.45 },
  continueBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
