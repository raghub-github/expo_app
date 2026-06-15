import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";

type Props = {
  bankAccount: RiderBankPaymentMethod | null | undefined;
  isLoading?: boolean;
  hasBankAccount?: boolean;
  onAddAccount: () => void;
  onRequestWithdrawal?: () => void;
};

export function EarningsAddAccountFooter({
  bankAccount,
  isLoading,
  hasBankAccount = false,
  onAddAccount,
  onRequestWithdrawal,
}: Props) {
  const { t } = useTranslation();

  const handleRequestWithdrawal = () => {
    if (onRequestWithdrawal) {
      onRequestWithdrawal();
      return;
    }
    Alert.alert(
      t("earnings.requestWithdrawal", "Request Withdrawal"),
      t("earnings.withdrawalNote", "Withdrawals are processed weekly"),
    );
  };

  const status = bankAccount?.verificationStatus;
  const showVerifiedFooter =
    status === "verified" || (isLoading && hasBankAccount && status == null);

  if (showVerifiedFooter) {
    return (
      <View style={styles.wrap}>
        {bankAccount ? (
          <Text style={styles.accountHintCenter}>
            {[bankAccount.bankName, bankAccount.accountNumberMasked]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleRequestWithdrawal}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t("earnings.requestWithdrawal", "Request Withdrawal")}
        >
          <Text style={styles.buttonText}>
            {t("earnings.requestWithdrawal", "Request Withdrawal")}
          </Text>
        </TouchableOpacity>
        <Text style={styles.withdrawalNote}>
          {t("earnings.withdrawalNote", "Withdrawals are processed weekly")}
        </Text>
      </View>
    );
  }

  if (status === "pending") {
    return (
      <View style={styles.wrap}>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons name="time-outline" size={22} color={colors.warning[600]} />
            <Text style={styles.statusTitle}>
              {t("earnings.verificationPending", "Verification pending")}
            </Text>
          </View>
          {bankAccount ? (
            <Text style={styles.accountHint}>
              {[bankAccount.bankName, bankAccount.accountNumberMasked]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
          <Text style={styles.statusNote}>
            {t(
              "earnings.bankAccount.pendingNote",
              "Your bank account is under review",
            )}
          </Text>
        </View>
      </View>
    );
  }

  const isRejected = status === "rejected";

  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, isRejected && styles.rejectedNote]}>
        {isRejected
          ? t(
              "earnings.accountRejectedNote",
              "Your bank account was rejected. Please add a valid account.",
            )
          : t(
              "earnings.addBankAccountNote",
              "Add your Bank Account To receive Payouts",
            )}
      </Text>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onAddAccount}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t("earnings.addAccount", "Add Account")}
      >
        <Text style={styles.buttonText}>{t("earnings.addAccount", "Add Account")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export const EARNINGS_ADD_ACCOUNT_FOOTER_HEIGHT = 148;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  rejectedNote: {
    color: colors.error[700],
  },
  button: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.warning[700],
  },
  statusNote: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
    textAlign: "center",
  },
  accountHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    fontWeight: "600",
  },
  accountHintCenter: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 10,
  },
  withdrawalNote: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: "#6B7280",
    textAlign: "center",
  },
});
