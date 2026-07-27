import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type Props = {
  visible: boolean;
  orderIdLabel?: string | null;
  reasonLabel?: string | null;
  penaltyApplied?: boolean;
  penaltyAmount?: number | null;
  onGoToOrders: () => void;
  onViewLedger?: () => void;
};

function formatInr(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

/** Shown after rider successfully self-cancels an assigned order. */
export function RiderCancelSuccessSheet({
  visible,
  orderIdLabel,
  reasonLabel,
  penaltyApplied = false,
  penaltyAmount,
  onGoToOrders,
  onViewLedger,
}: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const hasPenalty =
    Boolean(penaltyApplied) && penaltyAmount != null && Number(penaltyAmount) > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onGoToOrders}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onGoToOrders} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
            <View style={styles.handle} />
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success[600]} />
            </View>
            <Text style={styles.title}>
              {t("orders.cancel.successTitle", "Order cancelled")}
            </Text>
            {orderIdLabel ? (
              <Text style={styles.orderId}>
                {t("orders.cancel.successOrderId", "Order {{id}}", { id: orderIdLabel })}
              </Text>
            ) : null}
            <Text style={styles.message}>
              {t(
                "orders.cancel.successMessage",
                "The order will be offered to other riders. You can accept new orders from home."
              )}
            </Text>
            {reasonLabel ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>
                  {t("orders.cancel.selectedReason", "SELECTED REASON")}
                </Text>
                <Text style={styles.reasonValue}>{reasonLabel}</Text>
              </View>
            ) : null}

            {hasPenalty ? (
              <View style={styles.penaltyBox}>
                <Ionicons name="wallet-outline" size={22} color={colors.error[700]} />
                <View style={styles.penaltyInner}>
                  <Text style={styles.penaltyTitle}>
                    {t("orders.cancel.penaltyDebitedTitle", "Penalty applied")}
                  </Text>
                  <Text style={styles.penaltyAmount}>{formatInr(Number(penaltyAmount))}</Text>
                  <Text style={styles.penaltyHint}>
                    {t(
                      "orders.cancel.penaltyDebitedMessage",
                      "₹{{amount}} has been debited from your wallet as a penalty.",
                      { amount: Number(penaltyAmount) }
                    )}
                  </Text>
                  <Text style={styles.ledgerHint}>
                    {t(
                      "orders.cancel.penaltyLedgerHint",
                      "This deduction will appear in your ledger under Penalties."
                    )}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              {hasPenalty && onViewLedger ? (
                <Pressable onPress={onViewLedger} style={[styles.btn, styles.btnSecondary]}>
                  <Text style={styles.btnSecondaryText}>
                    {t("orders.cancel.viewLedger", "View ledger")}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onGoToOrders}
                style={[styles.btn, styles.btnPrimary, !hasPenalty || !onViewLedger ? styles.btnFull : null]}
              >
                <Text style={styles.btnPrimaryText}>
                  {t("orders.cancel.goToOrders", "Go to orders")}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.bottomSafeFill, { height: bottomInset }]} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      android: { elevation: 14 },
    }),
  },
  sheetBody: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: "center",
  },
  bottomSafeFill: {
    width: "100%",
    backgroundColor: "#fff",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    marginTop: 8,
    marginBottom: 12,
  },
  iconWrap: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
  },
  orderId: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  reasonBox: {
    width: "100%",
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gray[500],
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  reasonValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[900],
  },
  penaltyBox: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  penaltyInner: { flex: 1 },
  penaltyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.error[700],
    marginBottom: 2,
  },
  penaltyAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.error[700],
    marginBottom: 4,
  },
  penaltyHint: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.error[700],
    lineHeight: 17,
    marginBottom: 4,
  },
  ledgerHint: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray[600],
    lineHeight: 16,
  },
  actions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnFull: {
    flex: 1,
  },
  btnSecondary: {
    backgroundColor: colors.gray[100],
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[700],
  },
  btnPrimary: {
    backgroundColor: colors.primary[600],
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
