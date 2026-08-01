import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import type { LineItem } from "@/hooks/useOrders";
import { MerchantIncomingBillCard } from "@/components/order/MerchantIncomingBillCard";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import type { MerchantBillParts } from "@/lib/resolveMerchantOrderTotal";

type Props = {
  visible: boolean;
  items: LineItem[];
  /** Same parts the incoming sheet shows, so both surfaces explain the total identically. */
  bill: MerchantBillParts;
  paid?: boolean;
  orderVeg?: string | null;
  onClose: () => void;
  onItemPress: (item: LineItem) => void;
};

export function IncomingOrderAllItemsSheet({
  visible,
  items,
  bill,
  paid,
  orderVeg,
  onClose,
  onItemPress,
}: Props) {
  const itemCount = items.reduce((sum, it) => sum + Math.max(1, it.qty || 1), 0);
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
          {items.length > 0 ? (
            <View style={styles.columnsHeader}>
              <Text style={styles.itemNameHeader}>Items to be packed</Text>
              <Text style={styles.qtyHeader}>QTY</Text>
              <Text style={styles.amountHeader}>Amount</Text>
            </View>
          ) : null}
          {items.map((item, idx) => (
            <View
              key={`${item.name}-${idx}`}
              style={[styles.rowWrap, idx < items.length - 1 && styles.rowBorder]}
            >
              <OrderCardItemRow
                item={item}
                orderVeg={orderVeg}
                showPrice
                showQuantityColumn
                showExpandChevron
                onItemNamePress={() => onItemPress(item)}
                onRowPress={() => onItemPress(item)}
              />
            </View>
          ))}
        </View>

        <MerchantIncomingBillCard bill={bill} itemCount={itemCount} paid={paid} mode="full" />
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
  columnsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
    backgroundColor: "#F8FAFC",
  },
  itemNameHeader: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  qtyHeader: {
    width: 46,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  amountHeader: {
    width: 73,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
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
