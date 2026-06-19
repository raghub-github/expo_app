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
  fetchWalletSummary, fetchLedger, fetchPayoutQuote, createPayoutRequest,
  type WalletSummary, type LedgerEntry, type PayoutQuote,
} from "@/services/walletApi";
import { listBankAccounts, type BankAccount } from "@/services/bankAccountApi";
import { useActiveCommission } from "@/hooks/useActiveCommission";

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
  return meta?.entry_type === "order_cancellation" && meta?.balance_impact === "none";
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
  const [quote, setQuote] = useState<PayoutQuote | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

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

  const openWithdraw = async () => {
    if (!storeId || !token) return;
    setShowWithdraw(true);
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

  useEffect(() => {
    if (!showWithdraw || !storeId || !token) { setQuote(null); return; }
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 100) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const q = await fetchPayoutQuote(storeId, amt, token);
        setQuote(q);
      } catch { setQuote(null); }
    }, 500);
    return () => clearTimeout(t);
  }, [withdrawAmount, showWithdraw, storeId, token]);

  const handleWithdraw = async () => {
    if (!storeId || !token || !withdrawBankId) return;
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 100) { Alert.alert("Invalid", "Min ₹100"); return; }
    const withdrawable = wallet?.withdrawable_balance ?? wallet?.available_balance ?? 0;
    if (amt > withdrawable) { Alert.alert("Insufficient", "Not enough withdrawable balance"); return; }
    setWithdrawing(true);
    try {
      const result = await createPayoutRequest(storeId, amt, withdrawBankId, token);
      Alert.alert("Success", `Withdrawal of ${formatCurrency(result.net_payout_amount)} submitted. Processing in 2-3 business days.`);
      setShowWithdraw(false);
      setWithdrawAmount("");
      setQuote(null);
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
              ledger.map((entry) => (
                <View key={entry.id} style={s.txCard}>
                  <View style={s.txRow}>
                    <View style={[s.txIcon, { backgroundColor: isCancellationNoCreditEntry(entry) ? "#fef3c7" : entry.direction === "CREDIT" ? "#dcfce7" : "#fee2e2" }]}>
                      <Ionicons
                        name={(CAT_ICONS[entry.category] ?? (entry.direction === "CREDIT" ? "add-circle-outline" : "remove-circle-outline")) as any}
                        size={18}
                        color={isCancellationNoCreditEntry(entry) ? "#d97706" : entry.direction === "CREDIT" ? "#16a34a" : "#dc2626"}
                      />
                    </View>
                    <View style={s.txContent}>
                      <Text style={s.txCategory}>{CAT_LABELS[entry.category] ?? entry.category.replace(/_/g, " ")}</Text>
                      {entry.description && <Text style={s.txDesc} numberOfLines={2}>{entry.description}</Text>}
                    </View>
                    <View style={s.txAmountCol}>
                      <Text style={[s.txAmount, { color: isCancellationNoCreditEntry(entry) ? "#d97706" : entry.direction === "CREDIT" ? "#16a34a" : "#dc2626" }]}>
                        {isCancellationNoCreditEntry(entry) ? formatCurrency(entry.amount) : `${entry.direction === "CREDIT" ? "+" : "−"}${formatCurrency(entry.amount)}`}
                      </Text>
                      {isCancellationNoCreditEntry(entry) ? (
                        <Text style={[s.txBalance, { color: "#d97706" }]}>No credit</Text>
                      ) : (
                        <Text style={s.txBalance}>Bal: {formatCurrency(entry.balance_after)}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={s.txTime}>{timeAgo(entry.created_at)}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Withdraw modal */}
      <Modal visible={showWithdraw} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Withdraw Funds</Text>
              <Pressable onPress={() => { setShowWithdraw(false); setQuote(null); setWithdrawAmount(""); }}>
                <Ionicons name="close" size={24} color={GatiMitraMerchant.textSecondary} />
              </Pressable>
            </View>

            <Text style={s.modalLabel}>Available: {formatCurrency(wallet?.available_balance ?? 0)}</Text>

            <Text style={s.inputLabel}>Amount (min ₹100)</Text>
            <TextInput
              style={s.input}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Enter amount"
              keyboardType="numeric"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />

            {quote && (
              <View style={s.quoteCard}>
                <View style={s.quoteRow}><Text style={s.quoteLabel}>Requested</Text><Text style={s.quoteValue}>{formatCurrency(quote.requested_amount)}</Text></View>
                <View style={s.quoteRow}><Text style={s.quoteLabel}>Commission ({quote.commission_percentage}%)</Text><Text style={[s.quoteValue, { color: "#dc2626" }]}>−{formatCurrency(quote.commission_amount)}</Text></View>
                <View style={[s.quoteRow, s.quoteRowNet]}><Text style={s.quoteNetLabel}>Net payout</Text><Text style={s.quoteNetValue}>{formatCurrency(quote.net_payout_amount)}</Text></View>
              </View>
            )}

            <Text style={s.inputLabel}>Bank Account</Text>
            {banksLoading ? (
              <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
            ) : banks.length === 0 ? (
              <Text style={s.noBankText}>No bank accounts. Add one from Profile.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bankScroll}>
                {banks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => setWithdrawBankId(b.id)}
                    style={[s.bankChip, withdrawBankId === b.id && s.bankChipActive]}
                  >
                    <Text style={[s.bankChipText, withdrawBankId === b.id && s.bankChipTextActive]}>
                      {b.account_holder_name}{"\n"}
                      <Text style={s.bankChipSub}>{b.account_number_masked ?? "****"} · {(b.payout_method ?? "bank").toUpperCase()}</Text>
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Pressable
              onPress={handleWithdraw}
              disabled={withdrawing || !withdrawBankId || !quote}
              style={({ pressed }) => [s.confirmBtn, (withdrawing || !withdrawBankId || !quote) && s.confirmBtnDisabled, pressed && s.confirmBtnPressed]}
            >
              {withdrawing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmBtnText}>Confirm Withdrawal</Text>}
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  modalLabel: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: GatiMitraMerchant.textPrimary },
  quoteCard: { backgroundColor: "#f8fafc", borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  quoteRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  quoteLabel: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  quoteValue: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  quoteRowNet: { borderTopWidth: 1, borderTopColor: "#e2e8f0", marginTop: 4, paddingTop: 8 },
  quoteNetLabel: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  quoteNetValue: { fontSize: 15, fontWeight: "800", color: "#16a34a" },
  bankScroll: { marginTop: 4, maxHeight: 80 },
  bankChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: GatiMitraMerchant.border, marginRight: 8, backgroundColor: "#fff" },
  bankChipActive: { borderColor: GatiMitraMerchant.primary, backgroundColor: "#fff7ed" },
  bankChipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  bankChipTextActive: { color: GatiMitraMerchant.primary },
  bankChipSub: { fontSize: 10, fontWeight: "500", color: GatiMitraMerchant.textTertiary },
  noBankText: { fontSize: 12, color: GatiMitraMerchant.textTertiary, paddingVertical: 8 },
  confirmBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 99, backgroundColor: GatiMitraMerchant.primary, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnPressed: { opacity: 0.85 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
