import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Alert, TextInput, RefreshControl, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE,
} from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWalletSummary, fetchLedger, createPayoutRequest,
  type WalletSummary, type LedgerEntry,
} from "@/services/walletApi";
import { listBankAccounts, type BankAccount } from "@/services/bankAccountApi";
import { useActiveCommission } from "@/hooks/useActiveCommission";
import {
  LedgerEntryAmount,
  type CancellationLedgerDisplay,
} from "@/components/earnings/LedgerEntryAmount";

const WITHDRAWAL_COMPLETED_DESCRIPTION =
  "Funds have been successfully transferred to the registered bank account.";

function formatLedgerDescription(description: string | null | undefined): string {
  if (!description?.trim()) return "";
  if (/^Withdrawal completed #\d+$/i.test(description.trim())) {
    return WITHDRAWAL_COMPLETED_DESCRIPTION;
  }
  return description;
}

const CATEGORIES = [
  "ORDER_EARNING", "ORDER_ADJUSTMENT", "WITHDRAWAL", "PENALTY",
  "SUBSCRIPTION_FEE", "COMMISSION_DEDUCTION", "BONUS", "CASHBACK",
  "REFUND_REVERSAL", "MANUAL_CREDIT", "MANUAL_DEBIT", "ADJUSTMENT",
] as const;

const CAT_LABELS: Record<string, string> = {
  ORDER_EARNING: "Order Earning",
  ORDER_ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawal",
  PENALTY: "Penalty",
  SUBSCRIPTION_FEE: "Subscription",
  COMMISSION_DEDUCTION: "Commission",
  BONUS: "Bonus",
  CASHBACK: "Cashback",
  REFUND_REVERSAL: "Refund Reversal",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
  ADJUSTMENT: "Adjustment",
};

const CAT_ICONS: Record<string, string> = {
  ORDER_EARNING: "cart-outline",
  WITHDRAWAL: "arrow-up-circle-outline",
  PENALTY: "warning-outline",
  SUBSCRIPTION_FEE: "card-outline",
  COMMISSION_DEDUCTION: "trending-down-outline",
  BONUS: "gift-outline",
  CASHBACK: "cash-outline",
};

const MIN_WITHDRAWAL = 100;
const MAX_WITHDRAWAL_PER_REQUEST = 100_000;

function getWithdrawableBalance(wallet: WalletSummary | null): number {
  return wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0;
}

function getMaxWithdrawalLimit(withdrawable: number): number {
  return Math.min(Math.max(0, withdrawable), MAX_WITHDRAWAL_PER_REQUEST);
}

function formatWithdrawalInputAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function bankAccountLabel(b: BankAccount): string {
  if ((b.payout_method ?? "bank") === "upi") {
    return `${b.account_holder_name} · UPI ${b.upi_id ?? "—"}`;
  }
  return `${b.account_holder_name} · ${b.bank_name ?? "Bank"} ${b.account_number_masked ?? "****"}`;
}

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isCancellationNoCreditEntry(entry: LedgerEntry): boolean {
  const meta = entry.metadata as Record<string, unknown> | null | undefined;
  if (getCancellationDisplay(entry)) return false;
  return meta?.entry_type === "order_cancellation" && meta?.balance_impact === "none";
}

function getCancellationDisplay(entry: LedgerEntry): CancellationLedgerDisplay | null {
  const meta = entry.metadata as Record<string, unknown> | null | undefined;
  const raw = meta?.cancellation_display;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as CancellationLedgerDisplay;
  return {
    originalAmount: Math.max(0, Number(d.originalAmount ?? 0)),
    creditAmount: Math.max(0, Number(d.creditAmount ?? 0)),
    showCancelledStatus: Boolean(d.showCancelledStatus),
  };
}

export default function EarningsScreen() {
  const scrollBottom = TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE;
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const { data: activeCommission } = useActiveCommission(storeId);

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dirFilter, setDirFilter] = useState<"all" | "CREDIT" | "DEBIT">("all");
  const [catFilter, setCatFilter] = useState("");

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBankId, setWithdrawBankId] = useState<number | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!storeId || !token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [w, l] = await Promise.all([
        fetchWalletSummary(storeId, token),
        fetchLedger(storeId, token, {
          limit: 50,
          direction: dirFilter !== "all" ? dirFilter : undefined,
          category: catFilter || undefined,
        }),
      ]);
      setWallet(w);
      setLedger(l.entries);
      setLedgerTotal(l.total);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [storeId, token, dirFilter, catFilter]);

  useEffect(() => { load(); }, [load]);

  const withdrawableBalance = getWithdrawableBalance(wallet);
  const maxWithdrawalLimit = getMaxWithdrawalLimit(withdrawableBalance);
  const withdrawalInputEnabled = maxWithdrawalLimit >= MIN_WITHDRAWAL && !withdrawing;

  const handleWithdrawAmountChange = (raw: string) => {
    if (raw === "") {
      setWithdrawAmount("");
      return;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    const cap = getMaxWithdrawalLimit(getWithdrawableBalance(wallet));
    if (num > cap) {
      setWithdrawAmount(formatWithdrawalInputAmount(cap));
      return;
    }
    setWithdrawAmount(raw);
  };

  const openWithdraw = async () => {
    if (!storeId || !token) return;
    const limit = getMaxWithdrawalLimit(getWithdrawableBalance(wallet));
    if (limit >= MIN_WITHDRAWAL) {
      setWithdrawAmount(formatWithdrawalInputAmount(limit));
    } else {
      setWithdrawAmount("");
    }
    setShowWithdraw(true);
    setBankPickerOpen(false);
    setBanksLoading(true);
    try {
      const b = await listBankAccounts(storeId, token);
      setBanks(b.filter((a) => !a.is_disabled));
      if (b.length > 0) {
        const primary = b.find((a) => a.is_primary && !a.is_disabled);
        if (primary) setWithdrawBankId(primary.id);
      }
    } catch { /* */ }
    finally { setBanksLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!storeId || !token || !withdrawBankId) return;
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < MIN_WITHDRAWAL) { Alert.alert("Invalid", `Min ₹${MIN_WITHDRAWAL}`); return; }
    const withdrawable = getWithdrawableBalance(wallet);
    if (amt > getMaxWithdrawalLimit(withdrawable)) {
      Alert.alert("Invalid", "Amount exceeds available balance or ₹1,00,000 limit");
      return;
    }
    setWithdrawing(true);
    try {
      await createPayoutRequest(storeId, amt, withdrawBankId, token);
      Alert.alert("Success", `Withdrawal of ${formatCurrency(amt)} submitted. Full amount within 24 to 48 hrs.`);
      setShowWithdraw(false);
      setWithdrawAmount("");
      await load();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again");
    } finally { setWithdrawing(false); }
  };

  if (!storeId || !token) {
    return (
      <View style={s.centered}>
        <Ionicons name="wallet-outline" size={40} color={GatiMitraMerchant.textTertiary} />
        <Text style={s.emptyText}>Sign in and select a store</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: scrollBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GatiMitraMerchant.primary} />}
      >
        {loading && !wallet ? (
          <View style={s.loadingBlock}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
          </View>
        ) : (
          <>
            {/* Active commission rate badge — sourced from /commission/active. */}
            {activeCommission ? (
              <View
                style={{
                  marginBottom: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "#ecfeff",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#a5f3fc",
                }}
              >
                <Ionicons name="receipt-outline" size={16} color="#0e7490" />
                <Text style={{ flex: 1, fontSize: 12, color: "#155e75", fontWeight: "600" }}>
                  Your platform commission: {activeCommission.percent}% — {activeCommission.sourceLabel}
                </Text>
              </View>
            ) : null}

            {/* Balance hero */}
            <View style={s.heroCard}>
              <Text style={s.heroLabel}>Withdrawable</Text>
              <Text style={s.heroBalance}>
                {formatCurrency(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
              </Text>
              <View style={s.heroRow}>
                <View style={s.heroStat}>
                  <Text style={s.heroStatLabel}>Today</Text>
                  <Text style={s.heroStatValue}>{formatCurrency(wallet?.today_earning ?? 0)}</Text>
                </View>
                <View style={s.heroDivider} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatLabel}>Yesterday</Text>
                  <Text style={s.heroStatValue}>{formatCurrency(wallet?.yesterday_earning ?? 0)}</Text>
                </View>
                <View style={s.heroDivider} />
                <View style={s.heroStat}>
                  <Text style={s.heroStatLabel}>Pending</Text>
                  <Text style={s.heroStatValue}>{formatCurrency(wallet?.pending_withdrawal_total ?? 0)}</Text>
                </View>
              </View>
              <Pressable onPress={openWithdraw} style={({ pressed }) => [s.withdrawBtn, pressed && s.withdrawBtnPressed]}>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                <Text style={s.withdrawBtnText}>Withdraw</Text>
              </Pressable>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Ionicons name="trending-up-outline" size={20} color="#16a34a" />
                <Text style={s.statValue}>{formatCurrency(wallet?.total_earned ?? 0)}</Text>
                <Text style={s.statLabel}>Total Earned</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="arrow-up-outline" size={20} color="#dc2626" />
                <Text style={s.statValue}>{formatCurrency(wallet?.total_withdrawn ?? 0)}</Text>
                <Text style={s.statLabel}>Withdrawn</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="remove-circle-outline" size={20} color="#f59e0b" />
                <Text style={s.statValue}>{formatCurrency(wallet?.total_commission_deducted ?? 0)}</Text>
                <Text style={s.statLabel}>Commission</Text>
              </View>
            </View>

            {/* Filters */}
            <View style={s.filterSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {(["all", "CREDIT", "DEBIT"] as const).map((d) => (
                  <Pressable key={d} onPress={() => setDirFilter(d)} style={[s.chip, dirFilter === d && s.chipActive]}>
                    <Text style={[s.chipText, dirFilter === d && s.chipTextActive]}>
                      {d === "all" ? "All" : d === "CREDIT" ? "Credits" : "Debits"}
                    </Text>
                  </Pressable>
                ))}
                {CATEGORIES.map((c) => (
                  <Pressable key={c} onPress={() => setCatFilter(catFilter === c ? "" : c)} style={[s.chip, catFilter === c && s.chipActive]}>
                    <Text style={[s.chipText, catFilter === c && s.chipTextActive]}>{CAT_LABELS[c] ?? c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Ledger */}
            <Text style={s.sectionTitle}>Transaction History ({ledgerTotal})</Text>
            {ledger.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="receipt-outline" size={32} color={GatiMitraMerchant.textTertiary} />
                <Text style={s.emptyText}>No transactions yet</Text>
              </View>
            ) : (
              ledger.map((entry) => {
                const cancellationDisplay = getCancellationDisplay(entry);
                const iconBg = cancellationDisplay
                  ? cancellationDisplay.creditAmount > 0
                    ? "#dcfce7"
                    : "#fef3c7"
                  : isCancellationNoCreditEntry(entry)
                    ? "#fef3c7"
                    : entry.direction === "CREDIT"
                      ? "#dcfce7"
                      : "#fee2e2";
                const iconColor = cancellationDisplay
                  ? cancellationDisplay.creditAmount > 0
                    ? "#16a34a"
                    : "#d97706"
                  : isCancellationNoCreditEntry(entry)
                    ? "#d97706"
                    : entry.direction === "CREDIT"
                      ? "#16a34a"
                      : "#dc2626";

                return (
                <View key={entry.id} style={s.txCard}>
                  <View style={s.txRow}>
                    <View style={[s.txIcon, { backgroundColor: iconBg }]}>
                      <Ionicons
                        name={(CAT_ICONS[entry.category] ?? (entry.direction === "CREDIT" ? "add-circle-outline" : "remove-circle-outline")) as any}
                        size={18}
                        color={iconColor}
                      />
                    </View>
                    <View style={s.txContent}>
                      <Text style={s.txCategory}>{CAT_LABELS[entry.category] ?? entry.category.replace(/_/g, " ")}</Text>
                      {entry.description ? (
                        <Text style={s.txDesc} numberOfLines={3}>{formatLedgerDescription(entry.description)}</Text>
                      ) : null}
                      {entry.category === "WITHDRAWAL" && entry.pg_transaction_id ? (
                        <Text style={s.txPgId} numberOfLines={1}>PG TNX: {entry.pg_transaction_id}</Text>
                      ) : null}
                    </View>
                    <View style={s.txAmountCol}>
                      {cancellationDisplay ? (
                        <LedgerEntryAmount display={cancellationDisplay} formatCurrency={formatCurrency} />
                      ) : (
                        <Text style={[s.txAmount, { color: isCancellationNoCreditEntry(entry) ? "#d97706" : entry.direction === "CREDIT" ? "#16a34a" : "#dc2626" }]}>
                          {isCancellationNoCreditEntry(entry) ? formatCurrency(entry.amount) : `${entry.direction === "CREDIT" ? "+" : "−"}${formatCurrency(entry.amount)}`}
                        </Text>
                      )}
                      {cancellationDisplay ? (
                        <Text style={[s.txBalance, { color: cancellationDisplay.creditAmount > 0 ? "#16a34a" : "#d97706" }]}>
                          {cancellationDisplay.creditAmount > 0 ? "Credit" : "Cancelled"}
                        </Text>
                      ) : isCancellationNoCreditEntry(entry) ? (
                        <Text style={[s.txBalance, { color: "#d97706" }]}>No credit</Text>
                      ) : (
                        <Text style={s.txBalance}>Bal: {formatCurrency(entry.balance_after)}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={s.txTime}>{timeAgo(entry.created_at)}</Text>
                </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Withdraw sheet — compact */}
      <Modal visible={showWithdraw} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Withdraw</Text>
                <Text style={s.modalSub}>
                  Available {formatCurrency(wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0)}
                </Text>
              </View>
              <Pressable onPress={() => { setShowWithdraw(false); setWithdrawAmount(""); setBankPickerOpen(false); }}>
                <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
              </Pressable>
            </View>

            <Text style={s.inputLabel}>Amount (min ₹{MIN_WITHDRAWAL})</Text>
            <TextInput
              style={[s.input, !withdrawalInputEnabled && s.inputDisabled]}
              value={withdrawAmount}
              onChangeText={handleWithdrawAmountChange}
              placeholder={withdrawalInputEnabled ? "Enter amount" : "Insufficient balance"}
              keyboardType="numeric"
              editable={withdrawalInputEnabled}
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
            {(() => {
              const amt = parseFloat(withdrawAmount);
              if (!withdrawalInputEnabled) {
                return (
                  <Text style={s.withdrawHintMuted}>
                    Withdrawal unavailable — minimum ₹{MIN_WITHDRAWAL} required in your balance.
                  </Text>
                );
              }
              if (!isNaN(amt) && amt >= MIN_WITHDRAWAL) {
                return <Text style={s.receiveHint}>You receive: {formatCurrency(amt)} (full amount)</Text>;
              }
              return (
                <Text style={s.withdrawHintMuted}>
                  Min ₹{MIN_WITHDRAWAL} · Max {formatCurrency(maxWithdrawalLimit)} (up to ₹1,00,000)
                </Text>
              );
            })()}
            {withdrawalInputEnabled && withdrawAmount.trim() !== "" && !isNaN(parseFloat(withdrawAmount)) && parseFloat(withdrawAmount) >= MIN_WITHDRAWAL && (
              <Text style={s.adjustHint}>
                Feel free to adjust the withdrawal amount as needed, as long as it does not exceed your available balance.
              </Text>
            )}

            <Text style={s.inputLabel}>Bank account</Text>
            {banksLoading ? (
              <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
            ) : banks.length === 0 ? (
              <Text style={s.noBankText}>No bank accounts. Add one from Profile.</Text>
            ) : banks.length > 1 ? (
              <View style={s.bankDropdownWrap}>
                <Pressable
                  onPress={() => setBankPickerOpen((v) => !v)}
                  style={({ pressed }) => [s.bankDropdownTrigger, pressed && { opacity: 0.9 }]}
                >
                  <Text style={s.bankDropdownTriggerText} numberOfLines={2}>
                    {withdrawBankId != null
                      ? bankAccountLabel(banks.find((b) => b.id === withdrawBankId) ?? banks[0])
                      : "Select bank account"}
                  </Text>
                  <Ionicons name={bankPickerOpen ? "chevron-up" : "chevron-down"} size={18} color={GatiMitraMerchant.textSecondary} />
                </Pressable>
                {bankPickerOpen && (
                  <View style={s.bankDropdownList}>
                    {banks.map((b) => (
                      <Pressable
                        key={b.id}
                        onPress={() => {
                          setWithdrawBankId(b.id);
                          setBankPickerOpen(false);
                        }}
                        style={[s.bankDropdownItem, withdrawBankId === b.id && s.bankDropdownItemActive]}
                      >
                        <Text style={[s.bankDropdownItemText, withdrawBankId === b.id && s.bankDropdownItemTextActive]} numberOfLines={2}>
                          {bankAccountLabel(b)}
                        </Text>
                        {withdrawBankId === b.id ? (
                          <Ionicons name="checkmark-circle" size={18} color={GatiMitraMerchant.primary} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={s.bankSingleCard}>
                <Text style={s.bankSingleName}>{banks[0].account_holder_name}</Text>
                <Text style={s.bankSingleSub}>{banks[0].account_number_masked ?? "****"}</Text>
              </View>
            )}

            <Text style={s.modalFootnote}>Funds arrive within 24 to 48 hrs</Text>

            <Pressable
              onPress={handleWithdraw}
              disabled={withdrawing || !withdrawBankId || !withdrawalInputEnabled || !withdrawAmount || parseFloat(withdrawAmount) < MIN_WITHDRAWAL || parseFloat(withdrawAmount) > maxWithdrawalLimit}
              style={({ pressed }) => [s.confirmBtn, (withdrawing || !withdrawBankId || !withdrawalInputEnabled || !withdrawAmount || parseFloat(withdrawAmount) < MIN_WITHDRAWAL || parseFloat(withdrawAmount) > maxWithdrawalLimit) && s.confirmBtnDisabled, pressed && s.confirmBtnPressed]}
            >
              {withdrawing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmBtnText}>Withdraw</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scroll: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scrollContent: { padding: H_PADDING, backgroundColor: GatiMitraMerchant.surfaceWarm },
  loadingBlock: { paddingVertical: 56, alignItems: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textTertiary, textAlign: "center", marginTop: 8 },
  heroCard: { backgroundColor: GatiMitraMerchant.primary, borderRadius: 20, padding: 20, marginBottom: 14 },
  heroLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  heroBalance: { fontSize: 32, fontWeight: "800", color: "#fff", marginTop: 4 },
  heroRow: { flexDirection: "row", marginTop: 16, justifyContent: "space-between" },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatLabel: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "uppercase" },
  heroStatValue: { fontSize: 14, fontWeight: "700", color: "#fff", marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  withdrawBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, paddingVertical: 12, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  withdrawBtnPressed: { opacity: 0.8 },
  withdrawBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 12, alignItems: "center", borderWidth: 1, borderColor: GatiMitraMerchant.border, ...GatiMitraMerchant.shadowSm },
  statValue: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginTop: 4 },
  statLabel: { fontSize: 10, color: GatiMitraMerchant.textTertiary, marginTop: 2, fontWeight: "600" },
  filterSection: { marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: "#f3f4f6", marginRight: 6, borderWidth: 1, borderColor: "#e5e7eb" },
  chipActive: { backgroundColor: GatiMitraMerchant.primary, borderColor: GatiMitraMerchant.primary },
  chipText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  chipTextActive: { color: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 8 },
  emptyCard: { alignItems: "center", padding: 30, backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  txCard: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, marginBottom: 6, ...GatiMitraMerchant.shadowSm },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txContent: { flex: 1, gap: 2 },
  txCategory: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  txDesc: { fontSize: 11, color: GatiMitraMerchant.textSecondary },
  txAmountCol: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontWeight: "700" },
  txBalance: { fontSize: 10, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  txTime: { fontSize: 10, color: GatiMitraMerchant.textTertiary, marginTop: 4, textAlign: "right" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  modalSub: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  modalFootnote: { fontSize: 10, color: GatiMitraMerchant.textTertiary, marginTop: 10, marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: GatiMitraMerchant.textPrimary },
  inputDisabled: { backgroundColor: "#f3f4f6", color: GatiMitraMerchant.textTertiary },
  receiveHint: { fontSize: 12, color: "#16a34a", fontWeight: "600", marginTop: 6 },
  withdrawHintMuted: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 6 },
  adjustHint: { fontSize: 11, color: GatiMitraMerchant.textSecondary, marginTop: 8, lineHeight: 16 },
  txPgId: { fontSize: 10, color: "#0369a1", fontFamily: "monospace", marginTop: 2 },
  bankDropdownWrap: { marginTop: 4, position: "relative", zIndex: 10 },
  bankDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  bankDropdownTriggerText: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  bankDropdownList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  bankDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  bankDropdownItemActive: { backgroundColor: "#fff7ed" },
  bankDropdownItemText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.textPrimary },
  bankDropdownItemTextActive: { color: GatiMitraMerchant.primary, fontWeight: "700" },
  bankSingleCard: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bankSingleName: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  bankSingleSub: { fontSize: 11, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  noBankText: { fontSize: 12, color: GatiMitraMerchant.textTertiary, paddingVertical: 8 },
  confirmBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 99, backgroundColor: GatiMitraMerchant.primary, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnPressed: { opacity: 0.85 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
