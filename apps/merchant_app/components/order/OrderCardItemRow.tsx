import { useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import Svg, { Line } from "react-native-svg";
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
  /** 1-based line index shown as "1." before the item (order cards / modal). */
  index?: number | null;
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
  index = null,
}: Props) {
  const hasCust = lineItemHasCustomizations(item);
  const cookingNote = resolveLineItemCookingNote(item);
  const expandable = showExpandChevron && (hasCust || !!cookingNote);
  const { catalog, net, showStrike, offerBadge, offerKind } = merchantFoodItemCatalogAndNet(
    item as ApiFoodOrderItem
  );
  const nth =
    index != null && Number.isFinite(index) && index > 0 ? Math.floor(index) : null;
  const [nameWidth, setNameWidth] = useState(0);

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
      {nth != null ? (
        <Text style={[styles.nthLabel, dense && styles.nthLabelDense]} maxFontSizeMultiplier={1.2}>
          {nth}.
        </Text>
      ) : null}
      <ItemVegMark
        vegNonveg={item.vegNonveg ?? (orderVeg && !/^mixed$/i.test(String(orderVeg)) ? orderVeg : null)}
        name={item.name}
        size={dense ? 16 : 15}
      />
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
            {/* SVG dashed rule = exact name width; avoids Android dashed-border crash */}
            <View style={styles.itemNameWrap}>
              <Text
                style={[styles.itemLabel, dense && styles.itemLabelDense]}
                numberOfLines={2}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.3}
                onLayout={(e) => {
                  const w = Math.ceil(e.nativeEvent.layout.width);
                  if (w > 0 && w !== nameWidth) setNameWidth(w);
                }}
              >
                {showQuantityColumn ? null : (
                  <Text style={styles.qtyPrefix} maxFontSizeMultiplier={1.3}>
                    {`${item.qty} x `}
                  </Text>
                )}
                <Text style={[styles.itemName, dense && styles.itemLabelDense]} maxFontSizeMultiplier={1.3}>
                  {item.name}
                </Text>
              </Text>
              {nameWidth > 0 ? (
                <Svg width={nameWidth} height={2} style={styles.itemNameDash}>
                  <Line
                    x1={0}
                    y1={1}
                    x2={nameWidth}
                    y2={1}
                    stroke="#94A3B8"
                    strokeWidth={1.25}
                    strokeDasharray="3.5 3"
                    strokeLinecap="butt"
                  />
                </Svg>
              ) : null}
            </View>
          </Pressable>
          {hasCust ? (
            <View style={styles.custPill}>
              <Text style={styles.custPillText} maxFontSizeMultiplier={1.2}>
                Customization added
              </Text>
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
  nthLabel: {
    minWidth: 18,
    fontSize: 13,
    fontWeight: "800",
    color: "#64748B",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  nthLabelDense: {
    minWidth: 16,
    fontSize: 12,
  },
  chevron: {
    flexShrink: 0,
    marginLeft: -2,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
  },
  itemNameWrap: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  itemNameDash: {
    marginTop: 1,
  },
  itemLabel: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    fontSize: 14.5,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  itemLabelDense: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemNamePress: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  itemName: {
    fontWeight: "800",
    fontSize: 14.5,
  },
  qtyPrefix: {
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
  /** Keep in sync with IncomingOrderModal / AllItemsSheet headers. */
  qtyCol: {
    width: 48,
    minWidth: 48,
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
    height: 26,
    minWidth: 28,
    paddingHorizontal: 5,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1A1A1A",
    fontVariant: ["tabular-nums"],
  },
  qtyTextDense: {
    fontSize: 12.5,
    fontWeight: "800",
  },
  amountCol: {
    width: 72,
    minWidth: 72,
    flexShrink: 0,
  },
  priceStrike: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  price: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1A1A1A",
    fontVariant: ["tabular-nums"],
  },
  priceDense: {
    fontSize: 13.5,
    fontWeight: "800",
  },
});
