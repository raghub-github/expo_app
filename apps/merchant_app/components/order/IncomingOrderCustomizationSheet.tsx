import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import type { LineItem } from "@/hooks/useOrders";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";
import { merchantLineTotalForFoodItem, formatMerchantRs } from "@/lib/merchant-line-total";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";

function lineItemToApiItem(item: LineItem): ApiFoodOrderItem {
  return {
    qty: item.qty,
    name: item.name,
    price: item.price,
    menu_item_id: item.menuItemId,
    veg_nonveg: item.vegNonveg,
    customizations: item.customizations,
    variant_tag: item.variant_tag,
    customization_lines: item.customization_lines,
    base_amount: item.base_amount,
    customizations_total: item.customizations_total,
    captured_base_amount: item.captured_base_amount,
    captured_addon_amount: item.captured_addon_amount,
    has_customizations: item.has_customizations,
  };
}

type Props = {
  visible: boolean;
  item: LineItem | null;
  orderVeg?: string | null;
  onClose: () => void;
};

export function IncomingOrderCustomizationSheet({
  visible,
  item,
  orderVeg,
  onClose,
}: Props) {
  if (!item) return null;

  const apiItem = lineItemToApiItem(item);
  const qty = Math.max(1, item.qty || 1);
  const variantLabel = foodOrderVariantLabel(apiItem);
  const addonRows = foodOrderAddonRows(apiItem);
  const lineTotal = merchantLineTotalForFoodItem(apiItem);
  const custTotal =
    apiItem.customizations_total ??
    addonRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="82%">
      <View style={styles.header}>
        <Text style={styles.title}>Item details</Text>
        <Text style={styles.subtitle}>Prepare exactly as ordered below</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.itemCard}>
          <ItemVegMark vegNonveg={item.vegNonveg ?? orderVeg} name={item.name} size={16} />
          <View style={styles.itemCardBody}>
            <Text style={styles.itemQtyName} numberOfLines={3}>
              {qty} × {item.name}
            </Text>
            <Text style={styles.itemLinePrice}>{formatMerchantRs(item.price)}</Text>
          </View>
        </View>

        {variantLabel ? (
          <View style={styles.variantBlock}>
            <Text style={styles.sectionLabel}>Variant / size</Text>
            <View style={styles.variantPill}>
              <Text style={styles.variantPillText}>{variantLabel}</Text>
            </View>
            <Text style={styles.variantHint}>Customer ordered this size — pack the same variant.</Text>
          </View>
        ) : null}

        {addonRows.length > 0 ? (
          <View style={styles.addonBlock}>
            <Text style={styles.sectionLabel}>Add-ons & extras</Text>
            <View style={styles.custCard}>
              {addonRows.map((row, i) => (
                <View
                  key={`${row.label}-${i}`}
                  style={[styles.custRow, i < addonRows.length - 1 && styles.custRowBorder]}
                >
                  <Text style={styles.custLabel}>{row.label}</Text>
                  <Text style={styles.custAmount}>
                    {row.amount != null && row.amount > 0 ? formatMerchantRs(row.amount) : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : variantLabel ? null : (
          <Text style={styles.empty}>No extra add-ons for this item.</Text>
        )}

        {custTotal > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Add-ons total</Text>
            <Text style={styles.summaryAmount}>{formatMerchantRs(custTotal)}</Text>
          </View>
        ) : null}

        <View style={styles.lineTotalRow}>
          <Text style={styles.lineTotalLabel}>Line total</Text>
          <Text style={styles.lineTotalAmount}>{formatMerchantRs(lineTotal)}</Text>
        </View>
      </ScrollView>

      <Pressable onPress={onClose} style={styles.doneBtn}>
        <Text style={styles.doneBtnText}>Back to all items</Text>
      </Pressable>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  scroll: { maxHeight: 400 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  itemCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  itemQtyName: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 21,
  },
  itemLinePrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  variantBlock: {
    marginBottom: 14,
  },
  variantPill: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#6EE7B7",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  variantPillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#047857",
  },
  variantHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 8,
    lineHeight: 17,
  },
  addonBlock: {
    marginBottom: 4,
  },
  custCard: {
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#F0FDFA",
  },
  custRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  custRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#CCFBF1",
  },
  custLabel: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  custAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    paddingVertical: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 4,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },
  lineTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  lineTotalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  lineTotalAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  doneBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
});
