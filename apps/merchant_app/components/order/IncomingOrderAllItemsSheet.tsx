import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import type { LineItem } from "@/hooks/useOrders";
import { MerchantIncomingBillCard } from "@/components/order/MerchantIncomingBillCard";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { MerchantFonts } from "@/constants/typography";
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
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="92%">
      <View style={styles.header}>
        <Text style={styles.title}>All order items</Text>
        <Text style={styles.subtitle}>
          {itemCount} item{itemCount === 1 ? "" : "s"} in this order
        </Text>
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
              <Text style={styles.itemNameHeader}>Item name</Text>
              <Text style={styles.qtyHeader}>Qty</Text>
              <Text style={styles.amountHeader}>Price</Text>
            </View>
          ) : null}
          {items.map((item, idx) => (
            <View
              key={`${item.name}-${idx}`}
              style={[styles.rowWrap, idx < items.length - 1 && styles.rowBorder]}
            >
              <OrderCardItemRow
                item={item}
                index={idx + 1}
                orderVeg={orderVeg}
                showPrice
                showQuantityColumn
                showExpandChevron
                onItemNamePress={() => onItemPress(item)}
                onRowPress={() => onItemPress(item)}
              />
            </View>
          ))}
          {items.length === 0 ? (
            <Text style={styles.empty}>No items listed.</Text>
          ) : null}
        </View>

        <MerchantIncomingBillCard bill={bill} itemCount={itemCount} paid={paid} mode="full" />
      </ScrollView>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: H_PADDING,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF2",
    backgroundColor: "#F7F8FA",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: MerchantFonts.loraBold,
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: MerchantFonts.poppinsSemiBold,
    color: "#64748B",
    marginTop: 4,
  },
  scroll: { maxHeight: 520 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: "#F7F8FA",
  },
  listCard: {
    borderWidth: 1,
    borderColor: "#E8ECF2",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    elevation: 0,
    shadowOpacity: 0,
  },
  rowWrap: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
  },
  columnsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#F1F5F9",
  },
  itemNameHeader: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#64748B",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  qtyHeader: {
    width: 48,
    minWidth: 48,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#64748B",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  amountHeader: {
    width: 72,
    minWidth: 72,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#64748B",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  empty: {
    padding: 16,
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
  },
  doneBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: "#0F766E",
    alignItems: "center",
  },
  doneBtnPressed: { opacity: 0.9 },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#FFFFFF",
  },
});
