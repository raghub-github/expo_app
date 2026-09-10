import React, { useEffect, useState } from "react";
import {
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Pressable,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";
import { riderApi } from "@/src/services/api/riderApi";
import { WithdrawProgressButton } from "@/src/components/earnings/WithdrawProgressButton";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { flexShrinkText } from "@/src/theme/responsiveText";

const FALLBACK_MIN = 100;
const FALLBACK_MAX = 100_000;

type Props = {
  visible: boolean;
  withdrawable: number;
  minWithdrawal?: number;
  maxWithdrawal?: number;
  bankAccount: RiderBankPaymentMethod | null | undefined;
  onClose: () => void;
  onSuccess: () => void;
};

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWithdrawalInputAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function getMaxWithdrawalLimit(withdrawable: number, maxCap: number): number {
  return Math.min(Math.max(0, withdrawable), maxCap);
}

export function EarningsWithdrawalModal({
  visible,
  withdrawable,
  minWithdrawal,
  maxWithdrawal,
  bankAccount,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const { height, isShortHeight, insets } = useResponsiveLayout();
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomPad = resolveRiderBottomInset(insets.bottom) + 12;
  const sheetMaxH = Math.round(height * (isShortHeight ? 0.78 : 0.86));

  const minAmount =
    Number.isFinite(minWithdrawal) && (minWithdrawal as number) > 0
      ? (minWithdrawal as number)
      : FALLBACK_MIN;
  const maxCap =
    Number.isFinite(maxWithdrawal) && (maxWithdrawal as number) > 0
      ? (maxWithdrawal as number)
      : FALLBACK_MAX;
  const maxLimit = getMaxWithdrawalLimit(withdrawable, maxCap);
  const canEdit = maxLimit >= minAmount && !submitting;
  const parsedAmount =
    amount.trim() === "" || Number.isNaN(parseFloat(amount)) ? 0 : parseFloat(amount);
  const amountOverMax = parsedAmount > maxLimit;

  useEffect(() => {
    if (!visible) return;
    if (maxLimit >= minAmount) {
      setAmount(formatWithdrawalInputAmount(maxLimit));
    } else {
      setAmount("");
    }
  }, [visible, maxLimit, minAmount]);

  const handleAmountChange = (raw: string) => {
    if (raw === "") {
      setAmount("");
      return;
    }
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    if (num > maxLimit) {
      setAmount(formatWithdrawalInputAmount(maxLimit));
      return;
    }
    setAmount(raw);
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt < minAmount) {
      Alert.alert(
        t("earnings.withdrawInvalid", "Invalid amount"),
        t("earnings.withdrawMin", "Minimum withdrawal is ₹{{min}}", { min: minAmount }),
      );
      return;
    }
    if (amt > maxLimit) {
      Alert.alert(
        t("earnings.withdrawInvalid", "Invalid amount"),
        t(
          "earnings.withdrawMax",
          "Amount exceeds available balance or max ₹{{max}}",
          { max: maxLimit.toLocaleString("en-IN") },
        ),
      );
      return;
    }

    setSubmitting(true);
    try {
      await riderApi.createWithdrawalRequest(amt);
      Alert.alert(
        t("earnings.withdrawSuccessTitle", "Withdrawal submitted"),
        t(
          "earnings.withdrawSuccessMessage",
          "Your withdrawal of {{amount}} has been submitted. Amount will be transferred within 24–48 hours.",
          { amount: formatCurrency(amt) },
        ),
      );
      onSuccess();
      onClose();
    } catch (e) {
      Alert.alert(
        t("earnings.withdrawFailed", "Withdrawal failed"),
        e instanceof Error ? e.message : t("common.tryAgain", "Please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { maxHeight: sheetMaxH }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ResponsiveSheetBody
            maxHeight={Math.max(240, sheetMaxH - bottomPad - 8)}
            contentContainerStyle={styles.bodyContent}
            footerStyle={styles.footerSlot}
            footerBottomInset={bottomPad}
            footer={
              <View>
                <WithdrawProgressButton
                  current={parsedAmount}
                  minAmount={minAmount}
                  onPress={() => void handleSubmit()}
                  loading={submitting}
                  disabled={!canEdit || amountOverMax}
                  labelReady={t("earnings.submitWithdrawal", "Submit withdrawal")}
                  style={styles.submitProgress}
                />
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelText} numberOfLines={1}>
                    {t("common.cancel", "Cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            }
          >
            <Text style={styles.title} numberOfLines={2}>
              {t("earnings.requestWithdrawal", "Request Withdrawal")}
            </Text>

            <Text style={styles.availableLabel} numberOfLines={1}>
              {t("earnings.withdrawable", "Withdrawable")}
            </Text>
            <Text style={[styles.availableAmount, flexShrinkText]} numberOfLines={1}>
              {formatCurrency(withdrawable)}
            </Text>

            {bankAccount ? (
              <Text style={[styles.bankHint, flexShrinkText]} numberOfLines={2}>
                {[bankAccount.bankName, bankAccount.accountNumberMasked]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}

            <Text style={styles.inputLabel} numberOfLines={1}>
              {t("earnings.withdrawAmount", "Amount (₹)")}
            </Text>
            <TextInput
              value={amount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
              editable={canEdit}
              style={styles.input}
              placeholder={`Min ₹${minAmount}`}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.hint, flexShrinkText]} numberOfLines={2}>
              {t(
                "earnings.withdrawLimits",
                "Min ₹{{min}} · Max ₹{{max}} per request",
                { min: minAmount, max: maxLimit.toLocaleString("en-IN") },
              )}
            </Text>
          </ResponsiveSheetBody>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  footerSlot: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
  },
  availableLabel: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  availableAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary[600],
    textAlign: "center",
    marginBottom: 8,
  },
  bankHint: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 16,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  submitProgress: {
    marginTop: 4,
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
});
