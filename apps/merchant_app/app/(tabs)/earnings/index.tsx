import { useEffect, useState, useCallback, useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, FlatList, Pressable, ActivityIndicator, Alert, TextInput, RefreshControl, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE,
} from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWalletSummary, fetchLedger, createPayoutRequest, fetchPayoutSettlement, fetchPayoutRequests,
  fetchPayoutCycles,
  type WalletSummary, type LedgerEntry, type PayoutRequestsSummary, type PayoutRequestListItem,
} from "@/services/walletApi";
import { listBankAccounts, type BankAccount } from "@/services/bankAccountApi";
import { parsePgTimestamp } from "@/lib/parsePgTimestamp";
import {
  buildPayoutCards,
  buildPayoutCardsFromCycles,
  mergePayoutCardsWithActiveRequests,
  formatCurrency,
  formatPeriodRange,
  formatShortDate,
  payoutCardToParams,
  payoutReturnedDisplayAmount,
  resolveLedgerDisplayAmount,
  resolveLedgerDisplayDescription,
  resolveLedgerCategoryLabel,
  isMerchantVisibleLedgerEntry,
  resolveWalletDisplayBalance,
  statusBadgeStyle,
  statusLabel,
  TX_FILTER_CHIPS,
  txFilterToLedgerQuery,
  type TxFilter,
  type PayoutCard,
} from "@/lib/merchantPayoutUtils";
import { LedgerEntryAmount } from "@/components/earnings/LedgerEntryAmount";
import { WithdrawalSuccessSheet } from "@/components/earnings/WithdrawalSuccessSheet";

const MIN_WITHDRAWAL = 100;
const MAX_WITHDRAWAL_PER_REQUEST = 100_000;

function getWithdrawableBalance(wallet: WalletSummary | null): number {
  return resolveWalletDisplayBalance(wallet);
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

function timeAgo(dateStr: string): string {
  const d = parsePgTimestamp(dateStr);
  if (!d) return "";
  const ts = d.getTime();
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default function EarningsScreen() {
  const router = useRouter();
  const scrollBottom = TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE;
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [activeTab, setActiveTab] = useState<"payouts" | "transactions">("payouts");
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [payoutSummary, setPayoutSummary] = useState<PayoutRequestsSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBankId, setWithdrawBankId] = useState<number | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [cycleExpanded, setCycleExpanded] = useState(true);
  const [currentCycleEstPayout, setCurrentCycleEstPayout] = useState<number | null>(null);
  const [successSheet, setSuccessSheet] = useState<{ amountLabel: string } | null>(null);
  const [cycleCards, setCycleCards] = useState<PayoutCard[] | null>(null);
  const [recentPayoutRequests, setRecentPayoutRequests] = useState<PayoutRequestListItem[]>([]);

  const ledgerQuery = useMemo(
    () => (activeTab === "transactions" ? txFilterToLedgerQuery(txFilter) : {}),
    [activeTab, txFilter],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (!storeId || !token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [w, l, payouts, cycles] = await Promise.all([
        fetchWalletSummary(storeId, token),
        fetchLedger(storeId, token, { limit: 100, ...ledgerQuery }),
        fetchPayoutRequests(storeId, token, 20).catch(() => null),
        fetchPayoutCycles(storeId, token, 50).catch(() => []),
      ]);
      setWallet(w);
      setLedger(l.entries.filter(isMerchantVisibleLedgerEntry));
      if (payouts) {
        setPayoutSummary(payouts.summary);
        setRecentPayoutRequests(payouts.recent ?? []);
      } else {
        setRecentPayoutRequests([]);
      }
      setCycleCards(cycles.length > 0 ? buildPayoutCardsFromCycles(cycles) : null);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [storeId, token, ledgerQuery]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const payoutCards = useMemo(() => {
    const base = cycleCards && cycleCards.length > 0 ? cycleCards : buildPayoutCards(ledger);
    return mergePayoutCardsWithActiveRequests(base, recentPayoutRequests);
  }, [cycleCards, ledger, recentPayoutRequests]);
  const currentCycleCard = useMemo(
    () => payoutCards.find((c) => c.isCurrentCycle),
    [payoutCards],
  );
  const pastPayoutCards = useMemo(
    () => payoutCards.filter((c) => !c.isCurrentCycle),
    [payoutCards],
  );
  /** Cycles that only mark a withdrawal boundary — no orders, nothing paid out. */
  const settledPayoutCards = useMemo(
    () => pastPayoutCards.filter((c) => !c.isZeroActivity),
    [pastPayoutCards],
  );
  const returnedOnlyCards = useMemo(
    () => pastPayoutCards.filter((c) => c.isZeroActivity),
    [pastPayoutCards],
  );

  useEffect(() => {
    if (
      !storeId ||
      !token ||
      !currentCycleCard ||
      !currentCycleCard.periodStart ||
      !currentCycleCard.periodEnd
    ) {
      setCurrentCycleEstPayout(null);
      return;
    }
    const periodStart = currentCycleCard.periodStart;
    const periodEnd = currentCycleCard.periodEnd;
    let cancelled = false;
    void fetchPayoutSettlement(storeId, token, periodStart, periodEnd)
      .then((summary) => {
        if (!cancelled) {
          setCurrentCycleEstPayout(Math.max(0, summary.estimatedPayout ?? 0));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentCycleEstPayout(Math.max(0, currentCycleCard.netPayout));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token, currentCycleCard]);

  const withdrawableBalance = getWithdrawableBalance(wallet);
  const walletFrozen = Boolean(wallet?.isFrozen);
  const maxWithdrawalLimit = getMaxWithdrawalLimit(withdrawableBalance);
  const withdrawalInputEnabled = maxWithdrawalLimit >= MIN_WITHDRAWAL && !withdrawing && !walletFrozen;

  const selectTxFilter = (key: TxFilter) => {
    setTxFilter((prev) => (prev === key && key !== "all" ? "all" : key));
  };

  const handleWithdrawAmountChange = (raw: string) => {
    if (raw === "") { setWithdrawAmount(""); return; }
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    const cap = getMaxWithdrawalLimit(getWithdrawableBalance(wallet));
    if (num > cap) { setWithdrawAmount(formatWithdrawalInputAmount(cap)); return; }
    setWithdrawAmount(raw);
  };

  const openWithdraw = async () => {
    if (wallet?.isFrozen) {
      Alert.alert(
        "Wallet Frozen",
        wallet.freezeReason
          ? `Withdrawals are currently disabled.\nReason: ${wallet.freezeReason}`
          : "Withdrawals are currently disabled.",
      );
      return;
    }
    if (!storeId || !token) return;
    const limit = getMaxWithdrawalLimit(getWithdrawableBalance(wallet));
    setWithdrawAmount(limit >= MIN_WITHDRAWAL ? formatWithdrawalInputAmount(limit) : "");
    setShowWithdraw(true);
    setBankPickerOpen(false);
    setBanksLoading(true);
    try {
      const b = await listBankAccounts(storeId, token);
      setBanks(b.filter((a) => !a.is_disabled));
      const primary = b.find((a) => a.is_primary && !a.is_disabled);
      if (primary) setWithdrawBankId(primary.id);
    } catch { /* */ }
    finally { setBanksLoading(false); }
  };

  const handleWithdraw = async () => {
    if (wallet?.isFrozen) {
      Alert.alert(
        "Wallet Frozen",
        wallet.freezeReason
          ? `Withdrawals are currently disabled.\nReason: ${wallet.freezeReason}`
          : "Withdrawals are currently disabled.",
      );
      return;
    }
    if (!storeId || !token || !withdrawBankId) return;
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < MIN_WITHDRAWAL) { Alert.alert("Invalid", `Min ₹${MIN_WITHDRAWAL}`); return; }
    if (amt > getMaxWithdrawalLimit(getWithdrawableBalance(wallet))) {
      Alert.alert("Invalid", "Amount exceeds available balance or ₹1,00,000 limit");
      return;
    }
    setWithdrawing(true);
    try {
      await createPayoutRequest(storeId, amt, withdrawBankId, token);
      const amountLabel = formatCurrency(amt);
      setShowWithdraw(false);
      setWithdrawAmount("");
      setSuccessSheet({ amountLabel });
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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => load(true)}
      tintColor={GatiMitraMerchant.primary}
    />
  );

  const renderCurrentCycleCard = () => {
    if (!currentCycleCard) return null;
    const periodLabel = formatPeriodRange(
      currentCycleCard.periodStart,
      currentCycleCard.periodEnd,
    );
    const cycleBadge = statusBadgeStyle(currentCycleCard.status);
    const displayEstPayout = currentCycleEstPayout ?? currentCycleCard.netPayout;
    return (
      <View style={s.currentCycleWrap}>
        {walletFrozen ? (
          <View style={s.frozenBanner}>
            <Text style={s.frozenTitle}>Wallet Frozen</Text>
            <Text style={s.frozenBody}>Withdrawals are currently disabled.</Text>
            {wallet?.freezeReason ? (
              <Text style={s.frozenReason}>Reason: {wallet.freezeReason}</Text>
            ) : null}
          </View>
        ) : null}
        <View style={s.cycleRow}>
          <Pressable
            onPress={() => setCycleExpanded((v) => !v)}
            style={({ pressed }) => [s.cycleRowLeft, s.cycleTitlePress, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <View style={s.cycleTitleRow}>
              <View style={s.cycleWalletIconWrap}>
                <Ionicons name="wallet-outline" size={16} color={GatiMitraMerchant.primary} />
              </View>
              <Text style={s.cycleSectionLabel}>Current cycle</Text>
            </View>
          </Pressable>
          <View style={[s.statusBadge, { backgroundColor: cycleBadge.bg }]}>
            <Text style={[s.statusBadgeText, { color: cycleBadge.text }]}>
              {statusLabel(currentCycleCard.status)}
            </Text>
          </View>
        </View>

        <View style={s.cycleRow}>
          <Pressable
            onPress={() => setCycleExpanded((v) => !v)}
            style={({ pressed }) => [s.cycleRowLeft, pressed && s.pressed]}
          >
            <Text style={s.payoutAmount}>
              {formatCurrency(withdrawableBalance)}
            </Text>
            <Text style={s.cycleMetricLabel}>Wallet balance</Text>
            <Text style={s.payoutOrders}>
              Est. cycle payout · {formatCurrency(displayEstPayout)}
            </Text>
            {cycleExpanded ? (
              <>
                <Text style={s.payoutOrders}>
                  Total orders · {currentCycleCard.orderCount}
                </Text>
              </>
            ) : null}
          </Pressable>
          <Pressable
            onPress={openWithdraw}
            disabled={walletFrozen}
            style={({ pressed }) => [
              s.cardWithdrawBtn,
              walletFrozen && s.cardWithdrawBtnDisabled,
              pressed && !walletFrozen && s.pressed,
            ]}
          >
            <Text style={[s.cardWithdrawBtnText, walletFrozen && s.cardWithdrawBtnTextDisabled]}>
              {walletFrozen ? "Frozen" : "Withdraw"}
            </Text>
            {!walletFrozen ? (
              <Ionicons name="chevron-forward" size={14} color={GatiMitraMerchant.navy} />
            ) : null}
          </Pressable>
        </View>

        <View style={[s.cycleRow, s.cycleRowLast]}>
          <View style={s.cycleRowLeft}>
            <Text style={s.payoutFieldLabel}>Payout for</Text>
            <Text style={s.payoutDateValue}>{periodLabel}</Text>
          </View>
          <Pressable
            onPress={() => router.push({
              pathname: "/(tabs)/earnings/payout/[id]",
              params: payoutCardToParams(currentCycleCard),
            })}
            style={({ pressed }) => [s.cycleViewDetailsBtn, pressed && s.pressed]}
          >
            <Text style={s.viewDetailsText}>View details</Text>
            <Ionicons name="chevron-forward" size={16} color="#2563EB" />
          </Pressable>
        </View>

        {payoutSummary ? (
          <View style={s.payoutStatusStrip}>
            <Text style={s.payoutStatusItem}>Paid {formatCurrency(payoutSummary.paid)}</Text>
            <Text style={s.payoutStatusItem}>Pending {formatCurrency(payoutSummary.pending)}</Text>
            <Text style={s.payoutStatusItem}>In process {formatCurrency(payoutSummary.in_process)}</Text>
            <Text style={s.payoutStatusItem}>Returned {formatCurrency(payoutSummary.failed)}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderTabBar = () => (
    <View style={s.stickyTabBar}>
      <View style={s.tabRow}>
        <Pressable onPress={() => setActiveTab("payouts")} style={[s.tabBtn, activeTab === "payouts" && s.tabBtnActive]}>
          <Text style={[s.tabBtnText, activeTab === "payouts" && s.tabBtnTextActive]}>Payouts</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("transactions")} style={[s.tabBtn, activeTab === "transactions" && s.tabBtnActive]}>
          <Text style={[s.tabBtnText, activeTab === "transactions" && s.tabBtnTextActive]}>Transactions</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderFilterChips = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
      {TX_FILTER_CHIPS.map((chip) => (
        <Pressable
          key={chip.key}
          onPress={() => selectTxFilter(chip.key)}
          style={[s.chip, txFilter === chip.key && s.chipActive]}
        >
          <Text style={[s.chipText, txFilter === chip.key && s.chipTextActive]}>{chip.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const renderLedgerEntry = (entry: LedgerEntry) => {
    const amountDisplay = resolveLedgerDisplayAmount(entry);
    const when = timeAgo(entry.created_at);
    const displayDesc = resolveLedgerDisplayDescription(entry);
    return (
      <View style={s.txRow}>
        <View style={s.txMain}>
          <Text style={s.txCategory}>{resolveLedgerCategoryLabel(entry)}</Text>
          {displayDesc ? (
            <Text style={s.txDesc} numberOfLines={3}>{displayDesc}</Text>
          ) : null}
          {when ? <Text style={s.txTime}>{when}</Text> : null}
        </View>
        <LedgerEntryAmount display={amountDisplay} />
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.fixedHeader}>
        {renderCurrentCycleCard()}
        {renderTabBar()}
        {activeTab === "transactions" ? renderFilterChips() : null}
      </View>

      {loading && !wallet ? (
        <View style={s.loadingBlock}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : activeTab === "payouts" ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: scrollBottom }]}
          refreshControl={refreshControl}
        >
          {pastPayoutCards.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="receipt-outline" size={32} color={GatiMitraMerchant.textTertiary} />
              <Text style={s.emptyTitle}>No past payouts</Text>
              <Text style={s.emptyText}>Withdrawals and past cycles will appear here.</Text>
            </View>
          ) : (
            <>
            {settledPayoutCards.length > 0 ? (
            <View style={s.payoutList}>
              {settledPayoutCards.map((card, idx) => {
                const badge = statusBadgeStyle(card.status);
                const periodLabel = formatPeriodRange(card.periodStart, card.periodEnd);
                return (
                  <View key={card.id} style={[s.pastPayoutCard, idx > 0 && s.payoutCardBorder]}>
                    <View style={s.payoutTopRow}>
                      <View style={s.payoutCol}>
                        <Text style={s.payoutFieldLabel}>Net payout</Text>
                        <Text style={s.payoutAmount}>{formatCurrency(card.netPayout)}</Text>
                        {payoutReturnedDisplayAmount(card) > 0 ? (
                          <Text style={s.payoutRejectedLine}>
                            {formatCurrency(payoutReturnedDisplayAmount(card))} rejected ·
                            returned to wallet
                          </Text>
                        ) : null}
                      </View>
                      <View style={[s.payoutCol, s.payoutColRight]}>
                        <Text style={s.payoutFieldLabel}>Status</Text>
                        <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[s.statusBadgeText, { color: badge.text }]}>
                            {statusLabel(card.status)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.payoutMidRow}>
                      <View style={s.payoutCol}>
                        <Text style={s.payoutFieldLabel}>Payout for</Text>
                        <Text style={s.payoutDateValue}>{periodLabel}</Text>
                      </View>
                      <View style={[s.payoutCol, s.payoutColRight]}>
                        <Text style={s.payoutFieldLabel}>Payout date</Text>
                        <Text style={s.payoutDateValue}>
                          {card.payoutDate ? formatShortDate(card.payoutDate) : "—"}
                        </Text>
                      </View>
                    </View>
                    {card.closeNote ? (
                      <Text style={s.payoutNoteLine} numberOfLines={3}>
                        Reason: {card.closeNote}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        const detailCard =
                          card.payoutRequestId != null && currentCycleCard
                            ? { ...currentCycleCard, netPayout: card.netPayout, status: card.status }
                            : card;
                        router.push({
                          pathname: "/(tabs)/earnings/payout/[id]",
                          params: payoutCardToParams(detailCard),
                        });
                      }}
                      style={({ pressed }) => [s.viewDetailsBtn, pressed && s.pressed]}
                    >
                      <Text style={s.viewDetailsText}>View details</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2563EB" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            ) : null}

            {returnedOnlyCards.length > 0 ? (
              <View style={s.returnedGroup}>
                <Text style={s.returnedGroupTitle}>Returned withdrawals</Text>
                <Text style={s.returnedGroupHint}>
                  No orders settled in these cycles — the withdrawal came back to your wallet.
                </Text>
                {returnedOnlyCards.map((card, idx) => (
                  <Pressable
                    key={card.id}
                    onPress={() => router.push({
                      pathname: "/(tabs)/earnings/payout/[id]",
                      params: payoutCardToParams(card),
                    })}
                    style={({ pressed }) => [
                      s.returnedRow,
                      idx > 0 && s.returnedRowBorder,
                      pressed && s.pressed,
                    ]}
                  >
                    <View style={s.returnedRowIcon}>
                      <Ionicons name="return-down-back" size={16} color="#B45309" />
                    </View>
                    <View style={s.returnedRowMain}>
                      <Text style={s.returnedRowTitle}>
                        {formatCurrency(payoutReturnedDisplayAmount(card))} returned
                      </Text>
                      <Text style={s.returnedRowMeta}>
                        {card.payoutDate ? formatShortDate(card.payoutDate) : "—"}
                        {card.closeNote ? ` · ${card.closeNote}` : ""}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={GatiMitraMerchant.textTertiary}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
            </>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={ledger}
          keyExtractor={(entry) => String(entry.id)}
          renderItem={({ item }) => renderLedgerEntry(item)}
          style={s.scroll}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: scrollBottom },
            ledger.length > 0 ? s.txList : s.emptyListContent,
          ]}
          ListEmptyComponent={(
            <View style={s.emptyCard}>
              <Text style={s.emptyTitle}>No transactions</Text>
              <Text style={s.emptyText}>Order earnings and withdrawals will show here.</Text>
            </View>
          )}
          refreshControl={refreshControl}
        />
      )}

      <Modal visible={showWithdraw} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Withdraw</Text>
                <Text style={s.modalSub}>Available {formatCurrency(withdrawableBalance)}</Text>
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
            {withdrawalInputEnabled && withdrawAmount.trim() !== "" && !isNaN(parseFloat(withdrawAmount)) && parseFloat(withdrawAmount) >= MIN_WITHDRAWAL ? (
              <Text style={s.receiveHint}>You receive: {formatCurrency(parseFloat(withdrawAmount))}</Text>
            ) : (
              <Text style={s.hintMuted}>Min ₹{MIN_WITHDRAWAL} · Max {formatCurrency(maxWithdrawalLimit)}</Text>
            )}
            <Text style={s.inputLabel}>Bank account</Text>
            {banksLoading ? (
              <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
            ) : banks.length === 0 ? (
              <Text style={s.hintMuted}>No bank accounts. Add one from Profile.</Text>
            ) : banks.length > 1 ? (
              <View>
                <Pressable onPress={() => setBankPickerOpen((v) => !v)} style={({ pressed }) => [s.bankTrigger, pressed && s.pressed]}>
                  <Text style={s.bankTriggerText} numberOfLines={2}>
                    {withdrawBankId != null
                      ? bankAccountLabel(banks.find((b) => b.id === withdrawBankId) ?? banks[0])
                      : "Select bank account"}
                  </Text>
                  <Ionicons name={bankPickerOpen ? "chevron-up" : "chevron-down"} size={18} color={GatiMitraMerchant.textSecondary} />
                </Pressable>
                {bankPickerOpen && banks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => { setWithdrawBankId(b.id); setBankPickerOpen(false); }}
                    style={[s.bankItem, withdrawBankId === b.id && s.bankItemActive]}
                  >
                    <Text style={s.bankItemText} numberOfLines={2}>{bankAccountLabel(b)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={s.bankSingle}>
                <Text style={s.bankSingleName}>{banks[0]?.account_holder_name}</Text>
                <Text style={s.hintMuted}>{banks[0]?.account_number_masked ?? "****"}</Text>
              </View>
            )}
            <Text style={s.hintMuted}>Funds arrive within 24 to 48 hrs</Text>
            <Pressable
              onPress={handleWithdraw}
              disabled={
                withdrawing || !withdrawBankId || !withdrawalInputEnabled ||
                !withdrawAmount || parseFloat(withdrawAmount) < MIN_WITHDRAWAL ||
                parseFloat(withdrawAmount) > maxWithdrawalLimit
              }
              style={({ pressed }) => [
                s.confirmBtn,
                (withdrawing || !withdrawBankId || !withdrawalInputEnabled) && s.confirmBtnDisabled,
                pressed && s.pressed,
              ]}
            >
              {withdrawing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmBtnText}>Withdraw</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <WithdrawalSuccessSheet
        visible={successSheet != null}
        amountLabel={successSheet?.amountLabel ?? ""}
        onClose={() => setSuccessSheet(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  fixedHeader: {
    backgroundColor: "#FAFAFA",
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    zIndex: 10,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PADDING },
  emptyListContent: { flexGrow: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  loadingBlock: { paddingVertical: 48, alignItems: "center" },
  pressed: { opacity: 0.85 },
  currentCycleWrap: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    marginBottom: 14,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  cycleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cycleRowLast: {
    marginBottom: 0,
    alignItems: "flex-end",
  },
  payoutStatusStrip: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  payoutStatusItem: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    marginRight: 8,
  },
  cycleRowLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  cycleTitlePress: {
    alignSelf: "flex-start",
  },
  cycleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cycleWalletIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  cycleMetricLabel: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  pastPayoutCard: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  payoutCardBorder: { borderTopWidth: 1, borderTopColor: "#EEEEEE" },
  stickyTabBar: {
    backgroundColor: "#FAFAFA",
    paddingBottom: 12,
    zIndex: 10,
  },
  tabRow: { flexDirection: "row", backgroundColor: "#EFEFEF", borderRadius: 10, padding: 4, overflow: "visible" },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  tabBtnActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  tabBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  tabBtnTextActive: { color: GatiMitraMerchant.textPrimary, fontWeight: "700" },
  payoutList: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE", overflow: "hidden" },
  cycleSectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  payoutTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  payoutMidRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  payoutCol: { flex: 1 },
  payoutColRight: { alignItems: "flex-end" },
  payoutFieldLabel: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginBottom: 2 },
  payoutAmount: { fontSize: 26, fontWeight: "700", color: GatiMitraMerchant.textPrimary, letterSpacing: -0.5 },
  payoutOrders: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  payoutNoteLine: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 17,
    marginBottom: 2,
  },
  payoutRejectedLine: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
    lineHeight: 17,
    marginTop: 3,
  },
  returnedGroup: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  returnedGroupTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  returnedGroupHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 6,
  },
  returnedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  returnedRowBorder: { borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  returnedRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF3C7",
  },
  returnedRowMain: { flex: 1 },
  returnedRowTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  returnedRowMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 1 },
  payoutDateValue: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary, marginTop: 2 },
  cardWithdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.navy,
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  cardWithdrawBtnText: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.navy },
  cardWithdrawBtnDisabled: {
    borderColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
  },
  cardWithdrawBtnTextDisabled: { color: "#9CA3AF" },
  frozenBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  frozenTitle: { fontSize: 14, fontWeight: "800", color: "#991B1B" },
  frozenBody: { fontSize: 12, color: "#7F1D1D", marginTop: 2 },
  frozenReason: { fontSize: 12, color: "#7F1D1D", marginTop: 4, fontWeight: "600" },
  cycleViewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingVertical: 2,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  viewDetailsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F0F0F0", marginTop: 8,
  },
  viewDetailsText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  emptyCard: {
    alignItems: "center", padding: 36, backgroundColor: "#fff", borderRadius: 12,
    borderWidth: 1, borderColor: "#EEEEEE", gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  emptyText: { fontSize: 13, color: GatiMitraMerchant.textTertiary, textAlign: "center", lineHeight: 18 },
  filterScroll: { gap: 8, marginBottom: 12, paddingRight: 8, paddingLeft: 0 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
    backgroundColor: "#fff", borderWidth: 1, borderColor: GatiMitraMerchant.border,
  },
  chipActive: { backgroundColor: GatiMitraMerchant.navy, borderColor: GatiMitraMerchant.navy, borderRadius: 99 },
  chipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  chipTextActive: { color: "#fff" },
  txList: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE", overflow: "hidden" },
  txRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },
  txMain: { flex: 1, marginRight: 12 },
  txCategory: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  txDesc: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  txTime: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 3 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  modalSub: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  inputLabel: {
    fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase", marginTop: 8, marginBottom: 6,
  },
  input: {
    borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    color: GatiMitraMerchant.textPrimary, backgroundColor: "#FAFAFA",
  },
  inputDisabled: { backgroundColor: "#f1f5f9", color: GatiMitraMerchant.textTertiary },
  receiveHint: { fontSize: 12, color: "#16a34a", fontWeight: "600", marginTop: 6 },
  hintMuted: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 6, marginBottom: 4 },
  bankTrigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, padding: 12, backgroundColor: "#FAFAFA",
  },
  bankTriggerText: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  bankItem: { padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 10, marginTop: 6 },
  bankItemActive: { backgroundColor: "#F0FDF9", borderColor: GatiMitraMerchant.primary },
  bankItemText: { fontSize: 12, color: GatiMitraMerchant.textPrimary },
  bankSingle: { borderWidth: 1, borderColor: "#86efac", backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12 },
  bankSingleName: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  confirmBtn: { marginTop: 16, paddingVertical: 15, borderRadius: 12, backgroundColor: GatiMitraMerchant.navy, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
