import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import type { LineItem } from "@/hooks/useOrders";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";
import { merchantLineTotalForFoodItem } from "@/lib/merchant-line-total";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";

function lineItemToApiItem(item: LineItem): ApiFoodOrderItem {
  return {
    qty: item.qty,
    name: item.name,
    price: item.price,
    menu_item_id: item.menuItemId,
    veg_nonveg: item.vegNonveg,
    customization_lines: item.customization_lines,
    base_amount: item.base_amount,
    customizations_total: item.customizations_total,
    captured_base_amount: item.captured_base_amount,
    captured_addon_amount: item.captured_addon_amount,
    has_customizations: item.has_customizations,
  };
}

function formatRs(amount: number): string {
  return `₹${Math.round(Number(amount) || 0).toLocaleString("en-IN")}`;
}

type Props = {
  visible: boolean;
  item: LineItem | null;
  onClose: () => void;
};

export function IncomingOrderCustomizationSheet({ visible, item, onClose }: Props) {
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
        <Text style={styles.title}>Customizations</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {qty} × {item.name}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {variantLabel ? (
          <View style={styles.variantPill}>
            <Text style={styles.variantPillText}>{variantLabel}</Text>
          </View>
        ) : null}

        {addonRows.length > 0 ? (
          <View style={styles.custCard}>
            {addonRows.map((row, i) => (
              <View
                key={`${row.label}-${i}`}
                style={[styles.custRow, i < addonRows.length - 1 && styles.custRowBorder]}
              >
                <Text style={styles.custLabel}>{row.label}</Text>
                <Text style={styles.custAmount}>
                  {row.amount != null && row.amount > 0 ? formatRs(row.amount) : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No customization details for this item.</Text>
        )}

        {custTotal > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Add-ons total</Text>
            <Text style={styles.summaryAmount}>{formatRs(custTotal)}</Text>
          </View>
        ) : null}

        <View style={styles.lineTotalRow}>
          <Text style={styles.lineTotalLabel}>Line total</Text>
          <Text style={styles.lineTotalAmount}>{formatRs(lineTotal)}</Text>
        </View>
      </ScrollView>
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
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  scroll: { maxHeight: 380 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 16,
  },
  variantPill: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  variantPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
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
});
