/**
 * GatiMitra Money — wallet balance and transaction history (live API).
 */

import { useCallback, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import {
  walletService,
  type WalletTransaction,
  type WalletTxFilter,
} from "@/services/wallet.service";

const { green: GREEN, greenDark: GREEN_DARK, text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG } =
  ProfileTheme;

const FILTERS: { id: WalletTxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "additions", label: "Added" },
  { id: "deductions", label: "Spent" },
  { id: "refunds", label: "Refunds" },
  { id: "expired", label: "Expired" },
];

function formatTxDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function txIcon(type: WalletTransaction["type"]): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  if (type === "credit" || type === "bonus" || type === "cashback") {
    return { name: "add-circle", color: GREEN_DARK, bg: ProfileTheme.mintSoft };
  }
  if (type === "refund") return { name: "refresh-circle", color: "#2563EB", bg: "#EFF6FF" };
  if (type === "expired") return { name: "time-outline", color: MUTED, bg: PAGE_BG };
  return { name: "bag-outline", color: "#64748B", bg: "#F8FAFC" };
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const icon = txIcon(tx.type);
  const isCredit = tx.amount >= 0;
  return (
    <View style={styles.txCard}>
      <View style={[styles.txIconWrap, { backgroundColor: icon.bg }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.txBody}>
        <Text style={styles.txTitle} numberOfLines={1}>{tx.title}</Text>
        <Text style={styles.txDate}>{formatTxDate(tx.created_at)}</Text>
      </View>
      <Text style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
        {isCredit ? "+" : "−"} ₹{Math.abs(tx.amount).toFixed(2)}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<WalletTxFilter>("all");

  const balanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
  });

  const txQ = useQuery({
    queryKey: ["wallet", "transactions", filter],
    queryFn: () => walletService.getTransactions({ filter, limit: 50 }),
  });

  const balance = balanceQ.data?.available_balance ?? balanceQ.data?.balance ?? 0;
  const transactions = txQ.data?.transactions ?? [];
  const loading = balanceQ.isLoading || txQ.isLoading;
  const refreshing = (balanceQ.isFetching || txQ.isFetching) && !loading;

  const onRefresh = useCallback(() => {
    void balanceQ.refetch();
    void txQ.refetch();
  }, [balanceQ, txQ]);

  const handleAddMoney = useCallback(() => {
    Alert.alert(
      "Add money",
      "Wallet top-up will be available soon. Your refunds and cashback will appear here automatically.",
      [{ text: "OK" }]
    );
  }, []);

  const lockedNote = useMemo(() => {
    const locked = balanceQ.data?.locked_amount ?? 0;
    if (locked <= 0) return null;
    return `₹${locked.toFixed(2)} locked for active orders`;
  }, [balanceQ.data?.locked_amount]);

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.screen}>
        <ProfileSubpageHeader
          title="GatiMitra Money"
          onBack={() => router.back()}
          rightAction={{ icon: "settings-outline", onPress: () => router.push("/profile/settings") }}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
          }
        >
          <View style={styles.balanceCard}>
            <View style={styles.balanceTopRow}>
              <View style={styles.balanceIconWrap}>
                <Ionicons name="wallet-outline" size={18} color={GREEN_DARK} />
              </View>
              <Text style={styles.balanceLabel}>Available balance</Text>
            </View>
            {balanceQ.isLoading ? (
              <ActivityIndicator color={GREEN} style={{ marginTop: 12, alignSelf: "flex-start" }} />
            ) : (
              <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
            )}
            {lockedNote ? <Text style={styles.lockedNote}>{lockedNote}</Text> : null}
            <TouchableOpacity style={styles.addMoneyBtn} activeOpacity={0.9} onPress={handleAddMoney}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addMoneyText}>Add money</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Transaction history</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersWrap}
            style={styles.filtersScroll}
          >
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.txList}>
            {loading ? (
              <ActivityIndicator color={GREEN} style={{ marginTop: 24 }} />
            ) : transactions.length === 0 ? (
              <View style={styles.emptyTx}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyTxTitle}>No transactions yet</Text>
                <Text style={styles.emptyTxText}>
                  Refunds, cashback, and wallet credits will show up here.
                </Text>
              </View>
            ) : (
              transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
            )}
          </View>

          <BrandingFooter />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  balanceCard: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  balanceTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProfileTheme.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceLabel: { flex: 1, fontSize: 12, fontWeight: "600", color: MUTED },
  balanceAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: GREEN_DARK,
    marginTop: 10,
    letterSpacing: -0.5,
  },
  lockedNote: { fontSize: 12, color: MUTED, marginTop: 6 },
  addMoneyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: GREEN,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addMoneyText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginTop: 18,
    marginBottom: 10,
  },
  filtersScroll: { marginHorizontal: -16, marginBottom: 4 },
  filtersWrap: { paddingHorizontal: 16, gap: 8, flexDirection: "row", paddingBottom: 12 },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: ProfileTheme.mintSoft, borderColor: GREEN },
  filterChipText: { fontSize: 13, fontWeight: "600", color: MUTED },
  filterChipTextActive: { color: GREEN_DARK },
  txList: { gap: 10 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  txBody: { flex: 1, marginLeft: 12 },
  txTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  txDate: { fontSize: 12, color: MUTED, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "800" },
  txAmountCredit: { color: GREEN_DARK },
  txAmountDebit: { color: TEXT },
  emptyTx: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 },
  emptyTxTitle: { fontSize: 16, fontWeight: "700", color: TEXT, marginTop: 12 },
  emptyTxText: { fontSize: 13, color: MUTED, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
