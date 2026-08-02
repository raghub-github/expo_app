import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { MerchantIncomingBillCard } from "@/components/order/MerchantIncomingBillCard";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import type { MerchantBillParts } from "@/lib/resolveMerchantOrderTotal";

type Props = {
  visible: boolean;
  bill: MerchantBillParts;
  itemCount: number;
  paid?: boolean;
  onClose: () => void;
};

export function IncomingOrderBillBreakdownSheet({
  visible,
  bill,
  itemCount,
  paid,
  onClose,
}: Props) {
  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="70%" hideCloseFab>
      <View style={styles.header}>
        <Text style={styles.title}>Bill breakdown</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <MerchantIncomingBillCard
          bill={bill}
          itemCount={itemCount}
          paid={paid}
          mode="full"
          style={styles.billCard}
        />
      </View>
      <Pressable onPress={onClose} style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  closeBtn: {
    position: "absolute",
    right: H_PADDING,
    top: 6,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },
  billCard: {
    marginTop: 0,
  },
  doneBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 4,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.9 },
});
