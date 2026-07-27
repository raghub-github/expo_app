/**
 * Filter-by sheet for Restaurant status — white theme, Lora/Poppins via AppText.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import {
  GatiMitraMerchant,
  FONT_LORA,
  FONT_LORA_BOLD,
  FONT_POPPINS,
} from "@/constants/theme";
import {
  RESTAURANT_STATUS_FILTERS,
  type RestaurantStatusFilterId,
} from "@/lib/restaurantStatusFilters";

type Props = {
  visible: boolean;
  value: RestaurantStatusFilterId | null;
  counts: Partial<Record<RestaurantStatusFilterId, number>>;
  onClose: () => void;
  onApply: (next: RestaurantStatusFilterId | null) => void;
};

export function RestaurantStatusFilterSheet({
  visible,
  value,
  counts,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<RestaurantStatusFilterId | null>(value);

  const sync = useCallback(() => setDraft(value), [value]);
  useEffect(() => {
    if (visible) sync();
  }, [visible, sync]);

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="72%"
      footer={
        <View style={styles.footer}>
          <Pressable
            onPress={() => setDraft(null)}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Apply filter"
          >
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.title}>Filter by</Text>
        {RESTAURANT_STATUS_FILTERS.map((opt) => {
          const selected = draft === opt.id;
          const count = counts[opt.id] ?? 0;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setDraft(selected ? null : opt.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              <Text style={styles.rowLabel}>
                {opt.label}{" "}
                <Text style={styles.rowCount}>({count})</Text>
              </Text>
              <View style={[styles.checkOuter, selected && styles.checkOuterOn]}>
                {selected ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 18,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  rowLabel: {
    fontFamily: FONT_LORA,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
    paddingRight: 12,
  },
  rowCount: {
    fontFamily: FONT_POPPINS,
    color: GatiMitraMerchant.textSecondary,
  },
  checkOuter: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkOuterOn: {
    backgroundColor: GatiMitraMerchant.navy,
    borderColor: GatiMitraMerchant.navy,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  clearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  clearText: {
    fontFamily: FONT_LORA,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
  },
  applyBtn: {
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    minWidth: 120,
    alignItems: "center",
  },
  applyText: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 15,
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.88 },
});
