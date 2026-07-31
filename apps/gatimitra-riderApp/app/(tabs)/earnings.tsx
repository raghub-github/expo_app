import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useEarningsSummary, DEFAULT_EARNINGS_SUMMARY } from "@/src/hooks/useEarnings";
import { useRiderBankPaymentMethod } from "@/src/hooks/useRiderBankAccount";
import {
  EarningsAddAccountFooter,
  EARNINGS_ADD_ACCOUNT_FOOTER_HEIGHT,
  MIN_WITHDRAWAL_BALANCE,
} from "@/src/components/earnings/EarningsAddAccountFooter";
import { useEarningsBankSheetStore } from "@/src/stores/earningsBankSheetStore";
import { EarningsWithdrawalModal } from "@/src/components/earnings/EarningsWithdrawalModal";
import { NegativeWalletPayCard } from "@/src/components/earnings/NegativeWalletPayCard";
import { colors } from "@/src/theme";

export default function EarningsScreen() {
  const { t } = useTranslation();
  const { data: earnings, isError, error, refetch } = useEarningsSummary();
  const {
    data: bankAccount,
    isLoading: isBankAccountLoading,
    refetch: refetchBankAccount,
  } = useRiderBankPaymentMethod();
  const bankSheetOpen = useEarningsBankSheetStore((s) => s.visible);
  const openBankSheet = useEarningsBankSheetStore((s) => s.open);
  const display = earnings ?? DEFAULT_EARNINGS_SUMMARY;
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetchBankAccount();
    }, [refetchBankAccount]),
  );

  if (isError && !earnings) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.centerBlock}>
          <Text style={styles.errorTitle}>
            {t("earnings.error", "Failed to load earnings")}
          </Text>
          <Text style={styles.helperText}>
            {error instanceof Error ? error.message : t("earnings.errorMessage", "Please try again later")}
          </Text>
          <Pressable onPress={() => void refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.root}>
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t("earnings.totalBalance")}</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(display.totalBalance)}
            </Text>
            <Text style={styles.balanceHint}>{t("earnings.availableForWithdrawal")}</Text>
          </View>

          {/* Shown only when the wallet is negative — read-only "Pay ₹X" (native). */}
          <NegativeWalletPayCard />

          <View style={styles.statsRow}>
            <StatCard
              label={t("earnings.thisWeek")}
              value={formatCurrency(display.thisWeek)}
            />
            <StatCard
              label={t("earnings.thisMonth")}
              value={formatCurrency(display.thisMonth)}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t("earnings.breakdown")}</Text>
            {display.breakdownDetail ? (
              <>
                <ServiceBreakdownBlock
                  label={t("earnings.foodOrders")}
                  data={display.breakdownDetail.food}
                  format={formatCurrency}
                  t={t}
                />
                <ServiceBreakdownBlock
                  label={t("earnings.parcelOrders")}
                  data={display.breakdownDetail.parcel}
                  format={formatCurrency}
                  t={t}
                />
                <ServiceBreakdownBlock
                  label={t("earnings.rideTrips")}
                  data={display.breakdownDetail.ride}
                  format={formatCurrency}
                  t={t}
                />
                {display.breakdownDetail.common.subscriptionDebited > 0 ? (
                  <EarningItem
                    label={t("earnings.subscriptionDebited", "Subscription debited")}
                    amount={`- ${formatCurrency(display.breakdownDetail.common.subscriptionDebited)}`}
                  />
                ) : null}
              </>
            ) : (
              <>
                <EarningItem
                  label={t("earnings.foodOrders")}
                  amount={formatCurrency(display.breakdown.food)}
                />
                <EarningItem
                  label={t("earnings.parcelOrders")}
                  amount={formatCurrency(display.breakdown.parcel)}
                />
                <EarningItem
                  label={t("earnings.rideTrips")}
                  amount={formatCurrency(display.breakdown.ride)}
                />
              </>
            )}
            <View style={styles.totalDivider}>
              <EarningItem
                label={t("earnings.total")}
                amount={formatCurrency(display.totalBalance)}
                bold
              />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t("earnings.walletStatus")}</Text>
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>{t("earnings.withdrawable")}</Text>
              <Text style={[styles.walletAmount, styles.withdrawableAmount]}>
                {formatCurrency(display.withdrawable)}
              </Text>
            </View>
            {display.subscriptionDebited > 0 ? (
              <View style={styles.walletRow}>
                <Text style={styles.walletLabel}>
                  {t("earnings.subscriptionDebited", "Subscription debited")}
                </Text>
                <Text style={[styles.walletAmount, styles.subscriptionDebitedAmount]}>
                  {formatCurrency(display.subscriptionDebited)}
                </Text>
              </View>
            ) : null}
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>{t("earnings.locked")}</Text>
              <Text style={[styles.walletAmount, styles.lockedAmount]}>
                {formatCurrency(display.locked)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {!bankSheetOpen ? (
          <EarningsAddAccountFooter
            bankAccount={bankAccount}
            isLoading={isBankAccountLoading}
            hasBankAccount={display.hasBankAccount}
            canWithdraw={display.totalBalance > MIN_WITHDRAWAL_BALANCE}
            onAddAccount={openBankSheet}
            onRequestWithdrawal={() => setWithdrawOpen(true)}
          />
        ) : null}

        <EarningsWithdrawalModal
          visible={withdrawOpen}
          withdrawable={display.withdrawable}
          bankAccount={bankAccount}
          onClose={() => setWithdrawOpen(false)}
          onSuccess={() => {
            void refetch();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function EarningItem({ label, amount, bold }: { label: string; amount: string; bold?: boolean }) {
  return (
    <View style={styles.earningRow}>
      <Text style={[styles.earningLabel, bold && styles.earningLabelBold]}>{label}</Text>
      <Text style={[styles.earningAmount, bold && styles.earningAmountBold]}>{amount}</Text>
    </View>
  );
}

type ServiceBreakdownData = {
  earnings: number;
  penalties: number;
  penaltyReverts: number;
  offers: number;
  net: number;
};

/** One service (Food/Parcel/Ride) with its net and any earnings/penalty/revert/offer sub-lines. */
function ServiceBreakdownBlock({
  label,
  data,
  format,
  t,
}: {
  label: string;
  data: ServiceBreakdownData;
  format: (n: number) => string;
  t: (key: string, fallback?: string) => string;
}) {
  const subLines: Array<{ key: string; label: string; value: string; tone: "credit" | "debit" }> = [];
  if (data.earnings > 0)
    subLines.push({ key: "earn", label: t("earnings.svcEarnings", "Earnings"), value: `+ ${format(data.earnings)}`, tone: "credit" });
  if (data.penalties > 0)
    subLines.push({ key: "pen", label: t("earnings.svcPenalties", "Penalties"), value: `- ${format(data.penalties)}`, tone: "debit" });
  if (data.penaltyReverts > 0)
    subLines.push({ key: "rev", label: t("earnings.svcReverts", "Penalty reverted"), value: `+ ${format(data.penaltyReverts)}`, tone: "credit" });
  if (data.offers > 0)
    subLines.push({ key: "off", label: t("earnings.svcOffers", "Offers & incentives"), value: `+ ${format(data.offers)}`, tone: "credit" });

  return (
    <View style={styles.svcBlock}>
      <View style={styles.earningRow}>
        <Text style={[styles.earningLabel, styles.earningLabelBold]}>{label}</Text>
        <Text style={[styles.earningAmount, styles.earningAmountBold]}>{format(data.net)}</Text>
      </View>
      {subLines.map((s) => (
        <View key={s.key} style={styles.svcSubRow}>
          <Text style={styles.svcSubLabel}>{s.label}</Text>
          <Text style={[styles.svcSubValue, s.tone === "debit" && styles.svcSubValueDebit]}>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    overflow: "visible",
  },
  root: {
    flex: 1,
    position: "relative",
    overflow: "visible",
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: EARNINGS_ADD_ACCOUNT_FOOTER_HEIGHT + 8,
  },
  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  helperText: {
    marginTop: 16,
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primary[500],
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  balanceCard: {
    backgroundColor: colors.primary[500],
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  balanceLabel: {
    fontSize: 13,
    color: "#FFE0D1",
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  balanceHint: {
    fontSize: 13,
    color: "#FFE0D1",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statLabel: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  earningRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  earningLabel: {
    fontSize: 15,
    color: "#374151",
  },
  earningLabelBold: {
    fontWeight: "800",
    color: "#111827",
  },
  earningAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  earningAmountBold: {
    fontWeight: "800",
  },
  totalDivider: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 4,
    marginTop: 4,
  },
  svcBlock: {
    paddingVertical: 2,
  },
  svcSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 12,
    paddingVertical: 2,
  },
  svcSubLabel: {
    fontSize: 12.5,
    color: "#6B7280",
  },
  svcSubValue: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.success[600],
  },
  svcSubValueDebit: {
    color: colors.error[600],
  },
  walletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  walletLabel: {
    fontSize: 15,
    color: "#374151",
  },
  walletAmount: {
    fontSize: 17,
    fontWeight: "700",
  },
  withdrawableAmount: {
    color: colors.success[600],
  },
  lockedAmount: {
    color: colors.warning[600],
  },
  subscriptionDebitedAmount: {
    color: colors.error[600],
  },
});

