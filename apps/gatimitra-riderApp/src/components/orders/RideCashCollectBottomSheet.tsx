import React from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/AppText";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { LORA_BOLD, LORA_REGULAR, POPPINS_BOLD } from "@/src/theme/headerFonts";

/** Matches customer app Place Order CTA. */
const BRAND_BTN = "#137243";
const BRAND_BTN_DARK = "#0F5132";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  amountLabel: string;
  loading?: boolean;
  onConfirm: () => void;
};

export function RideCashCollectBottomSheet({
  visible,
  onDismiss,
  amountLabel,
  loading = false,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.46}
      showOuterHandle={false}
      showFloatingClose
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <AppText style={styles.title} bold>
            {t("orders.ridePaymentWait.cashSheetTitle", "Collect cash payment")}
          </AppText>
          <AppText style={styles.subtitle}>
            {t(
              "orders.ridePaymentWait.cashSheetSub",
              "Please collect {{amount}} from the customer before marking completed.",
              { amount: amountLabel }
            )}
          </AppText>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="cash-outline" size={24} color={BRAND_BTN_DARK} />
          </View>
          <AppText style={styles.infoText}>
            {t(
              "orders.ridePaymentWait.cashSheetHint",
              "Only tap Completed after you have received the full fare in cash from the passenger."
            )}
          </AppText>
        </View>

        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.cancelBtn, loading && styles.btnDisabled]}
            onPress={onDismiss}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <AppText style={styles.cancelLabel} bold>
              {t("common.cancel", "Cancel")}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, loading && styles.btnDisabled]}
            onPress={onConfirm}
            disabled={loading}
            activeOpacity={0.88}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t("orders.ridePaymentWait.cashSheetCompleted", "Completed")}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <AppText style={styles.confirmLabel} bold>
                  {t("orders.ridePaymentWait.cashSheetCompleted", "Completed")}
                </AppText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
    paddingRight: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: LORA_BOLD,
    color: "#1C1C1C",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: LORA_REGULAR,
    color: "#5F6368",
    lineHeight: 20,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 20,
  },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 14,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: LORA_REGULAR,
    color: "#166534",
    lineHeight: 19,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  cancelLabel: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: "#374151",
  },
  confirmBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BTN,
  },
  confirmLabel: {
    fontSize: 14,
    fontFamily: POPPINS_BOLD,
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
