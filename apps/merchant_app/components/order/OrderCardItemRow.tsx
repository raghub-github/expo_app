import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { LineItem } from "@/hooks/useOrders";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { lineItemHasCustomizations, resolveLineItemCookingNote } from "@/lib/merchant-order-food-item-display";
import { formatMerchantRs, merchantFoodItemCatalogAndNet } from "@/lib/merchant-line-total";

type Props = {
  item: LineItem;
  orderVeg?: string | null;
  onItemNamePress: () => void;
  onRowPress: () => void;
  showPrice?: boolean;
  /** Incoming-order table presentation: Item | QTY | Amount. */
  showQuantityColumn?: boolean;
  /** Chevron when item has customizations (expandable row). */
  showExpandChevron?: boolean;
  /** Tighter padding for compact sheets (incoming order). */
  dense?: boolean;
};

export function OrderCardItemRow({
  item,
  orderVeg,
  onItemNamePress,
  onRowPress,
  showPrice,
  showQuantityColumn = false,
  showExpandChevron = false,
  dense = false,
}: Props) {
  const hasCust = lineItemHasCustomizations(item);
  const cookingNote = resolveLineItemCookingNote(item);
  const expandable = showExpandChevron && (hasCust || !!cookingNote);
  const { catalog, net, showStrike, offerBadge, offerKind } = merchantFoodItemCatalogAndNet(
    item as ApiFoodOrderItem
  );

  return (
    <Pressable
      onPress={onRowPress}
      style={({ pressed }) => [
        styles.row,
        dense && styles.rowDense,
        expandable && styles.rowExpandable,
        pressed && styles.pressed,
      ]}
    >
      <ItemVegMark vegNonveg={item.vegNonveg ?? orderVeg} name={item.name} size={dense ? 15 : 14} />
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
            <Text style={[styles.itemLabel, dense && styles.itemLabelDense]}>
              {showQuantityColumn ? null : `${item.qty} x `}
              <Text style={styles.itemName}>{item.name}</Text>
            </Text>
          </Pressable>
          {hasCust ? (
            <View style={styles.custPill}>
              <Text style={styles.custPillText}>Customization added</Text>
            </View>
          ) : null}
        </View>
        {cookingNote ? (
          <Text style={styles.cookingNote} numberOfLines={dense ? 1 : 3}>
            Cooking: {cookingNote}
          </Text>
        ) : null}
      </View>
      {expandable ? (
        <Ionicons name="chevron-down" size={dense ? 16 : 18} color="#0F766E" style={styles.chevron} />
      ) : null}
      {showQuantityColumn ? (
        <View style={styles.qtyCol}>
          <View style={[styles.qtyCell, dense && styles.qtyCellDense]}>
            <Text style={[styles.qtyText, dense && styles.qtyTextDense]}>{item.qty}</Text>
          </View>
        </View>
      ) : null}
      {showPrice ? (
        <View style={[styles.priceCol, showQuantityColumn && styles.amountCol]}>
          {showStrike ? <Text style={styles.priceStrike}>{formatMerchantRs(catalog)}</Text> : null}
          <Text style={[styles.price, dense && styles.priceDense]}>{formatMerchantRs(net)}</Text>
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
  rowDense: {
    gap: 6,
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
  itemLabelDense: {
    fontSize: 12,
    paddingBottom: 0,
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
  qtyCol: {
    width: 38,
    flexShrink: 0,
    alignItems: "center",
  },
  qtyCell: {
    minWidth: 30,
    height: 28,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "#D7DCE2",
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyCellDense: {
    height: 22,
    minWidth: 26,
    paddingHorizontal: 4,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    fontVariant: ["tabular-nums"],
  },
  qtyTextDense: {
    fontSize: 12,
  },
  amountCol: {
    width: 65,
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
  priceDense: {
    fontSize: 12,
  },
});
