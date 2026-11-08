import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { AppText } from "@/components/AppText";
import { useOrderSettlement } from "@/src/hooks/useOrderSettlement";
import { POPPINS_BOLD, POPPINS_SEMIBOLD, LORA_REGULAR } from "@/src/theme/headerFonts";

function formatInr(amount: number): string {
  const n = Math.round(Math.abs(amount) * 100) / 100;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "credit" | "debit" | "muted";
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText style={[styles.rowLabel, bold ? styles.bold : null]} numberOfLines={2}>
        {label}
      </AppText>
      <AppText
        style={[
          styles.rowValue,
          tone === "credit" ? styles.credit : null,
          tone === "debit" ? styles.debit : null,
          tone === "muted" ? styles.muted : null,
          bold ? styles.bold : null,
        ]}
      >
        {value}
      </AppText>
    </View>
  );
}

/**
 * Ride/Parcel settlement from the server: what the customer paid (cash in hand or
 * online), what the rider earned, and the wallet movement between the two. The
 * customer's cash is never shown as a wallet credit. Renders nothing for jobs that
 * do not settle this way (food) or until the settlement is posted.
 */
export function PostpaidSettlementCard({ orderId }: { orderId: string | undefined }) {
  const { t } = useTranslation();
  const { data } = useOrderSettlement(orderId);
  const s = data?.settlement;
  const minBalance = data?.walletMinBalance;
  if (!s) return null;

  const service =
    s.serviceType === "parcel" ? t("ledger.parcel", "Parcel") : t("ledger.ride", "Ride");
  const isCash = s.paymentMethod === "cash";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={isCash ? "cash-outline" : "phone-portrait-outline"} size={17} color="#137243" />
        <AppText style={styles.title}>
          {isCash
            ? t("settlement.titleCash", "{{service}} settlement — Cash", { service })
            : t("settlement.titleOnline", "{{service}} settlement — Online", { service })}
        </AppText>
      </View>

      <AppText style={styles.sectionTitle}>{t("settlement.customerPayment", "Customer payment")}</AppText>
      <Row label={t("settlement.customerPayable", "Customer payable")} value={formatInr(s.customerPayable)} />
      {isCash ? (
        <Row
          label={t("settlement.cashCollected", "Cash you collected")}
          value={formatInr(s.cashCollected)}
          tone="muted"
        />
      ) : (
        <Row
          label={t("settlement.paidOnline", "Paid online to GatiMitra")}
          value={formatInr(s.platformCollected)}
          tone="muted"
        />
      )}

      <AppText style={styles.sectionTitle}>{t("settlement.yourEarning", "Your earning")}</AppText>
      <Row label={t("settlement.entitlement", "Rider earning")} value={formatInr(s.riderEntitlement)} bold />

      <AppText style={styles.sectionTitle}>{t("settlement.wallet", "Wallet settlement")}</AppText>
      {s.walletDebit > 0 ? (
        <Row
          label={t("settlement.platformShare", "Platform share deducted")}
          value={`−${formatInr(s.walletDebit)}`}
          tone="debit"
        />
      ) : null}
      {s.walletCredit > 0 ? (
        <Row
          label={
            isCash
              ? t("settlement.topUp", "Company top-up credited")
              : t("settlement.earningCredited", "Earning credited")
          }
          value={`+${formatInr(s.walletCredit)}`}
          tone="credit"
        />
      ) : null}
      {s.walletDebit <= 0 && s.walletCredit <= 0 ? (
        <Row label={t("settlement.noWalletChange", "Wallet change")} value={formatInr(0)} tone="muted" />
      ) : null}
      {s.walletBalanceAfter != null ? (
        <Row
          label={t("settlement.balanceAfter", "Wallet balance after")}
          value={`${s.walletBalanceAfter < 0 ? "−" : ""}${formatInr(s.walletBalanceAfter)}`}
          bold
        />
      ) : null}

      <AppText style={styles.explanation}>{s.explanation}</AppText>

      {minBalance?.belowMinimum ? (
        <TouchableOpacity
          style={styles.minBalance}
          activeOpacity={0.8}
          onPress={() => router.push("/(tabs)/earnings")}
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle" size={16} color="#B45309" />
          <AppText style={styles.minBalanceText}>
            {minBalance.message ??
              t("settlement.minBalance", "Recharge {{amount}} to keep receiving Ride and Parcel orders.", {
                amount: formatInr(minBalance.shortfall),
              })}
          </AppText>
          <AppText style={styles.minBalanceCta}>
            {t("settlement.recharge", "Recharge {{amount}}", { amount: formatInr(minBalance.shortfall) })}
          </AppText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontFamily: POPPINS_BOLD, fontSize: 14, color: "#0F172A" },
  sectionTitle: {
    fontFamily: POPPINS_BOLD,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#64748B",
    marginTop: 10,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3,
  },
  rowLabel: { flex: 1, fontFamily: LORA_REGULAR, fontSize: 13, color: "#334155" },
  rowValue: { fontFamily: POPPINS_SEMIBOLD, fontSize: 13, color: "#0F172A" },
  bold: { fontFamily: POPPINS_BOLD },
  credit: { color: "#137243" },
  debit: { color: "#B91C1C" },
  muted: { color: "#64748B" },
  explanation: {
    marginTop: 10,
    fontFamily: LORA_REGULAR,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#475569",
  },
  minBalance: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 10,
    gap: 6,
  },
  minBalanceText: { fontFamily: LORA_REGULAR, fontSize: 12.5, lineHeight: 17, color: "#92400E" },
  minBalanceCta: { fontFamily: POPPINS_BOLD, fontSize: 13, color: "#B45309" },
});
