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
import {
  normalizeRiderCancellationActor,
  type RiderCancellationActor,
} from "@/src/lib/rider-cancellation-display";

type Props = {
  visible: boolean;
  orderIdLabel?: string | null;
  penaltyAmount?: number | null;
  /** customer | rider | admin | system — defaults to admin when order was removed server-side. */
  cancelledByType?: string | null;
  onDismiss: () => void;
};

function formatInr(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

export function RiderAdminOrderCancelledSheet({
  visible,
  orderIdLabel,
  penaltyAmount,
  cancelledByType,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const hasPenalty = penaltyAmount != null && penaltyAmount > 0;
  const actor: RiderCancellationActor = normalizeRiderCancellationActor(cancelledByType);
  const title =
    actor === "rider"
      ? t("orders.adminCancelled.titleByMe", "Cancelled by Me")
      : actor === "customer"
        ? t("orders.adminCancelled.titleByUser", "Cancelled by User")
        : t("orders.adminCancelled.title", "Cancelled by Gatimitra Team");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
            <View style={styles.handle} />
            <View style={styles.iconWrap}>
              <Ionicons name="close-circle" size={48} color={colors.error[600]} />
            </View>
            <Text style={styles.title}>{title}</Text>
            {orderIdLabel ? (
              <Text style={styles.orderId}>
                {t("orders.adminCancelled.orderId", "Order {{id}}", { id: orderIdLabel })}
              </Text>
            ) : null}
            <Text style={styles.message}>
              {t(
                "orders.adminCancelled.message",
                "This order is no longer active. You can accept new orders from the home screen."
              )}
            </Text>

            {hasPenalty ? (
              <View style={styles.penaltyBox}>
                <Ionicons name="wallet-outline" size={22} color={colors.error[700]} />
                <View style={styles.penaltyInner}>
                  <Text style={styles.penaltyTitle}>
                    {t("orders.adminCancelled.penaltyTitle", "Penalty applied")}
                  </Text>
                  <Text style={styles.penaltyAmount}>{formatInr(penaltyAmount!)}</Text>
                  <Text style={styles.penaltyHint}>
                    {t(
                      "orders.adminCancelled.penaltyHint",
                      "This amount has been debited from your wallet as a penalty."
                    )}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable onPress={onDismiss} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>
                {t("orders.adminCancelled.goToOrders", "Go to orders")}
              </Text>
            </Pressable>
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
      android: { elevation: 12 },
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
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  penaltyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  penaltyInner: { flex: 1 },
  penaltyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.error[800],
    marginBottom: 4,
  },
  penaltyAmount: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.error[700],
    marginBottom: 6,
  },
  penaltyHint: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.error[700],
    lineHeight: 17,
  },
  btnPrimary: {
    width: "100%",
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[600],
    marginBottom: 4,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
