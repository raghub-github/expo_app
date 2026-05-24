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
import type { MerchantBillBreakdownModal } from "@/lib/merchantBillBreakdown";
import { GatiMitraMerchant, CARD_RADIUS, H_PADDING } from "@/constants/theme";

function formatRs(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(n - Math.round(n)) < 0.005) return `₹${Math.round(n)}`;
  return `₹${n.toFixed(2)}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  breakdown: MerchantBillBreakdownModal;
};

export function OrderBillBreakdownModal({ visible, onClose, breakdown }: Props) {
  const insets = useSafeAreaInsets();
  const lines = breakdown.fullLines.length > 0 ? breakdown.fullLines : breakdown.taxLines;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Bill breakdown</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {lines.length === 0 ? (
              <Text style={styles.empty}>No breakdown available for this order.</Text>
            ) : (
              lines.map((line) => (
                <View key={line.key} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text
                      style={[
                        styles.rowLabel,
                        line.kind === "discount" && styles.discountLabel,
                      ]}
                    >
                      {line.label}
                    </Text>
                    {line.sub ? <Text style={styles.rowSub}>{line.sub}</Text> : null}
                  </View>
                  <Text
                    style={[
                      styles.rowAmount,
                      line.kind === "discount" && styles.discountAmount,
                    ]}
                  >
                    {line.kind === "discount" ? `−${formatRs(line.amount)}` : formatRs(line.amount)}
                  </Text>
                </View>
              ))
            )}

            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total paid by customer</Text>
              <Text style={styles.totalAmount}>{formatRs(breakdown.finalAmount)}</Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
    maxHeight: "78%",
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
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: GatiMitraMerchant.textTertiary,
    paddingVertical: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 20,
  },
  discountLabel: {
    color: "#059669",
  },
  rowSub: {
    marginTop: 3,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 15,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  discountAmount: {
    color: "#059669",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.divider,
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  totalAmount: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
