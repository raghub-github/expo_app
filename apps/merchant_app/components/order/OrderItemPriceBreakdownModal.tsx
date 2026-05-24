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
import type { ApiFoodOrderItem } from "@/services/ordersApi";
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
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Item price breakdown</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.itemTitle} numberOfLines={2}>
            {qty} × {item.name}
          </Text>
          {variantLabel ? (
            <View style={styles.variantBadge}>
              <Text style={styles.variantBadgeText}>{variantLabel}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Base item price</Text>
              <Text style={styles.rowAmount}>{formatRs(baseAmount)}</Text>
            </View>

            {addonRows.length > 0 ? (
              <View style={styles.custBlock}>
                <Text style={styles.custHeading}>Customizations</Text>
                {addonRows.map((row, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowAmount}>
                      {row.amount != null && row.amount > 0 ? formatRs(row.amount) : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {custTotal > 0 ? (
              <View style={[styles.row, styles.custTotalRow]}>
                <Text style={styles.custTotalLabel}>Customizations total</Text>
                <Text style={styles.custTotalAmount}>{formatRs(custTotal)}</Text>
              </View>
            ) : null}

            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.grandLabel}>Line total ({qty} item{qty > 1 ? "s" : ""})</Text>
              <Text style={styles.grandAmount}>{formatRs(lineTotal)}</Text>
            </View>

            <Text style={styles.note}>
              Merchant base prices — same amounts shown on the order.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { itemHasBreakdown };

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
    maxHeight: "72%",
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
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
  },
  variantBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 14,
  },
  variantBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
    textTransform: "capitalize",
  },
  scroll: {
    maxHeight: 360,
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
  rowMuted: {
    fontSize: 14,
    color: GatiMitraMerchant.textTertiary,
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
    marginBottom: 8,
  },
});
