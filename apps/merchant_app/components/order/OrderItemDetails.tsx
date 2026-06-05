import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
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
import { merchantLineTotalForFoodItem } from "@/lib/merchant-line-total";
import {
  foodOrderAddonRows,
  foodOrderHasCustomizations,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";

function formatRs(amount: number): string {
  return `₹${Math.round(Number(amount) || 0)}`;
}

type Props = {
  order: ApiFoodOrder;
};

function foodItemToLineItem(item: ApiFoodOrderItem): LineItem {
  return {
    qty: Math.max(1, item.qty || 1),
    name: item.name,
    price: merchantLineTotalForFoodItem(item),
    menuItemId:
      item.menu_item_id != null && Number.isFinite(Number(item.menu_item_id))
        ? Number(item.menu_item_id)
        : null,
    vegNonveg: item.veg_nonveg ?? null,
  };
}

export function OrderItemDetails({ order }: Props) {
  const items = order.items ?? [];
  const [breakdownItem, setBreakdownItem] = useState<ApiFoodOrderItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<LineItem | null>(null);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name="bag-handle-outline" size={18} color="#444444" />
        <Text style={styles.sectionHeading}>Order items</Text>
        <Text style={styles.sectionMeta}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </Text>
      </View>

      <View style={styles.itemsCard}>
        {items.length === 0 ? (
          <Text style={styles.empty}>No items listed.</Text>
        ) : (
          items.map((item, i) => {
            const qty = Math.max(1, item.qty || 1);
            const clickable = itemHasBreakdown(item);
            const variantLabel = foodOrderVariantLabel(item);
            const custRows = foodOrderAddonRows(item);
            const showCust = custRows.length > 0;
            const hasCustomizations = foodOrderHasCustomizations(item);

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
                      {qty} × {item.name}
                    </Text>
                    <View style={styles.tagRow}>
                      {variantLabel ? (
                        <View style={styles.variantBadge}>
                          <Text style={styles.variantBadgeText}>{variantLabel}</Text>
                        </View>
                      ) : null}
                      {hasCustomizations ? (
                        <View style={styles.customizedTag}>
                          <Text style={styles.customizedTagText}>Customized</Text>
                        </View>
                      ) : null}
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
                      <Text style={styles.itemPriceClickable}>
                        {formatRs(merchantLineTotalForFoodItem(item))}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color="#2563EB" />
                    </Pressable>
                  ) : (
                    <Text style={styles.itemPrice}>
                      {formatRs(merchantLineTotalForFoodItem(item))}
                    </Text>
                  )}
                </Pressable>

                {showCust ? (
                  <View style={styles.custSection}>
                    <Text style={styles.custHeading}>Customizations</Text>
                    {custRows.map((row, j) => (
                      <View key={j} style={styles.custRow}>
                        <Text style={styles.custBullet}>•</Text>
                        <Text style={styles.custLabel} numberOfLines={2}>
                          {row.label}
                        </Text>
                        {row.amount != null ? (
                          <Text style={styles.custAmount}>{formatRs(row.amount)}</Text>
                        ) : (
                          <Text style={styles.custDash}>—</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
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
    marginTop: 14,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionHeading: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  itemsCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
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
    alignItems: "flex-start",
    gap: 10,
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
  customizedTag: {
    alignSelf: "flex-start",
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#99F6E4",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customizedTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.3,
    textTransform: "uppercase",
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
  itemPrice: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  pricePressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 2,
    paddingLeft: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: "#2563EB",
  },
  pricePressed: {
    opacity: 0.7,
  },
  itemPriceClickable: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: "#2563EB",
    fontVariant: ["tabular-nums"],
  },
  custSection: {
    marginTop: 10,
    marginLeft: 26,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#5EEAD4",
  },
  custHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
    marginBottom: 6,
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
