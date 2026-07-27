/**
 * BHIM-style promotional success sheet after GatiCash top-up.
 * Shown over the main wallet page once payment confirms.
 */

import { Modal, Pressable, View, StyleSheet, TouchableOpacity } from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const COUPON_TOP = "#1E3A8A";
const COUPON_BOTTOM = "#2563EB";
const CLOSE_ORANGE = "#F97316";
const MINT = GatiMitraColors.primaryMint;

function formatInr(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("en-IN", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export type GatiCashTopupSuccessSheetProps = {
  visible: boolean;
  amount: number;
  balanceAfter?: number | null;
  onClose: () => void;
};

export function GatiCashTopupSuccessSheet({
  visible,
  amount,
  balanceAfter,
  onClose,
}: GatiCashTopupSuccessSheetProps) {
  const insets = useSafeAreaInsets();

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
          <View style={styles.giftBadge}>
            <Ionicons name="gift" size={22} color="#fff" />
          </View>

          <AppText style={styles.title}>Your GatiCash is Here!</AppText>

          <View style={styles.couponOuter}>
            <View style={styles.notchLeft} />
            <View style={styles.notchRight} />

            <View style={styles.couponTop}>
              <AppText style={styles.couponTopText}>Added to your wallet</AppText>
            </View>

            <View style={styles.perforationRow}>
              {Array.from({ length: 22 }).map((_, i) => (
                <View key={i} style={styles.perfDot} />
              ))}
            </View>

            <View style={styles.couponBottom}>
              <AppText style={styles.starDecor}>✦</AppText>
              <AppText style={styles.amountText}>✨ ₹{formatInr(amount)} ✨</AppText>
              <AppText style={styles.starDecorRight}>✦</AppText>

              <View style={styles.giftCornerLeft}>
                <Ionicons name="gift-outline" size={28} color="rgba(255,255,255,0.35)" />
              </View>
              <View style={styles.giftCornerRight}>
                <Ionicons name="gift-outline" size={28} color="rgba(255,255,255,0.35)" />
              </View>
            </View>
          </View>

          {balanceAfter != null && Number.isFinite(balanceAfter) ? (
            <AppText style={styles.balanceHint}>
              New balance: ₹{formatInr(balanceAfter)}
            </AppText>
          ) : null}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.9}>
            <AppText style={styles.closeBtnText}>Close</AppText>
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
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 36,
    alignItems: "center",
  },
  giftBadge: {
    position: "absolute",
    top: -22,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    zIndex: 2,
  },
  title: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 18,
  },
  couponOuter: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COUPON_BOTTOM,
  },
  notchLeft: {
    position: "absolute",
    left: -10,
    top: "48%",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    zIndex: 3,
  },
  notchRight: {
    position: "absolute",
    right: -10,
    top: "48%",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    zIndex: 3,
  },
  couponTop: {
    backgroundColor: COUPON_TOP,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  couponTopText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  perforationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: COUPON_TOP,
    paddingBottom: 2,
  },
  perfDot: {
    width: 5,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  couponBottom: {
    backgroundColor: COUPON_BOTTOM,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
  },
  amountText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  starDecor: {
    position: "absolute",
    top: 12,
    left: 18,
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
  },
  starDecorRight: {
    position: "absolute",
    top: 18,
    right: 22,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
  },
  giftCornerLeft: {
    position: "absolute",
    bottom: 8,
    left: 12,
  },
  giftCornerRight: {
    position: "absolute",
    bottom: 8,
    right: 12,
  },
  balanceHint: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  closeBtn: {
    marginTop: 20,
    alignSelf: "stretch",
    backgroundColor: CLOSE_ORANGE,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
