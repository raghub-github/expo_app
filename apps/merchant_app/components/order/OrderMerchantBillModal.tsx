import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import {
  merchantBillPartsFromFoodItems,
  merchantItemLineParts,
} from "@/lib/merchant-line-total";
import { GatiMitraMerchant, CARD_RADIUS, H_PADDING } from "@/constants/theme";
import {
  foodOrderAddonRows,
  foodOrderVariantLabel,
} from "@/lib/merchant-order-food-item-display";

function formatRs(amount: number, decimals = 2): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (decimals === 0) return `₹${Math.round(n)}`;
  return `₹${n.toFixed(decimals)}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  order: ApiFoodOrder;
};

export function OrderMerchantBillModal({ visible, onClose, order }: Props) {
  const insets = useSafeAreaInsets();
  const items = order.items ?? [];
  const packaging = order.pricing?.packaging ?? 0;
  const discount = order.pricing?.discount ?? 0;
  const bill = merchantBillPartsFromFoodItems(items, { packaging, discount });
  const displayTotal =
    Number(order.pricing?.total) > 0 ? Number(order.pricing!.total) : bill.total;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Bill details</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Items ({items.length})</Text>
            {items.map((item, idx) => {
              const qty = Math.max(1, item.qty || 1);
              const parts = merchantItemLineParts(item);
              const variantLabel = foodOrderVariantLabel(item);
              const custRows = foodOrderAddonRows(item);
              return (
                <View key={`${item.name}-${idx}`} style={styles.itemBlock}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTitleCol}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {qty} × {item.name}
                      </Text>
                      {variantLabel ? (
                        <View style={styles.variantBadge}>
                          <Text style={styles.variantBadgeText}>{variantLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemTotal}>{formatRs(parts.total, 0)}</Text>
                  </View>
                  <View style={styles.itemMeta}>
                    <Text style={styles.metaLine}>Base price (merchant) {formatRs(parts.base)}</Text>
                    {parts.capturedBase != null && parts.capturedBase > 0.005 ? (
                      <Text style={styles.metaMuted}>Base at order (DB) {formatRs(parts.capturedBase)}</Text>
                    ) : null}
                    {parts.hasCustomizations ? (
                      <Text style={styles.metaAccent}>
                        Add-ons total {formatRs(parts.customizations)}
                      </Text>
                    ) : null}
                  </View>
                  {custRows.length > 0 ? (
                    <View style={styles.custList}>
                      {custRows.map((row, j) => (
                        <View key={j} style={styles.custRow}>
                          <Text style={styles.custLabel} numberOfLines={2}>
                            ↳ {row.label}
                          </Text>
                          {row.amount != null ? (
                            <Text style={styles.custAmount}>{formatRs(row.amount)}</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}

            <Text style={[styles.sectionLabel, styles.sectionGap]}>Bill summary</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Item base (total)" amount={bill.itemBaseTotal} />
              {bill.showCustomizations ? (
                <SummaryRow label="Customizations (total)" amount={bill.customizationsTotal} />
              ) : null}
              <SummaryRow label="All items subtotal" amount={bill.itemsSubtotal} bold />
              {bill.packaging > 0 ? (
                <SummaryRow label="Packaging charges" amount={bill.packaging} />
              ) : null}
              {bill.discount > 0 ? (
                <SummaryRow label="Restaurant discount" amount={bill.discount} discount />
              ) : (
                <Text style={styles.platformNote}>
                  Platform (GatiMitra) offers are not deducted from your bill.
                </Text>
              )}
              <View style={styles.divider} />
              <SummaryRow label="Total" amount={displayTotal} bold />
              <Text style={styles.formulaHint}>
                Item price + customizations + packaging − restaurant discount
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
        {discount ? `−${formatRs(amount)}` : formatRs(amount, bold ? 0 : 2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: CARD_RADIUS + 4,
    borderTopRightRadius: CARD_RADIUS + 4,
    maxHeight: "82%",
    paddingHorizontal: H_PADDING,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    maxHeight: 520,
  },
  scrollContent: {
    paddingBottom: 8,
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
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  itemTitleCol: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  variantBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
    textTransform: "capitalize",
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  itemMeta: {
    marginTop: 6,
    marginLeft: 4,
    gap: 3,
  },
  metaLine: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  metaMuted: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  metaAccent: {
    fontSize: 11,
    color: "#0D9488",
    fontWeight: "600",
  },
  custList: {
    marginTop: 8,
    marginLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#5EEAD4",
    paddingLeft: 8,
    gap: 4,
  },
  custRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  custLabel: {
    flex: 1,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  custAmount: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
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
    fontSize: 17,
    fontWeight: "800",
    color: "#059669",
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
  formulaHint: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
  },
});
