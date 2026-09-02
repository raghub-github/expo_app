import { useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import {
  OrderItemPriceBreakdownModal,
  itemHasBreakdown,
} from "@/components/order/OrderItemPriceBreakdownModal";
import { OrderItemDetailsSheet } from "@/components/order/OrderItemDetailsSheet";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import type { LineItem } from "@/hooks/useOrders";
import { GatiMitraMerchant, CARD_PADDING, CARD_RADIUS, FONT_LABEL } from "@/constants/theme";
import { merchantLineTotalForFoodItem, formatMerchantRs } from "@/lib/merchant-line-total";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
  resolveLineItemCookingNote,
} from "@/lib/merchant-order-food-item-display";
import { resolveLineItemMenuPk } from "@/lib/resolveLineItemMenuPk";

type Props = {
  order: ApiFoodOrder;
};

function foodItemToLineItem(item: ApiFoodOrderItem): LineItem {
  return {
    qty: Math.max(1, item.qty || 1),
    name: item.name,
    price: merchantLineTotalForFoodItem(item),
    menuItemId: resolveLineItemMenuPk(item),
    vegNonveg: item.veg_nonveg ?? null,
  };
}

export function OrderItemDetails({ order }: Props) {
  const items = order.items ?? [];
  const [breakdownItem, setBreakdownItem] = useState<ApiFoodOrderItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<LineItem | null>(null);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Item details</Text>

      <View style={styles.itemsCard}>
        {items.length === 0 ? (
          <Text style={styles.empty}>No items listed.</Text>
        ) : (
          <>
            <View style={styles.columnsHeader}>
              <Text style={styles.itemNameHeader}>Items to be packed</Text>
              <Text style={styles.qtyHeader}>QTY</Text>
              <Text style={styles.amountHeader}>Amount</Text>
            </View>
            {items.map((item, i) => {
              const qty = Math.max(1, item.qty || 1);
              const clickable = itemHasBreakdown(item);
              const variantLabel = foodOrderVariantLabel(item);
              const custRows = foodOrderAddonRows(item);
              const cookingNote = resolveLineItemCookingNote(item);
              const showCust = custRows.length > 0 || Boolean(cookingNote);
              const lineAmount = merchantLineTotalForFoodItem(item);

              return (
                <View
                  key={`${item.name}-${i}`}
                  style={[styles.itemCard, i < items.length - 1 && styles.itemCardBorder]}
                >
                  <Pressable
                    onPress={() => setDetailsItem(foodItemToLineItem(item))}
                    style={({ pressed }) => [styles.itemHeader, pressed && styles.itemHeaderPressed]}
                  >
                    <ItemVegMark
                      vegNonveg={item.veg_nonveg ?? order.veg_non_veg}
                      name={item.name}
                      size={16}
                    />
                    <View style={styles.itemTitleWrap}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {variantLabel ? (
                        <View style={styles.tagRow}>
                          <View style={styles.variantBadge}>
                            <Text style={styles.variantBadgeText}>{variantLabel}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.qtyCol}>
                      <View style={styles.qtyCell}>
                        <Text style={styles.qtyText}>{qty}</Text>
                      </View>
                    </View>
                    {clickable ? (
                      <Pressable
                        onPress={() => setBreakdownItem(item)}
                        style={({ pressed }) => [
                          styles.pricePressable,
                          pressed && styles.pricePressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`View price breakdown for ${item.name}`}
                      >
                        <Text style={styles.itemPriceClickable}>{formatMerchantRs(lineAmount)}</Text>
                        <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                      </Pressable>
                    ) : (
                      <Text style={styles.itemPrice}>{formatMerchantRs(lineAmount)}</Text>
                    )}
                  </Pressable>

                  {showCust ? (
                    <View style={styles.custSection}>
                      {cookingNote ? (
                        <Text style={styles.cookingNote} numberOfLines={3}>
                          {cookingNote}
                        </Text>
                      ) : null}
                      {custRows.map((row, j) => (
                        <View key={j} style={styles.custRow}>
                          <Text style={styles.custBullet}>•</Text>
                          <Text style={styles.custLabel} numberOfLines={2}>
                            {row.label}
                          </Text>
                          {row.amount != null ? (
                            <Text style={styles.custAmount}>{formatMerchantRs(row.amount)}</Text>
                          ) : (
                            <Text style={styles.custDash}>—</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </View>

      <OrderItemPriceBreakdownModal
        visible={breakdownItem != null}
        item={breakdownItem}
        onClose={() => setBreakdownItem(null)}
      />

      <OrderItemDetailsSheet
        visible={detailsItem != null}
        lineItem={detailsItem}
        onClose={() => setDetailsItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  itemsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  columnsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
    backgroundColor: "#F8FAFC",
  },
  itemNameHeader: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  qtyHeader: {
    width: 46,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  amountHeader: {
    width: 72,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  empty: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    padding: CARD_PADDING,
  },
  itemCard: {
    padding: CARD_PADDING,
  },
  itemCardBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemHeaderPressed: {
    opacity: 0.85,
  },
  itemTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  variantBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#047857",
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
  qtyText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  itemPrice: {
    width: 65,
    textAlign: "right",
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  pricePressable: {
    width: 65,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingVertical: 2,
  },
  pricePressed: {
    opacity: 0.7,
  },
  itemPriceClickable: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  custSection: {
    marginTop: 10,
    marginLeft: 26,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#E5E7EB",
  },
  cookingNote: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
    fontStyle: "italic",
  },
  custRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  custBullet: {
    fontSize: 12,
    color: "#0D9488",
    lineHeight: 18,
  },
  custLabel: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  custAmount: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  custDash: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
});
