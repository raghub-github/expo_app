import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import type { LineItem } from "@/hooks/useOrders";
import { lineItemHasCustomizations } from "@/lib/merchant-order-food-item-display";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  items: LineItem[];
  total: number;
  orderVeg?: string | null;
  onClose: () => void;
  onItemPress: (item: LineItem) => void;
};

export function IncomingOrderAllItemsSheet({
  visible,
  items,
  total,
  orderVeg,
  onClose,
  onItemPress,
}: Props) {
  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="88%">
      <View style={styles.header}>
        <Text style={styles.title}>All order items</Text>
        <Text style={styles.subtitle}>{items.length} item{items.length === 1 ? "" : "s"} in this order</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listCard}>
          {items.map((item, idx) => (
            <View
              key={`${item.name}-${idx}`}
              style={[styles.rowWrap, idx < items.length - 1 && styles.rowBorder]}
            >
              <OrderCardItemRow
                item={item}
                orderVeg={orderVeg}
                showPrice
                onItemNamePress={() => onItemPress(item)}
                onRowPress={() => {
                  if (lineItemHasCustomizations(item)) onItemPress(item);
                }}
              />
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order total</Text>
          <Text style={styles.totalAmount}>₹{Math.round(total).toLocaleString("en-IN")}</Text>
        </View>
      </ScrollView>

      <Pressable onPress={onClose} style={styles.doneBtn}>
        <Text style={styles.doneBtnText}>Done</Text>
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
  },
  scroll: { maxHeight: 420 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 8,
  },
  listCard: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  rowWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  doneBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
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
