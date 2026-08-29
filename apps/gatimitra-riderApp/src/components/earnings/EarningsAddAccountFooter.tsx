import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "@/src/theme";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";
import { useRiderBankAddGate } from "@/src/hooks/useRiderBankAccount";
import { useUnlockCountdown } from "@/src/hooks/useUnlockCountdown";
import { WithdrawProgressButton } from "@/src/components/earnings/WithdrawProgressButton";

/** Default shown when earnings summary has not loaded yet. */
export const MIN_WITHDRAWAL_BALANCE = 100;

type Props = {
  bankAccount: RiderBankPaymentMethod | null | undefined;
  isLoading?: boolean;
  hasBankAccount?: boolean;
  /** Enable the withdrawal button only when backend canWithdraw is true. */
  canWithdraw?: boolean;
  /** Withdrawable balance — drives min progress fill on the CTA. */
  withdrawable?: number;
  /** Min amount from Threshold settings (for helper copy). */
  minWithdrawal?: number;
  isFrozen?: boolean;
  freezeReason?: string | null;
  onAddAccount: () => void;
  onRequestWithdrawal?: () => void;
};

export function EarningsAddAccountFooter({
  bankAccount,
  isLoading,
  hasBankAccount = false,
  canWithdraw = false,
  withdrawable = 0,
  minWithdrawal = MIN_WITHDRAWAL_BALANCE,
  isFrozen = false,
  freezeReason = null,
  onAddAccount,
  onRequestWithdrawal,
}: Props) {
  const { t } = useTranslation();
  const { data: addGate } = useRiderBankAddGate();
  const countdown = useUnlockCountdown(addGate?.unlockAt);
  const addLocked = Boolean(addGate?.locked && countdown.locked);

  const showFrozenAlert = () => {
    Alert.alert(
      t("earnings.walletFrozenTitle", "Wallet Frozen"),
      freezeReason
        ? t("earnings.walletFrozenReason", "Withdrawals are currently disabled.\nReason: {{reason}}", {
            reason: freezeReason,
          })
        : t("earnings.walletFrozen", "Withdrawals are currently disabled."),
    );
  };

  const handleRequestWithdrawal = () => {
    if (isFrozen) {
      showFrozenAlert();
      return;
    }
    if (!canWithdraw) return;
    if (withdrawable < minWithdrawal) return;
    if (onRequestWithdrawal) {
      onRequestWithdrawal();
      return;
    }
    Alert.alert(
      t("earnings.requestWithdrawal", "Request Withdrawal"),
      t("earnings.withdrawalNote", "Withdrawals are processed weekly"),
    );
  };

  const handleAddAccount = () => {
    if (isFrozen) {
      showFrozenAlert();
      return;
    }
    if (addLocked) {
      Alert.alert(
        t("earnings.bankAddLockedTitle", "Add account locked"),
        t(
          "earnings.bankAddLockedMessage",
          "Locked due to security reasons. Try after {{time}}.",
          { time: countdown.label ?? "—" },
        ),
      );
      return;
    }
    onAddAccount();
  };

  const status = bankAccount?.verificationStatus;
  const rejectionReason = bankAccount?.rejectionReason?.trim() || null;
  const showVerifiedFooter =
    status === "verified" || (isLoading && hasBankAccount && status == null);

  const balanceTowardMin = isFrozen ? 0 : Math.max(0, withdrawable);
  const withdrawBlockedExtra = isFrozen || !canWithdraw;

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
        <WithdrawProgressButton
          current={balanceTowardMin}
          minAmount={minWithdrawal}
          onPress={handleRequestWithdrawal}
          disabled={withdrawBlockedExtra}
          labelReady={t("earnings.requestWithdrawal", "Request Withdrawal")}
          style={styles.progressBtn}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/payout-accounts")}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>
            {t("earnings.managePayoutAccounts", "Manage payout accounts")}
          </Text>
        </TouchableOpacity>
        <Text style={styles.withdrawalNote}>
          {isFrozen
            ? freezeReason
              ? t("earnings.walletFrozenReason", "Withdrawals are currently disabled.\nReason: {{reason}}", {
                  reason: freezeReason,
                })
              : t("earnings.walletFrozen", "Withdrawals are currently disabled.")
            : balanceTowardMin >= minWithdrawal && canWithdraw
              ? t("earnings.withdrawalNote", "Withdrawals are processed weekly")
              : t("earnings.withdrawalMinNote", "Minimum ₹{{min}} balance required to withdraw", {
                  min: minWithdrawal,
                })}
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
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/payout-accounts")}
          style={[styles.button, styles.manageBtn]}
        >
          <Text style={styles.buttonText}>
            {t("earnings.managePayoutAccounts", "Manage payout accounts")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isRejected = status === "rejected";
  const addEnabled = !isFrozen && !addLocked;
  const showNote = isFrozen || addLocked || isRejected;

  return (
    <View style={styles.wrap}>
      {showNote ? (
        <Text style={[styles.note, (isRejected || addLocked) && styles.rejectedNote]}>
          {isFrozen
            ? t(
                "earnings.addBankFrozenNote",
                "Wallet is frozen. Adding a bank account is disabled until the GatiMitra Team unfreezes your wallet.",
              )
            : addLocked
              ? t(
                  "earnings.bankAddLockedMessage",
                  "Locked due to security reasons. Try after {{time}}.",
                  { time: countdown.label ?? "—" },
                )
              : rejectionReason
                ? t(
                    "earnings.accountRejectedReasonNote",
                    "Your bank account was rejected.\nReason: {{reason}}",
                    { reason: rejectionReason },
                  )
                : t(
                    "earnings.accountRejectedNote",
                    "Your bank account was rejected. Please add a valid account.",
                  )}
        </Text>
      ) : null}
      <TouchableOpacity
        activeOpacity={addEnabled ? 0.88 : 1}
        onPress={handleAddAccount}
        disabled={!addEnabled}
        style={[styles.button, !addEnabled && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !addEnabled }}
        accessibilityLabel={
          addLocked
            ? t("earnings.tryAfter", "Try after {{time}}", { time: countdown.label ?? "—" })
            : t("earnings.addAccount", "Add Account")
        }
      >
        <Text style={styles.buttonText}>
          {addLocked
            ? t("earnings.tryAfter", "Try after {{time}}", { time: countdown.label ?? "—" })
            : t("earnings.addAccount", "Add Account")}
        </Text>
      </TouchableOpacity>
      {hasBankAccount || isRejected ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/payout-accounts")}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>
            {t("earnings.managePayoutAccounts", "Manage payout accounts")}
          </Text>
        </TouchableOpacity>
      ) : null}
      {isFrozen ? (
        <Text style={styles.withdrawalNote}>
          {freezeReason
            ? t("earnings.walletFrozenReason", "Withdrawals are currently disabled.\nReason: {{reason}}", {
                reason: freezeReason,
              })
            : t("earnings.walletFrozen", "Withdrawals are currently disabled.")}
        </Text>
      ) : null}
    </View>
  );
}

export const EARNINGS_ADD_ACCOUNT_FOOTER_HEIGHT = 180;

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
  buttonDisabled: {
    backgroundColor: colors.gray[300],
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  progressBtn: {
    width: "100%",
    marginTop: 0,
  },
  secondaryBtn: {
    marginTop: 10,
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.primary[700] ?? "#0F766E",
    fontWeight: "700",
    fontSize: 14,
  },
  manageBtn: {
    marginTop: 12,
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
