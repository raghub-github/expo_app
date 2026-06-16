import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { LineItem } from "@/hooks/useOrders";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { lineItemHasCustomizations } from "@/lib/merchant-order-food-item-display";
import { formatMerchantRs, merchantLineTotalForFoodItem } from "@/lib/merchant-line-total";

type Props = {
  item: LineItem;
  orderVeg?: string | null;
  onItemNamePress: () => void;
  onRowPress: () => void;
  showPrice?: boolean;
  /** Chevron when item has customizations (expandable row). */
  showExpandChevron?: boolean;
};

export function OrderCardItemRow({
  item,
  orderVeg,
  onItemNamePress,
  onRowPress,
  showPrice,
  showExpandChevron = false,
}: Props) {
  const hasCust = lineItemHasCustomizations(item);
  const expandable = showExpandChevron && hasCust;

  return (
    <Pressable
      onPress={expandable ? onRowPress : undefined}
      disabled={!expandable}
      style={({ pressed }) => [
        styles.row,
        expandable && styles.rowExpandable,
        expandable && pressed && styles.pressed,
      ]}
    >
      <ItemVegMark vegNonveg={item.vegNonveg ?? orderVeg} name={item.name} size={14} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.itemLabel} onPress={onItemNamePress} suppressHighlighting={false}>
            {item.qty} x{" "}
            <Text style={styles.itemName}>{item.name}</Text>
          </Text>
          {hasCust ? (
            <View style={styles.custPill}>
              <Text style={styles.custPillText}>Customization added</Text>
            </View>
          ) : null}
        </View>
      </View>
      {expandable ? (
        <Ionicons name="chevron-down" size={18} color="#0F766E" style={styles.chevron} />
      ) : null}
      {showPrice ? (
        <Text style={styles.price}>
          {formatMerchantRs(merchantLineTotalForFoodItem(item as ApiFoodOrderItem))}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowExpandable: {
    paddingVertical: 2,
  },
  pressed: { opacity: 0.85 },
  chevron: {
    flexShrink: 0,
    marginLeft: -2,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  itemLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    borderStyle: "dashed",
    paddingBottom: 2,
  },
  itemName: {
    fontWeight: "700",
  },
  custPill: {
    flexShrink: 0,
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  custPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.2,
  },
  price: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    fontVariant: ["tabular-nums"],
  },
});
