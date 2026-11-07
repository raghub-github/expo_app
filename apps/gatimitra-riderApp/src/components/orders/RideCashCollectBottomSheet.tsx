import React, { useEffect, useState } from "react";
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
const WARN_BG = "#FEF3C7";
const WARN_BORDER = "#FCD34D";
const WARN_ICON_BG = "#FDE68A";
const WARN_TEXT = "#92400E";

export type ParcelCollectPaymentMethod = "cash" | "online";

type Step = "method" | "collect" | "confirm";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  amountLabel: string;
  loading?: boolean;
  /** When false (ride cash path already chose Cash), skip the selector. Default true. */
  enableMethodSelector?: boolean;
  /** Called after rider confirms cash collection. */
  onConfirm: (method: ParcelCollectPaymentMethod) => void;
  /** Online selected → parent opens QR sheet (ride-style). */
  onChooseOnline?: () => void;
};

export function RideCashCollectBottomSheet({
  visible,
  onDismiss,
  amountLabel,
  loading = false,
  enableMethodSelector = true,
  onConfirm,
  onChooseOnline,
}: Props) {
  const { t } = useTranslation();
  const { height, isShortHeight, rs } = useResponsiveLayout();
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.58 : 0.48));
  const [step, setStep] = useState<Step>(enableMethodSelector ? "method" : "collect");
  const [method, setMethod] = useState<ParcelCollectPaymentMethod | null>(
    enableMethodSelector ? null : "cash"
  );

  useEffect(() => {
    if (visible) {
      setStep(enableMethodSelector ? "method" : "collect");
      setMethod(enableMethodSelector ? null : "cash");
    }
  }, [visible, enableMethodSelector]);

  const handlePrimary = () => {
    if (loading) return;
    if (step === "method") {
      if (!method) return;
      if (method === "online" && onChooseOnline) {
        onChooseOnline();
        return;
      }
      setStep("collect");
      return;
    }
    if (step === "collect") {
      setStep("confirm");
      return;
    }
    if (!method) return;
    onConfirm(method === "online" ? "online" : "cash");
  };

  const handleSecondary = () => {
    if (loading) return;
    if (step === "confirm") {
      setStep("collect");
      return;
    }
    if (step === "collect") {
      setStep("method");
      return;
    }
    onDismiss();
  };

  const isMethodStep = step === "method";
  const isConfirmStep = step === "confirm";
  const isOnline = method === "online";
  const primaryDisabled = loading || (isMethodStep && method == null);

  const primaryLabel = isMethodStep
    ? t("orders.ridePaymentWait.continueCollect", "Continue")
    : isConfirmStep
      ? t("orders.ridePaymentWait.cashSheetConfirmYes", "Yes, I collected")
      : t("orders.ridePaymentWait.cashSheetCompleted", "Completed");

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={isShortHeight ? 0.64 : 0.52}
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
              onPress={handleSecondary}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <AppText style={styles.cancelLabel} bold numberOfLines={1}>
                {isMethodStep
                  ? t("common.cancel", "Cancel")
                  : t("orders.ridePaymentWait.cashSheetGoBack", "Go back")}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                isConfirmStep && styles.confirmBtnWarn,
                primaryDisabled && styles.btnDisabled,
              ]}
              onPress={handlePrimary}
              disabled={primaryDisabled}
              activeOpacity={0.88}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isConfirmStep ? "warning" : isMethodStep ? "arrow-forward" : "checkmark-circle"}
                    size={18}
                    color="#fff"
                    style={rowLayout.noShrink}
                  />
                  <AppText style={[styles.confirmLabel, flexShrinkText]} bold numberOfLines={1}>
                    {primaryLabel}
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        }
      >
        {isMethodStep ? (
          <>
            <View style={styles.headerTextCol}>
              <AppText style={[styles.title, flexShrinkText]} bold numberOfLines={2}>
                {t(
                  "orders.ridePaymentWait.chooseTitle",
                  "Collect {{amount}} — how is the customer paying?",
                  { amount: amountLabel }
                )}
              </AppText>
              <AppText
                style={[styles.subtitle, flexShrinkText]}
                numberOfLines={isShortHeight ? 3 : 4}
              >
                {t(
                  "orders.ridePaymentWait.chooseSub",
                  "Cash if they hand you money, or Online if they paid via UPI / app."
                )}
              </AppText>
            </View>

            <View style={[styles.methodRow, { marginTop: rs(14) }]}>
              <TouchableOpacity
                style={[
                  styles.methodCard,
                  method === "cash" && styles.methodCardSelected,
                ]}
                onPress={() => setMethod("cash")}
                activeOpacity={0.88}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === "cash" }}
                accessibilityLabel={t("orders.ridePaymentWait.chooseCash", "Cash")}
              >
                <View
                  style={[
                    styles.methodIconWrap,
                    method === "cash" && styles.methodIconWrapSelected,
                  ]}
                >
                  <Ionicons
                    name="cash-outline"
                    size={22}
                    color={method === "cash" ? "#fff" : BRAND_BTN_DARK}
                  />
                </View>
                <AppText
                  style={[
                    styles.methodLabel,
                    method === "cash" && styles.methodLabelSelected,
                  ]}
                  bold
                  numberOfLines={1}
                >
                  {t("orders.ridePaymentWait.chooseCash", "Cash")}
                </AppText>
                <AppText
                  style={[
                    styles.methodHint,
                    method === "cash" && styles.methodHintSelected,
                  ]}
                  numberOfLines={2}
                >
                  {t(
                    "orders.ridePaymentWait.chooseCashHint",
                    "Handed notes / coins"
                  )}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodCard,
                  method === "online" && styles.methodCardSelected,
                ]}
                onPress={() => setMethod("online")}
                activeOpacity={0.88}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === "online" }}
                accessibilityLabel={t("orders.ridePaymentWait.chooseOnline", "Online")}
              >
                <View
                  style={[
                    styles.methodIconWrap,
                    method === "online" && styles.methodIconWrapSelected,
                  ]}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={22}
                    color={method === "online" ? "#fff" : BRAND_BTN_DARK}
                  />
                </View>
                <AppText
                  style={[
                    styles.methodLabel,
                    method === "online" && styles.methodLabelSelected,
                  ]}
                  bold
                  numberOfLines={1}
                >
                  {t("orders.ridePaymentWait.chooseOnline", "Online")}
                </AppText>
                <AppText
                  style={[
                    styles.methodHint,
                    method === "online" && styles.methodHintSelected,
                  ]}
                  numberOfLines={2}
                >
                  {t(
                    "orders.ridePaymentWait.chooseOnlineHint",
                    "UPI / wallet / app pay"
                  )}
                </AppText>
              </TouchableOpacity>
            </View>
          </>
        ) : isConfirmStep ? (
          <>
            <View style={styles.headerTextCol}>
              <AppText style={[styles.title, flexShrinkText]} bold numberOfLines={2}>
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineWarnTitle",
                      "Confirm online payment received?"
                    )
                  : t("orders.ridePaymentWait.cashWarnTitle", "Confirm cash received?")}
              </AppText>
              <AppText
                style={[styles.subtitle, flexShrinkText]}
                numberOfLines={isShortHeight ? 3 : 4}
              >
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineWarnSub",
                      "Only continue if the customer has already paid {{amount}} online. This cannot be undone.",
                      { amount: amountLabel }
                    )
                  : t(
                      "orders.ridePaymentWait.cashWarnSub",
                      "Only continue if you have already received {{amount}} in cash. This cannot be undone.",
                      { amount: amountLabel }
                    )}
              </AppText>
            </View>

            <View style={[rowLayout.rowStart, styles.warnCard, { marginTop: rs(12) }]}>
              <View style={[styles.warnIconWrap, rowLayout.noShrink]}>
                <Ionicons name="alert-circle" size={24} color={WARN_TEXT} />
              </View>
              <AppText
                style={[styles.warnText, flexShrinkText]}
                numberOfLines={isShortHeight ? 4 : 6}
              >
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineWarnHint",
                      "Do not tap Yes if the online payment is still pending."
                    )
                  : t(
                      "orders.ridePaymentWait.cashWarnHint",
                      "Do not tap Yes if the customer has not paid the full fare yet."
                    )}
              </AppText>
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerTextCol}>
              <AppText style={[styles.title, flexShrinkText]} bold numberOfLines={2}>
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineSheetTitle",
                      "Confirm online payment"
                    )
                  : t("orders.ridePaymentWait.cashSheetTitle", "Collect cash payment")}
              </AppText>
              <AppText
                style={[styles.subtitle, flexShrinkText]}
                numberOfLines={isShortHeight ? 3 : 4}
              >
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineSheetSub",
                      "Ask the customer to pay {{amount}} online, then mark completed.",
                      { amount: amountLabel }
                    )
                  : t(
                      "orders.ridePaymentWait.cashSheetSub",
                      "Please collect {{amount}} from the customer before marking completed.",
                      { amount: amountLabel }
                    )}
              </AppText>
            </View>

            <View style={[rowLayout.rowStart, styles.infoCard, { marginTop: rs(12) }]}>
              <View style={[styles.infoIconWrap, rowLayout.noShrink]}>
                <Ionicons
                  name={isOnline ? "phone-portrait-outline" : "cash-outline"}
                  size={24}
                  color={BRAND_BTN_DARK}
                />
              </View>
              <AppText
                style={[styles.infoText, flexShrinkText]}
                numberOfLines={isShortHeight ? 4 : 6}
              >
                {isOnline
                  ? t(
                      "orders.ridePaymentWait.onlineSheetHint",
                      "Only tap Completed after the customer has paid the full fare online."
                    )
                  : t(
                      "orders.ridePaymentWait.cashSheetHint",
                      "Only tap Completed after you have received the full fare in cash from the passenger."
                    )}
              </AppText>
            </View>
          </>
        )}
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
  methodRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  methodCard: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  methodCardSelected: {
    borderColor: BRAND_BTN,
    backgroundColor: "#ECFDF5",
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  methodIconWrapSelected: {
    backgroundColor: BRAND_BTN,
  },
  methodLabel: {
    fontSize: 15,
    fontFamily: POPPINS_BOLD,
    color: "#111827",
  },
  methodLabelSelected: {
    color: BRAND_BTN_DARK,
  },
  methodHint: {
    fontSize: 11,
    fontFamily: LORA_REGULAR,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 15,
  },
  methodHintSelected: {
    color: "#166534",
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
  warnCard: {
    gap: 12,
    backgroundColor: WARN_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARN_BORDER,
    padding: 14,
    maxWidth: "100%",
  },
  warnIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARN_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    fontFamily: LORA_REGULAR,
    color: WARN_TEXT,
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
  confirmBtnWarn: {
    backgroundColor: "#B45309",
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
