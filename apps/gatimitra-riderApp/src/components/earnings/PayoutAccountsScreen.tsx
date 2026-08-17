import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/src/theme";
import {
  useRiderBankPaymentMethodsList,
  useSetPrimaryRiderBankPaymentMethod,
  useRiderBankAddGate,
} from "@/src/hooks/useRiderBankAccount";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import { useEarningsBankSheetStore } from "@/src/stores/earningsBankSheetStore";
import { extractApiErrorMessage } from "@/src/services/http";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";
import { useUnlockCountdown } from "@/src/hooks/useUnlockCountdown";

const TEAL = colors.primary[600];
const PAGE_BG = "#F4F6F8";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

function statusLabel(status: RiderBankPaymentMethod["verificationStatus"], t: (k: string, f: string) => string) {
  if (status === "verified") return t("earnings.bankAccount.statusVerified", "Verified");
  if (status === "rejected") return t("earnings.bankAccount.statusRejected", "Rejected");
  return t("earnings.bankAccount.statusPending", "Pending");
}

export function PayoutAccountsScreen() {
  const { t } = useTranslation();
  const { data: accounts = [], isLoading, isError, refetch, isRefetching } =
    useRiderBankPaymentMethodsList();
  const setPrimary = useSetPrimaryRiderBankPaymentMethod();
  const { data: earnings } = useEarningsSummary();
  const isFrozen = Boolean(earnings?.isFrozen);
  const openBankSheet = useEarningsBankSheetStore((s) => s.open);
  const { data: addGate } = useRiderBankAddGate();
  const countdown = useUnlockCountdown(addGate?.unlockAt);
  const addLocked = Boolean(addGate?.locked && countdown.locked);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleSetPrimary = (account: RiderBankPaymentMethod) => {
    if (account.verificationStatus === "rejected") return;
    if (isFrozen) {
      Alert.alert(
        t("earnings.walletFrozenTitle", "Wallet Frozen"),
        t("earnings.walletFrozen", "Withdrawals are currently disabled."),
      );
      return;
    }
    if (account.isPrimary && account.isActive !== false) return;
    Alert.alert(
      t("earnings.payout.setPrimaryTitle", "Set primary account"),
      t(
        "earnings.payout.setPrimaryBody",
        "Payouts will go to {{bank}} {{masked}}. Continue?",
        {
          bank: account.bankName || "Bank",
          masked: account.accountNumberMasked,
        },
      ),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("earnings.payout.setPrimaryCta", "Set as primary"),
          onPress: () => {
            void setPrimary.mutateAsync(account.id).catch((err) => {
              Alert.alert(
                t("common.error", "Error"),
                extractApiErrorMessage(err, "Could not set primary account"),
              );
            });
          },
        },
      ],
    );
  };

  const handleAddNew = () => {
    if (isFrozen) {
      Alert.alert(
        t("earnings.walletFrozenTitle", "Wallet Frozen"),
        t(
          "earnings.addBankFrozenNote",
          "Wallet is frozen. Adding a bank account is disabled until the GatiMitra Team unfreezes your wallet.",
        ),
      );
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
    openBankSheet();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {t("earnings.payout.title", "Payout accounts")}
          </Text>
          <Text style={styles.headerSub}>
            {t(
              "earnings.payout.subtitle",
              "Choose which bank account receives withdrawals. Old accounts stay deactivated, not deleted.",
            )}
          </Text>
        </View>
      </View>

      {isLoading && accounts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : isError && accounts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerTitle}>
            {t("earnings.payout.loadFailed", "Could not load bank accounts")}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={TEAL} />
          }
        >
          {accounts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="card-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptyTitle}>
                {t("earnings.payout.emptyTitle", "No bank accounts yet")}
              </Text>
              <Text style={styles.emptyBody}>
                {t(
                  "earnings.payout.emptyBody",
                  "Add a payout account to receive withdrawals.",
                )}
              </Text>
            </View>
          ) : (
            accounts.map((account) => {
              const isPrimary = account.isPrimary === true && account.isActive !== false;
              const isInactive = account.isActive === false;
              const isRejected = account.verificationStatus === "rejected";
              return (
                <View
                  key={account.id}
                  style={[
                    styles.accountCard,
                    isPrimary && !isRejected && styles.accountCardPrimary,
                    isInactive && !isRejected && styles.accountCardInactive,
                    isRejected && styles.accountCardRejected,
                  ]}
                >
                  <View style={styles.accountTop}>
                    <View style={[styles.accountIcon, isRejected && styles.accountIconRejected]}>
                      <Ionicons
                        name="business-outline"
                        size={20}
                        color={isRejected ? "#B91C1C" : isPrimary ? TEAL : MUTED}
                      />
                    </View>
                    <View style={styles.accountMeta}>
                      <Text style={styles.bankName} numberOfLines={1}>
                        {account.bankName || "Bank"}
                      </Text>
                      <Text style={[styles.masked, isRejected && styles.maskedRejected]}>
                        {account.accountNumberMasked}
                      </Text>
                      <Text style={styles.holder} numberOfLines={1}>
                        {account.accountHolderName}
                        {account.ifsc ? ` · ${account.ifsc}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.badgeRow}>
                    {isPrimary && !isRejected ? (
                      <View style={[styles.badge, styles.badgePrimary]}>
                        <Text style={styles.badgePrimaryText}>
                          {t("earnings.payout.primary", "Primary")}
                        </Text>
                      </View>
                    ) : null}
                    {isInactive ? (
                      <View style={[styles.badge, styles.badgeInactive]}>
                        <Text style={styles.badgeInactiveText}>
                          {t("earnings.payout.inactive", "Deactivated")}
                        </Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.badge,
                        account.verificationStatus === "verified"
                          ? styles.badgeOk
                          : isRejected
                            ? styles.badgeBad
                            : styles.badgeWarn,
                      ]}
                    >
                      <Text
                        style={
                          account.verificationStatus === "verified"
                            ? styles.badgeOkText
                            : isRejected
                              ? styles.badgeBadText
                              : styles.badgeWarnText
                        }
                      >
                        {statusLabel(account.verificationStatus, t)}
                      </Text>
                    </View>
                  </View>
                  {isRejected && account.rejectionReason ? (
                    <Text style={styles.rejectReason}>
                      {t("earnings.payout.rejectReason", "Reason: {{reason}}", {
                        reason: account.rejectionReason,
                      })}
                    </Text>
                  ) : null}

                  {!isRejected && !isPrimary ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, (isFrozen || setPrimary.isPending) && styles.btnDisabled]}
                      onPress={() => handleSetPrimary(account)}
                      disabled={isFrozen || setPrimary.isPending}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>
                        {t("earnings.payout.useForPayouts", "Use for payouts")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {!isRejected && isPrimary ? (
                    <Text style={styles.primaryHint}>
                      {t(
                        "earnings.payout.primaryHint",
                        "Withdrawals are sent to this account.",
                      )}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={[styles.addBtn, (isFrozen || addLocked) && styles.btnDisabled]}
            onPress={handleAddNew}
            disabled={isFrozen || addLocked}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>
              {addLocked
                ? t("earnings.tryAfter", "Try after {{time}}", { time: countdown.label ?? "—" })
                : t("earnings.payout.addNew", "Add new bank account")}
            </Text>
          </TouchableOpacity>
          {addLocked ? (
            <Text style={styles.addHint}>
              {t(
                "earnings.bankAddLockedMessage",
                "Locked due to security reasons. Try after {{time}}.",
                { time: countdown.label ?? "—" },
              )}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: TEXT },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  centerTitle: { fontSize: 15, fontWeight: "700", color: TEXT, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TEAL,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  emptyBody: { fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 18 },
  accountCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  accountCardPrimary: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  accountCardInactive: {
    opacity: 0.85,
  },
  accountCardRejected: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
    opacity: 1,
  },
  accountTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconRejected: {
    backgroundColor: "#FEE2E2",
  },
  accountMeta: { flex: 1, minWidth: 0 },
  bankName: { fontSize: 15, fontWeight: "800", color: TEXT },
  masked: { marginTop: 2, fontSize: 16, fontWeight: "700", color: TEAL, letterSpacing: 0.5 },
  maskedRejected: { color: "#B91C1C" },
  holder: { marginTop: 2, fontSize: 12, color: MUTED },
  rejectReason: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#B91C1C",
    fontWeight: "600",
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePrimary: { backgroundColor: "#CCFBF1" },
  badgePrimaryText: { fontSize: 11, fontWeight: "800", color: "#0F766E" },
  badgeInactive: { backgroundColor: "#F1F5F9" },
  badgeInactiveText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  badgeOk: { backgroundColor: "#D1FAE5" },
  badgeOkText: { fontSize: 11, fontWeight: "700", color: "#047857" },
  badgeWarn: { backgroundColor: "#FEF3C7" },
  badgeWarnText: { fontSize: 11, fontWeight: "700", color: "#B45309" },
  badgeBad: { backgroundColor: "#FEE2E2" },
  badgeBadText: { fontSize: 11, fontWeight: "700", color: "#B91C1C" },
  primaryBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  primaryHint: { fontSize: 12, color: MUTED, lineHeight: 16 },
  addBtn: {
    marginTop: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: TEAL,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  addHint: { fontSize: 12, color: MUTED, lineHeight: 17, textAlign: "center" },
  btnDisabled: { opacity: 0.55 },
});
