/**
 * Custom bottom sheet after parcel fare is paid (replaces system Alert.alert).
 */

import { Modal, Pressable, View, StyleSheet, TouchableOpacity } from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;

function formatInr(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-IN", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export type ParcelFarePaymentSuccessSheetProps = {
  visible: boolean;
  amountPaid: number;
  orderLabel?: string | null;
  onClose: () => void;
};

export function ParcelFarePaymentSuccessSheet({
  visible,
  amountPaid,
  orderLabel,
  onClose,
}: ParcelFarePaymentSuccessSheetProps) {
  const insets = useSafeAreaInsets();
  const orderHint = orderLabel?.trim() ? `#${orderLabel.trim()}` : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />

          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>

          <AppText style={styles.title}>Payment successful</AppText>
          <AppText style={styles.subtitle}>
            Your parcel fare has been paid. Share the pickup OTP with the captain only at handover.
          </AppText>

          <View style={styles.card}>
            {orderHint ? (
              <View style={styles.row}>
                <AppText style={styles.rowLabel}>Order</AppText>
                <AppText style={styles.rowValue} numberOfLines={1}>
                  {orderHint}
                </AppText>
              </View>
            ) : null}
            <View style={[styles.row, !orderHint && styles.rowOnly]}>
              <AppText style={styles.rowLabel}>Amount paid</AppText>
              <AppText style={styles.amountValue}>₹{formatInr(amountPaid)}</AppText>
            </View>
          </View>

          <TouchableOpacity style={styles.cta} onPress={onClose} activeOpacity={0.9}>
            <AppText style={styles.ctaText}>Continue tracking</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 18,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  card: {
    marginTop: 18,
    alignSelf: "stretch",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  rowOnly: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: MINT_DARK,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  cta: {
    marginTop: 20,
    alignSelf: "stretch",
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
