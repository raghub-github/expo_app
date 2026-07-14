import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import {
  merchantItemLineParts,
  formatMerchantRs,
} from "@/lib/merchant-line-total";
import { merchantBillPartsFromOrder } from "@/lib/resolveMerchantOrderTotal";
import { GatiMitraMerchant, CARD_RADIUS, H_PADDING } from "@/constants/theme";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";

function isPaidOrder(order: ApiFoodOrder): boolean {
  const st = (order.payment_status ?? "").trim().toUpperCase();
  if (st === "PAID" || st === "COMPLETED" || st === "SUCCESS") return true;
  const method = (order.payment_method ?? "").trim().toLowerCase();
  if (method.includes("cod") || method.includes("cash")) return false;
  return true;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  order: ApiFoodOrder;
};

function BillItemRow({
  item,
  orderVeg,
}: {
  item: ApiFoodOrderItem;
  orderVeg?: string | null;
}) {
  const qty = Math.max(1, item.qty || 1);
  const parts = merchantItemLineParts(item);
  const variantLabel = foodOrderVariantLabel(item);
  const custRows = foodOrderAddonRows(item);
  const showValueSplit = parts.hasCustomizations;

  return (
    <View style={styles.itemBlock}>
      <View style={styles.itemTopRow}>
        <View style={styles.itemNameCol}>
          <View style={styles.itemTitleRow}>
            <ItemVegMark vegNonveg={item.veg_nonveg ?? orderVeg} name={item.name} size={14} />
            <Text style={styles.itemTitle} numberOfLines={3}>
              {qty} × {item.name}
            </Text>
          </View>
          {variantLabel ? (
            <View style={styles.variantBadge}>
              <Text style={styles.variantBadgeText}>{variantLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.itemLineTotal}>{formatMerchantRs(parts.total)}</Text>
      </View>

      {showValueSplit ? (
        <>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>Item value</Text>
            <Text style={styles.splitAmount}>{formatMerchantRs(parts.base)}</Text>
          </View>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabelCust}>Customization value</Text>
            <Text style={styles.splitAmountCust}>{formatMerchantRs(parts.customizations)}</Text>
          </View>
        </>
      ) : null}

      {custRows.map((row, j) => (
        <View key={j} style={styles.addonRow}>
          <Text style={styles.addonLabel} numberOfLines={2}>
            ↳ {row.label}
          </Text>
          {row.amount != null ? (
            <Text style={styles.addonAmount}>{formatMerchantRs(row.amount)}</Text>
          ) : (
            <View style={styles.addonSpacer} />
          )}
        </View>
      ))}
    </View>
  );
}

function SummaryRow({
  label,
  amount,
  discount,
  bold,
}: {
  label: string;
  amount: number;
  discount?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.summaryLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.summaryAmount,
          discount && styles.discountAmount,
          bold && styles.summaryAmountBold,
        ]}
      >
        {discount ? `−${formatMerchantRs(amount)}` : formatMerchantRs(amount)}
      </Text>
    </View>
  );
}

export function OrderMerchantBillModal({ visible, onClose, order }: Props) {
  const items = order.items ?? [];
  const bill = merchantBillPartsFromOrder({
    pricing: order.pricing,
    grand_total: order.grand_total,
    food_items_total_value: order.food_items_total_value ?? null,
    items,
    billingSnapshot: order.billing_snapshot ?? null,
    merchantPrecisionDiscount: Math.max(0, Number(order.merchant_precision_discount) || 0),
  });
  const displayTotal = bill.total;
  const showPaid = isPaidOrder(order);

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Total bill</Text>
            <Text style={styles.footerAmount}>{formatMerchantRs(displayTotal)}</Text>
          </View>
        </View>
      }
    >
      <View style={styles.handle} />
      <Text style={styles.title}>Bill details</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>
          Items ({items.length})
        </Text>

        {items.map((item, idx) => (
          <BillItemRow key={`${item.name}-${idx}`} item={item} orderVeg={order.veg_non_veg} />
        ))}

        <Text style={[styles.sectionLabel, styles.sectionGap]}>Bill summary</Text>
        <View style={styles.summaryCard}>
          <SummaryRow label="All items subtotal" amount={bill.itemsSubtotal} bold />
          {bill.packaging > 0 ? (
            <SummaryRow label="Packaging charges" amount={bill.packaging} />
          ) : null}
          {bill.discount > 0 ? (
            <SummaryRow label="Merchant Precision Discount" amount={bill.discount} discount />
          ) : (
            <Text style={styles.platformNote}>
              Merchant Precision Discount — none. Platform (GatiMitra) offers are not deducted
              from your bill.
            </Text>
          )}
          <View style={styles.divider} />
          <SummaryRow label="Total bill" amount={displayTotal} bold />
          {showPaid ? (
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>PAID</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </MerchantBottomSheetShell>
  );
}

const AMOUNT_WIDTH = 88;

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
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    paddingHorizontal: H_PADDING,
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  sectionGap: {
    marginTop: 16,
  },
  itemBlock: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  itemTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemNameCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  variantBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 22,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
    textTransform: "capitalize",
  },
  itemLineTotal: {
    width: AMOUNT_WIDTH,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingLeft: 22,
    gap: 8,
  },
  splitLabel: {
    flex: 1,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  splitLabelCust: {
    flex: 1,
    fontSize: 11,
    color: "#115E59",
  },
  splitAmount: {
    width: AMOUNT_WIDTH,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  splitAmountCust: {
    width: AMOUNT_WIDTH,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#115E59",
    fontVariant: ["tabular-nums"],
  },
  addonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 4,
    paddingLeft: 22,
    gap: 8,
  },
  addonLabel: {
    flex: 1,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    borderLeftWidth: 1,
    borderLeftColor: "#99F6E4",
    paddingLeft: 8,
    lineHeight: 16,
  },
  addonAmount: {
    width: AMOUNT_WIDTH,
    textAlign: "right",
    fontSize: 11,
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  addonSpacer: {
    width: AMOUNT_WIDTH,
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 14,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
  },
  summaryLabelBold: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  summaryAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  summaryAmountBold: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  discountAmount: {
    color: "#059669",
  },
  platformNote: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.divider,
    marginVertical: 4,
  },
  paidBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.3,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.divider,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: H_PADDING,
    paddingVertical: 14,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  footerAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
