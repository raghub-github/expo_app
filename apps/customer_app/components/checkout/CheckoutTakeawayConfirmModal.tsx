/**
 * Takeaway proceed confirm — compact pickup warning.
 * Cancel / Continue share one row at 50% each. Lora (copy) + Poppins (CTAs / distance).
 */

import { Modal, Pressable, StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";

type Props = {
  visible: boolean;
  distanceLabel: string | null;
  onCancel: () => void;
  onContinue: () => void;
};

export function CheckoutTakeawayConfirmModal({
  visible,
  distanceLabel,
  onCancel,
  onContinue,
}: Props) {
  const dark = useMerchantUiDark();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, dark && styles.backdropDark]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <View style={[styles.card, dark && styles.cardDark]} accessibilityRole="alert">
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, dark && styles.iconWrapDark]}>
              <Ionicons name="bag-handle" size={22} color="#EA580C" />
            </View>
            <View style={styles.topCopy}>
              <View style={[styles.badge, dark && styles.badgeDark]}>
                <Ionicons name="walk" size={11} color="#C2410C" />
                <Text style={styles.badgeText}>Self pickup</Text>
              </View>
              <Text style={[styles.title, dark && styles.titleDark]}>
                This is <Text style={styles.titleNot}>not</Text> a delivery order!
              </Text>
            </View>
          </View>

          <Text style={[styles.message, dark && styles.messageDark]}>
            Visit the outlet to collect your order
            {distanceLabel ? (
              <Text style={[styles.distanceInline, dark && styles.distanceInlineDark]}>
                {" · "}
                {distanceLabel} away
              </Text>
            ) : null}
            .
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={[styles.btn, styles.cancelBtn, dark && styles.cancelBtnDark]}
            >
              <Text style={[styles.cancelLabel, dark && styles.cancelLabelDark]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onContinue}
              accessibilityRole="button"
              accessibilityLabel="Continue with takeaway"
              style={[styles.btn, styles.continueBtn]}
            >
              <Text style={styles.continueLabel}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  backdropDark: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    zIndex: 2,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  iconWrapDark: {
    backgroundColor: "rgba(249, 115, 22, 0.18)",
    borderColor: "rgba(249, 115, 22, 0.35)",
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FFEDD5",
  },
  badgeDark: {
    backgroundColor: "rgba(234, 88, 12, 0.22)",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: StoreFonts.loraBold,
    color: "#C2410C",
  },
  title: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: "#0F172A",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  titleNot: {
    color: "#DC2626",
    fontFamily: StoreFonts.loraBold,
  },
  message: {
    marginTop: 12,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: StoreFonts.loraRegular,
    color: "#64748B",
  },
  messageDark: {
    color: MerchantDarkPalette.textMuted,
  },
  distanceInline: {
    fontFamily: StoreFonts.poppinsBold,
    color: GatiMitraColors.deepMintStart,
  },
  distanceInlineDark: {
    color: "#86EFAC",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  btn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cancelBtnDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: MerchantDarkPalette.border,
  },
  continueBtn: {
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#475569",
  },
  cancelLabelDark: {
    color: MerchantDarkPalette.textMuted,
  },
  continueLabel: {
    fontSize: 14,
    fontFamily: StoreFonts.poppinsBold,
    color: "#FFFFFF",
  },
});
