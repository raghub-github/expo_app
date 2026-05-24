import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import {
  OrderItemPriceBreakdownModal,
  itemHasBreakdown,
} from "@/components/order/OrderItemPriceBreakdownModal";
import { GatiMitraMerchant, CARD_PADDING, CARD_RADIUS, FONT_LABEL } from "@/constants/theme";
import { merchantLineTotalForFoodItem } from "@/lib/merchant-line-total";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";

function VegNonVegMark({ vegNonveg }: { vegNonveg?: string | null }) {
  const t = (vegNonveg ?? "").toLowerCase();
  const isVeg = t.includes("veg") && !t.includes("non");
  const isNonVeg = t.includes("non") || t === "non_veg" || t === "nonveg";

  if (!isVeg && !isNonVeg) {
    return <View style={[styles.vegBox, styles.vegNeutral]} />;
  }

  return (
    <View style={[styles.vegBox, isVeg ? styles.vegGreen : styles.vegBrown]}>
      <View style={[styles.vegDot, isVeg ? styles.vegDotGreen : styles.vegDotBrown]} />
    </View>
  );
}

function formatRs(amount: number): string {
  return `₹${Math.round(Number(amount) || 0)}`;
}

type Props = {
  order: ApiFoodOrder;
};

export function OrderItemDetails({ order }: Props) {
  const items = order.items ?? [];
  const [breakdownItem, setBreakdownItem] = useState<ApiFoodOrderItem | null>(null);

  return (
    <View style={styles.section}>
      {order.requires_utensils ? (
        <View style={styles.utensilsBanner}>
          <Ionicons name="restaurant" size={20} color="#059669" />
          <View style={styles.utensilsTextWrap}>
            <Text style={styles.utensilsTitle}>Cutlery & utensils will be sent</Text>
            <Text style={styles.utensilsSub}>We care for your convenience and hygiene.</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionHeading}>
        ORDER ITEMS ({items.length})
      </Text>

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

            return (
              <View
                key={`${item.name}-${i}`}
                style={[styles.itemCard, i < items.length - 1 && styles.itemCardBorder]}
              >
                <View style={styles.itemHeader}>
                  <VegNonVegMark vegNonveg={item.veg_nonveg} />
                  <View style={styles.itemTitleWrap}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {qty} × {item.name}
                    </Text>
                    {variantLabel ? (
                      <View style={styles.variantBadge}>
                        <Text style={styles.variantBadgeText}>{variantLabel}</Text>
                      </View>
                    ) : null}
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
                </View>

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

                {item.category_name ? (
                  <>
                    <View style={styles.itemDivider} />
                    <Text style={styles.categoryText}>
                      Category: {item.category_name}
                    </Text>
                  </>
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
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 14,
  },
  utensilsBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: CARD_PADDING,
    marginBottom: 14,
  },
  utensilsTextWrap: {
    flex: 1,
  },
  utensilsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#047857",
    marginBottom: 2,
  },
  utensilsSub: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 10,
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
  itemTitleWrap: {
    flex: 1,
    minWidth: 0,
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
    marginLeft: 24,
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
  itemDivider: {
    marginTop: 10,
    marginBottom: 6,
    borderStyle: "dashed",
    borderTopWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  categoryText: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  vegBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  vegNeutral: {
    borderColor: GatiMitraMerchant.border,
  },
  vegGreen: {
    borderColor: "#16A34A",
  },
  vegBrown: {
    borderColor: "#92400E",
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vegDotGreen: {
    backgroundColor: "#16A34A",
  },
  vegDotBrown: {
    backgroundColor: "#92400E",
  },
});
