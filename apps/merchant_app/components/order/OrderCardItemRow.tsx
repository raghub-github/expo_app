import { View, Text, StyleSheet, Pressable } from "react-native";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { LineItem } from "@/hooks/useOrders";
import { lineItemHasCustomizations } from "@/lib/merchant-order-food-item-display";

type Props = {
  item: LineItem;
  orderVeg?: string | null;
  onItemNamePress: () => void;
  onRowPress: () => void;
  showPrice?: boolean;
};

export function OrderCardItemRow({
  item,
  orderVeg,
  onItemNamePress,
  onRowPress,
  showPrice,
}: Props) {
  const hasCust = lineItemHasCustomizations(item);

  return (
    <Pressable
      onPress={onRowPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
      {showPrice ? <Text style={styles.price}>₹{item.price}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pressed: { opacity: 0.85 },
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
