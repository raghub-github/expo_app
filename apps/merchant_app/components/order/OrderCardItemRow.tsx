import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { LineItem } from "@/hooks/useOrders";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { lineItemHasCustomizations } from "@/lib/merchant-order-food-item-display";
import { formatMerchantRs, merchantFoodItemCatalogAndNet } from "@/lib/merchant-line-total";

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
  const { catalog, net, showStrike, offerBadge, offerKind } = merchantFoodItemCatalogAndNet(
    item as ApiFoodOrderItem
  );

  return (
    <Pressable
      onPress={onRowPress}
      style={({ pressed }) => [
        styles.row,
        expandable && styles.rowExpandable,
        pressed && styles.pressed,
      ]}
    >
      <ItemVegMark vegNonveg={item.vegNonveg ?? orderVeg} name={item.name} size={14} />
      <View style={styles.body}>
        {offerBadge ? (
          <View
            style={[
              styles.offerPill,
              offerKind === "bogo" ? styles.offerPillBogo : styles.offerPillBoost,
            ]}
          >
            <Text
              style={[
                styles.offerPillText,
                offerKind === "bogo" ? styles.offerPillTextBogo : null,
              ]}
              numberOfLines={1}
            >
              {offerBadge}
            </Text>
          </View>
        ) : null}
        <View style={styles.titleRow}>
          <Pressable onPress={onItemNamePress} hitSlop={4} style={styles.itemNamePress}>
            <Text style={styles.itemLabel}>
              {item.qty} x <Text style={styles.itemName}>{item.name}</Text>
            </Text>
          </Pressable>
          {hasCust ? (
            <View style={styles.custPill}>
              <Text style={styles.custPillText}>Customization added</Text>
            </View>
          ) : null}
        </View>
        {item.specialInstructions?.trim() ? (
          <Text style={styles.cookingNote} numberOfLines={2}>
            Cooking instructions: {item.specialInstructions.trim()}
          </Text>
        ) : null}
      </View>
      {expandable ? (
        <Ionicons name="chevron-down" size={18} color="#0F766E" style={styles.chevron} />
      ) : null}
      {showPrice ? (
        <View style={styles.priceCol}>
          {showStrike ? <Text style={styles.priceStrike}>{formatMerchantRs(catalog)}</Text> : null}
          <Text style={styles.price}>{formatMerchantRs(net)}</Text>
        </View>
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
  itemNamePress: {
    flexShrink: 1,
    minWidth: 0,
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
  cookingNote: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
    lineHeight: 15,
  },
  offerPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 2,
    maxWidth: "100%",
  },
  offerPillBoost: {
    backgroundColor: "#FFFBEB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FDE68A",
  },
  offerPillBogo: {
    backgroundColor: "#ECFDF5",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#A7F3D0",
  },
  offerPillText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#92400E",
  },
  offerPillTextBogo: {
    color: "#166534",
  },
  priceCol: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  priceStrike: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  price: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    fontVariant: ["tabular-nums"],
  },
});
