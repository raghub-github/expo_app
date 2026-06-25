import React, { useEffect, useState } from "react";
import {
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";
import { riderApi } from "@/src/services/api/riderApi";

const MIN_WITHDRAWAL = 100;
const MAX_WITHDRAWAL_PER_REQUEST = 100_000;

type Props = {
  visible: boolean;
  withdrawable: number;
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

function getMaxWithdrawalLimit(withdrawable: number): number {
  return Math.min(Math.max(0, withdrawable), MAX_WITHDRAWAL_PER_REQUEST);
}

export function EarningsWithdrawalModal({
  visible,
  withdrawable,
  bankAccount,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const maxLimit = getMaxWithdrawalLimit(withdrawable);
  const canSubmit = maxLimit >= MIN_WITHDRAWAL && !submitting;

  useEffect(() => {
    if (!visible) return;
    if (maxLimit >= MIN_WITHDRAWAL) {
      setAmount(formatWithdrawalInputAmount(maxLimit));
    } else {
      setAmount("");
    }
  }, [visible, maxLimit]);

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
    if (Number.isNaN(amt) || amt < MIN_WITHDRAWAL) {
      Alert.alert(
        t("earnings.withdrawInvalid", "Invalid amount"),
        t("earnings.withdrawMin", "Minimum withdrawal is ₹{{min}}", { min: MIN_WITHDRAWAL }),
      );
      return;
    }
    if (amt > maxLimit) {
      Alert.alert(
        t("earnings.withdrawInvalid", "Invalid amount"),
        t(
          "earnings.withdrawMax",
          "Amount exceeds available balance or ₹1,00,000 limit",
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
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {t("earnings.requestWithdrawal", "Request Withdrawal")}
          </Text>

          <Text style={styles.availableLabel}>
            {t("earnings.withdrawable", "Withdrawable")}
          </Text>
          <Text style={styles.availableAmount}>{formatCurrency(withdrawable)}</Text>

          {bankAccount ? (
            <Text style={styles.bankHint}>
              {[bankAccount.bankName, bankAccount.accountNumberMasked]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}

          <Text style={styles.inputLabel}>
            {t("earnings.withdrawAmount", "Amount (₹)")}
          </Text>
          <TextInput
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            editable={canSubmit}
            style={styles.input}
            placeholder={`Min ₹${MIN_WITHDRAWAL}`}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.hint}>
            {t(
              "earnings.withdrawLimits",
              "Min ₹{{min}} · Max ₹{{max}} per request",
              { min: MIN_WITHDRAWAL, max: MAX_WITHDRAWAL_PER_REQUEST.toLocaleString("en-IN") },
            )}
          </Text>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {t("earnings.submitWithdrawal", "Submit withdrawal")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t("common.cancel", "Cancel")}</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
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
  submitBtn: {
    marginTop: 20,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
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
