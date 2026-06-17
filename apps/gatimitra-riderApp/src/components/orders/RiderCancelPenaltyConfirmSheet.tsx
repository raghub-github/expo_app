import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useRiderCancellationPenaltyPreview } from "@/src/hooks/useRiderCancellationReasons";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type Props = {
  visible: boolean;
  orderId: string;
  reasonCode: string;
  reasonLabel: string;
  loading?: boolean;
  variant?: "ride" | "food";
  onClose: () => void;
  onProceed: () => void;
};

function formatInr(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

export function RiderCancelPenaltyConfirmSheet({
  visible,
  orderId,
  reasonCode,
  reasonLabel,
  loading = false,
  variant = "ride",
  onClose,
  onProceed,
}: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const isFood = variant === "food";

  const { data: preview, isLoading: previewLoading, isError: previewError } =
    useRiderCancellationPenaltyPreview(orderId, reasonCode, visible);

  const penaltyAmount = preview?.penaltyAmount ?? 0;
  const appliesPenalty = Boolean(preview?.appliesPenalty);
  const afterPickup = preview?.scenarioCode === "AFTER_MARK_PICKUP";
  const busy = loading || previewLoading;

  const penaltyAmountLabel =
    penaltyAmount > 0
      ? formatInr(penaltyAmount)
      : afterPickup
        ? t("orders.cancel.deliveryFarePenalty", "Delivery fare")
        : t("orders.cancel.flatPenaltyPending", "Configured penalty");

  const title = isFood
    ? t("orders.activeFood.cancelConfirmTitle", "Confirm cancellation")
    : t("orders.activeRide.cancelConfirmTitle", "Confirm cancellation");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Close")}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
            <View style={styles.handle} />
            <Text style={styles.title}>{title}</Text>

            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>
                {t("orders.cancel.selectedReason", "Selected reason")}
              </Text>
              <Text style={styles.reasonText}>{reasonLabel}</Text>
            </View>

            {previewLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary[600]} />
                <Text style={styles.loadingText}>
                  {t("orders.cancel.checkingPenalty", "Checking penalty…")}
                </Text>
              </View>
            ) : appliesPenalty ? (
              <View style={styles.penaltyBox}>
                <Ionicons name="wallet-outline" size={22} color={colors.error[700]} />
                <View style={styles.penaltyInner}>
                  <Text style={styles.penaltyTitle}>
                    {afterPickup
                      ? t(
                          "orders.cancel.penaltyAfterPickup",
                          "Penalty will be applied (after pickup)"
                        )
                      : t("orders.cancel.penaltyApplies", "Penalty will be applied")}
                  </Text>
                  <Text style={styles.penaltyAmount}>{penaltyAmountLabel}</Text>
                  <Text style={styles.penaltyHint}>
                    {preview?.ledgerDescription ||
                      preview?.ledgerTitle ||
                      t(
                        "orders.cancel.penaltyHint",
                        "This amount will be debited from your wallet as a penalty."
                      )}
                  </Text>
                </View>
              </View>
            ) : previewError || preview?.skipped === "order_not_found" || preview?.skipped === "preview_failed" ? (
              <View style={styles.noPenaltyBox}>
                <Ionicons name="information-circle-outline" size={20} color="#B45309" />
                <Text style={styles.noPenaltyText}>
                  {t(
                    "orders.cancel.penaltyPreviewFailed",
                    "Could not load penalty details. You can still cancel — check your ledger after."
                  )}
                </Text>
              </View>
            ) : preview?.skipped === "panel_disabled" ||
              preview?.skipped === "penalty_engine_not_migrated" ? (
              <View style={styles.noPenaltyBox}>
                <Ionicons name="information-circle-outline" size={20} color="#B45309" />
                <Text style={styles.noPenaltyText}>
                  {t(
                    "orders.cancel.penaltyEngineUnavailable",
                    "Penalty rules are not active yet. Contact support if you expect a charge."
                  )}
                </Text>
              </View>
            ) : (
              <View style={styles.noPenaltyBox}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#059669" />
                <Text style={styles.noPenaltyText}>
                  {t("orders.cancel.noPenalty", "No penalty for this reason.")}
                </Text>
              </View>
            )}

            <Text style={styles.note}>
              {isFood
                ? t(
                    "orders.activeFood.cancelConfirmMessage",
                    "The order will be offered to other riders. This cannot be undone."
                  )
                : t(
                    "orders.activeRide.cancelConfirmMessage",
                    "The order will be offered to other riders. This cannot be undone."
                  )}
            </Text>

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={[styles.btn, styles.btnSecondary, busy ? styles.btnDisabled : null]}
              >
                <Text style={styles.btnSecondaryText}>{t("common.back", "Back")}</Text>
              </Pressable>
              <Pressable
                onPress={onProceed}
                disabled={busy || previewLoading}
                style={[styles.btn, styles.btnDanger, busy || previewLoading ? styles.btnDisabled : null]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnDangerText}>
                    {appliesPenalty
                      ? t("orders.cancel.proceedWithPenalty", "Proceed")
                      : isFood
                        ? t("orders.activeFood.confirmCancel", "Cancel delivery")
                        : t("orders.activeRide.confirmCancel", "Cancel ride")}
                  </Text>
                )}
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
      android: { elevation: 12 },
    }),
  },
  sheetBody: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
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
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 12,
  },
  reasonBox: {
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[900],
  },
  loadingRow: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: colors.gray[600],
  },
  penaltyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
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
  noPenaltyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  noPenaltyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  note: {
    fontSize: 13,
    color: colors.gray[600],
    lineHeight: 18,
    marginBottom: 16,
  },
  actions: {
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
  btnSecondary: {
    backgroundColor: colors.gray[100],
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[700],
  },
  btnDanger: {
    backgroundColor: colors.error[600],
  },
  btnDangerText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
