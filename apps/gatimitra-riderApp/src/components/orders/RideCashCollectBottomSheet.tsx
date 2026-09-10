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
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";
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
  const { height, isShortHeight, rs } = useResponsiveLayout();
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.52 : 0.42));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={isShortHeight ? 0.58 : 0.46}
      showOuterHandle={false}
      showFloatingClose
    >
      <ResponsiveSheetBody
        maxHeight={bodyMaxH}
        contentContainerStyle={styles.bodyContent}
        footerStyle={styles.footerSlot}
        footer={
          <View style={[rowLayout.row, styles.ctaRow]}>
            <TouchableOpacity
              style={[styles.cancelBtn, loading && styles.btnDisabled]}
              onPress={onDismiss}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <AppText style={styles.cancelLabel} bold numberOfLines={1}>
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
                  <Ionicons name="checkmark-circle" size={18} color="#fff" style={rowLayout.noShrink} />
                  <AppText style={[styles.confirmLabel, flexShrinkText]} bold numberOfLines={1}>
                    {t("orders.ridePaymentWait.cashSheetCompleted", "Completed")}
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.headerTextCol}>
          <AppText style={[styles.title, flexShrinkText]} bold numberOfLines={2}>
            {t("orders.ridePaymentWait.cashSheetTitle", "Collect cash payment")}
          </AppText>
          <AppText
            style={[styles.subtitle, flexShrinkText]}
            numberOfLines={isShortHeight ? 3 : 4}
          >
            {t(
              "orders.ridePaymentWait.cashSheetSub",
              "Please collect {{amount}} from the customer before marking completed.",
              { amount: amountLabel }
            )}
          </AppText>
        </View>

        <View style={[rowLayout.rowStart, styles.infoCard, { marginTop: rs(12) }]}>
          <View style={[styles.infoIconWrap, rowLayout.noShrink]}>
            <Ionicons name="cash-outline" size={24} color={BRAND_BTN_DARK} />
          </View>
          <AppText
            style={[styles.infoText, flexShrinkText]}
            numberOfLines={isShortHeight ? 4 : 6}
          >
            {t(
              "orders.ridePaymentWait.cashSheetHint",
              "Only tap Completed after you have received the full fare in cash from the passenger."
            )}
          </AppText>
        </View>
      </ResponsiveSheetBody>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  bodyContent: {
    paddingTop: 18,
    paddingBottom: 4,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingBottom: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
    maxWidth: "100%",
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
  infoCard: {
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 14,
    maxWidth: "100%",
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
    gap: 10,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
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
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
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
