import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView } from "react-native";
import type { ApiFoodOrderItem } from "@/services/ordersApi";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { formatMerchantRs } from "@/lib/merchant-line-total";

function itemHasBreakdown(item: ApiFoodOrderItem): boolean {
  return Boolean(
    item.has_customizations ||
      (item.customization_lines && item.customization_lines.length > 0) ||
      (item.customizations && item.customizations.length > 0)
  );
}

type Props = {
  visible: boolean;
  item: ApiFoodOrderItem | null;
  onClose: () => void;
};

export function OrderItemPriceBreakdownModal({ visible, item, onClose }: Props) {
  if (!item) return null;

  const qty = Math.max(1, item.qty || 1);
  const lineTotal = Number(item.price) || 0;
  const variantLabel = foodOrderVariantLabel(item);
  const addonRows = foodOrderAddonRows(item);
  const structured = item.customization_lines ?? [];
  const baseAmount =
    item.base_amount != null && item.base_amount > 0
      ? item.base_amount
      : Math.max(0, lineTotal - (item.customizations_total ?? 0));
  const custTotal =
    item.customizations_total ??
    structured.reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose}>
      <View style={styles.handle} />
      <Text style={styles.title}>Item price breakdown</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.itemTitle} numberOfLines={2}>
          {qty} × {item.name}
        </Text>
        {variantLabel ? (
          <Text style={styles.variantText}>{variantLabel}</Text>
        ) : (
          <View style={styles.variantSpacer} />
        )}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Base item price</Text>
          <Text style={styles.rowAmount}>{formatMerchantRs(baseAmount)}</Text>
        </View>

        {addonRows.length > 0 ? (
          <View style={styles.custBlock}>
            <Text style={styles.custHeading}>Customizations</Text>
            {addonRows.map((row, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowAmount}>
                  {row.amount != null && row.amount > 0 ? formatMerchantRs(row.amount) : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {custTotal > 0 ? (
          <View style={[styles.row, styles.custTotalRow]}>
            <Text style={styles.custTotalLabel}>Customizations total</Text>
            <Text style={styles.custTotalAmount}>{formatMerchantRs(custTotal)}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.grandLabel}>
            Line total ({qty} item{qty > 1 ? "s" : ""})
          </Text>
          <Text style={styles.grandAmount}>{formatMerchantRs(lineTotal)}</Text>
        </View>

        <Text style={styles.note}>
          Merchant-facing amounts for this order line.
        </Text>
      </ScrollView>
    </MerchantBottomSheetShell>
  );
}

export { itemHasBreakdown };

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    paddingHorizontal: H_PADDING,
    marginBottom: 8,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 16,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  variantText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
    marginBottom: 14,
    lineHeight: 16,
  },
  variantSpacer: {
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 20,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  custBlock: {
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: "#5EEAD4",
  },
  custHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  custTotalRow: {
    marginTop: 4,
  },
  custTotalLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },
  custTotalAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.divider,
    marginVertical: 10,
  },
  grandLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  grandAmount: {
    fontSize: 17,
    fontWeight: "700",
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  note: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 15,
    marginTop: 8,
  },
});
