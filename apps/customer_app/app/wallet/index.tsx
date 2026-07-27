/**
 * GatiCash — wallet balance and transaction history (Zomato Money reference UI).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { safeRouterBack, PROFILE_TAB_FALLBACK } from "@/lib/safeRouterBack";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { GatiCashWalletHeader } from "@/components/wallet/GatiCashWalletHeader";
import { GatiCashWalletHeroIcon } from "@/components/wallet/GatiCashWalletHeroIcon";
import { GatiCashTopupSuccessSheet } from "@/components/wallet/GatiCashTopupSuccessSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  walletService,
  type WalletTransaction,
  type WalletTxFilter,
} from "@/services/wallet.service";

const PAGE_BG = "#F4F5F7";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const ACCENT = GatiMitraColors.primaryMint;
const ACCENT_SOFT = "#ECFDF5";

const FILTERS: { id: WalletTxFilter; label: string }[] = [
  { id: "all", label: "All Transactions" },
  { id: "additions", label: "Additions" },
  { id: "deductions", label: "Deductions" },
  { id: "refunds", label: "Refunds" },
  { id: "expired", label: "Expired" },
];

function formatTxDate(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString("en-IN", { month: "short" });
    const year = d.getFullYear();
    return `${day} ${month}, ${year}`;
  } catch {
    return iso;
  }
}

function txIcon(type: WalletTransaction["type"]): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  if (type === "credit" || type === "bonus" || type === "cashback") {
    return { name: "cash-outline", color: "#15803D", bg: "#DCFCE7" };
  }
  if (type === "refund") {
    return { name: "refresh-circle-outline", color: "#2563EB", bg: "#EFF6FF" };
  }
  if (type === "expired") {
    return { name: "wallet-outline", color: "#9CA3AF", bg: "#F3F4F6" };
  }
  return { name: "bag-handle-outline", color: "#92400E", bg: "#FEF3C7" };
}

function unlockedOfferTxLines(tx: WalletTransaction): { title: string; offerName: string | null } {
  if (tx.reference_type !== "missed_offer_compensation") {
    return { title: tx.title, offerName: null };
  }
  if (tx.title === "Unlocked offer Credit") {
    return { title: tx.title, offerName: tx.description?.trim() || null };
  }
  return { title: "Unlocked offer Credit", offerName: tx.title.trim() || tx.description?.trim() || null };
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const icon = txIcon(tx.type);
  const isCredit = tx.amount >= 0;
  const amountStr = `${isCredit ? "+" : "−"} ₹${Math.abs(tx.amount).toFixed(2)}`;
  const { title, offerName } = unlockedOfferTxLines(tx);

  return (
    <View style={styles.txCard}>
      <View style={[styles.txIconWrap, { backgroundColor: icon.bg }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.txBody}>
        <AppText style={styles.txTitle} numberOfLines={2}>
          {title}
        </AppText>
        {offerName ? (
          <AppText style={styles.txSubtitle} numberOfLines={2}>
            {offerName}
          </AppText>
        ) : null}
        <AppText style={styles.txDate}>{formatTxDate(tx.created_at)}</AppText>
      </View>
      <AppText style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
        {amountStr}
      </AppText>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    topupAmount?: string | string[];
    balanceAfter?: string | string[];
  }>();
  const [filter, setFilter] = useState<WalletTxFilter>("all");
  const [topupSuccess, setTopupSuccess] = useState<{
    amount: number;
    balanceAfter: number | null;
  } | null>(null);
  const handledTopupKeyRef = useRef<string | null>(null);

  const balanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
  });

  const txQ = useQuery({
    queryKey: ["wallet", "transactions", filter],
    queryFn: () => walletService.getTransactions({ filter, limit: 50 }),
  });

  useEffect(() => {
    const rawAmount = Array.isArray(params.topupAmount)
      ? params.topupAmount[0]
      : params.topupAmount;
    if (rawAmount == null || rawAmount === "") return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const rawBalance = Array.isArray(params.balanceAfter)
      ? params.balanceAfter[0]
      : params.balanceAfter;
    const balanceAfter =
      rawBalance != null && rawBalance !== "" && Number.isFinite(Number(rawBalance))
        ? Number(rawBalance)
        : null;

    const key = `${amount}:${balanceAfter ?? ""}`;
    if (handledTopupKeyRef.current === key) return;
    handledTopupKeyRef.current = key;

    setTopupSuccess({ amount, balanceAfter });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    router.setParams({ topupAmount: "", balanceAfter: "" });
  }, [params.topupAmount, params.balanceAfter, queryClient, router]);

  const balance = balanceQ.data?.available_balance ?? balanceQ.data?.balance ?? 0;
  const transactions = txQ.data?.transactions ?? [];
  const loading = balanceQ.isLoading || txQ.isLoading;
  const refreshing = (balanceQ.isFetching || txQ.isFetching) && !loading;

  const onRefresh = useCallback(() => {
    void balanceQ.refetch();
    void txQ.refetch();
  }, [balanceQ, txQ]);

  const handleAddMoney = useCallback(() => {
    router.push("/wallet/add-money");
  }, [router]);

  const closeTopupSuccess = useCallback(() => {
    setTopupSuccess(null);
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  }, [queryClient]);

  const lockedNote = useMemo(() => {
    const locked = balanceQ.data?.locked_amount ?? 0;
    if (locked <= 0) return null;
    return `₹${locked.toFixed(2)} locked for active orders`;
  }, [balanceQ.data?.locked_amount]);

  const balanceDisplay = balanceQ.isLoading
    ? null
    : `₹${balance.toFixed(balance % 1 === 0 ? 0 : 2)}`;

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.screen}>
        <GatiCashWalletHeader
          onBack={() => safeRouterBack(router, PROFILE_TAB_FALLBACK)}
          onSettings={() => router.push("/wallet/settings")}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
          }
        >
          {/* White hero — reference top section */}
          <View style={styles.heroWhite}>
            <GatiCashWalletHeroIcon />

            <AppText style={styles.balanceLabel}>YOUR BALANCE</AppText>
            {balanceQ.isLoading ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 10 }} />
            ) : (
              <AppText style={styles.balanceAmount}>{balanceDisplay}</AppText>
            )}
            {lockedNote ? <AppText style={styles.lockedNote}>{lockedNote}</AppText> : null}

            <TouchableOpacity style={styles.addMoneyBtn} activeOpacity={0.88} onPress={handleAddMoney}>
              <AppText style={styles.addMoneyText}>Add money</AppText>
            </TouchableOpacity>
          </View>

          {/* Grey transaction section — reference bottom */}
          <View style={styles.historyGrey}>
            <AppText style={styles.sectionTitle}>TRANSACTION HISTORY</AppText>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersWrap}
              style={styles.filtersScroll}
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    activeOpacity={0.85}
                  >
                    <AppText style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {f.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.txList}>
              {loading ? (
                <ActivityIndicator color={ACCENT} style={{ marginTop: 28 }} />
              ) : transactions.length === 0 ? (
                <View style={styles.emptyTx}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="receipt-outline" size={32} color="#CBD5E1" />
                  </View>
                  <AppText style={styles.emptyTxTitle}>No transactions yet</AppText>
                  <AppText style={styles.emptyTxText}>
                    Refunds, cashback, and wallet credits will show up here.
                  </AppText>
                </View>
              ) : (
                transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </View>
          </View>
        </ScrollView>
      </View>

      <GatiCashTopupSuccessSheet
        visible={topupSuccess != null}
        amount={topupSuccess?.amount ?? 0}
        balanceAfter={topupSuccess?.balanceAfter}
        onClose={closeTopupSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  scroll: { flex: 1 },
  heroWhite: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  historyGrey: {
    backgroundColor: PAGE_BG,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    flexGrow: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: TEXT,
    marginTop: 6,
    marginBottom: 0,
    letterSpacing: -1.2,
    lineHeight: 46,
  },
  lockedNote: {
    fontSize: 12,
    color: MUTED,
    marginTop: 6,
    textAlign: "center",
  },
  addMoneyBtn: {
    alignSelf: "stretch",
    marginTop: 10,
    backgroundColor: ACCENT,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addMoneyText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 1.2,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  filtersScroll: {
    marginHorizontal: -16,
    marginBottom: 6,
  },
  filtersWrap: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    paddingBottom: 14,
  },
  filterChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: {
    backgroundColor: ACCENT_SOFT,
    borderColor: ACCENT,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
  },
  filterChipTextActive: {
    color: "#15803D",
  },
  txList: { gap: 10 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  txIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  txBody: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
  },
  txSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginTop: 2,
  },
  txDate: {
    fontSize: 13,
    color: MUTED,
    marginTop: 3,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },
  txAmountCredit: {
    color: "#15803D",
  },
  txAmountDebit: {
    color: GatiMitraColors.closedRed,
  },
  emptyTx: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTxTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    marginTop: 14,
  },
  emptyTxText: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
});
