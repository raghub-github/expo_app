/**
 * GatiMitra Money – wallet balance and transaction history.
 * Design aligned with reference; GatiMitra teal/mint branding.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";

const TEAL = "#14b8a6";
const TEAL_DARK = "#0d9488";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";
const BORDER = "#E8E8E8";
const PAD = 20;
const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

type TxFilter = "all" | "additions" | "deductions" | "refunds" | "expired";

const FILTERS: { id: TxFilter; label: string }[] = [
  { id: "all", label: "All Transactions" },
  { id: "additions", label: "Additions" },
  { id: "deductions", label: "Deductions" },
  { id: "refunds", label: "Refunds" },
  { id: "expired", label: "Expired" },
];

type TxType = "credit" | "debit" | "expired";

const MOCK_TRANSACTIONS = [
  { id: "1", type: "expired" as TxType, title: "Expired", date: "17 May, 2024", amount: -25 },
  { id: "2", type: "credit" as TxType, title: "Credit balance added", date: "11 May, 2024", amount: 25 },
  { id: "3", type: "debit" as TxType, title: "Order Debit", date: "10 May, 2024", amount: -264.25 },
  { id: "4", type: "credit" as TxType, title: "Refund", date: "8 May, 2024", amount: 120 },
];

function TransactionRow({
  type,
  title,
  date,
  amount,
}: {
  type: TxType;
  title: string;
  date: string;
  amount: number;
}) {
  const isCredit = amount >= 0;
  const iconName =
    type === "credit"
      ? "add-circle"
      : type === "expired"
        ? "time-outline"
        : "bag-outline";
  const iconColor = type === "credit" ? TEAL : type === "expired" ? TEXT_GRAY : "#64748b";

  return (
    <View style={[styles.txCard, SHADOW]}>
      <View style={styles.txIconWrap}>
        <Ionicons name={iconName as any} size={24} color={iconColor} />
      </View>
      <View style={styles.txBody}>
        <Text style={styles.txTitle}>{title}</Text>
        <Text style={styles.txDate}>{date}</Text>
      </View>
      <Text style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
        {isCredit ? "+" : ""} ₹{Math.abs(amount).toFixed(2)}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TxFilter>("all");

  const balance = 0; // could come from API

  const filteredTx = MOCK_TRANSACTIONS.filter((tx) => {
    if (filter === "all") return true;
    if (filter === "additions") return tx.amount > 0 && tx.type !== "expired";
    if (filter === "deductions") return tx.amount < 0 && tx.type === "debit";
    if (filter === "refunds") return tx.amount > 0 && tx.title.toLowerCase().includes("refund");
    if (filter === "expired") return tx.type === "expired";
    return true;
  });

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GatiMitra Money</Text>
        <TouchableOpacity style={styles.settingsBtn} hitSlop={12}>
          <Ionicons name="settings-outline" size={22} color={TITLE_DARK} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance section */}
        <View style={styles.balanceSection}>
          <View style={styles.walletIconWrap}>
            <Ionicons name="wallet" size={48} color={TEAL} />
          </View>
          <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
          <Text style={styles.balanceAmount}>₹{balance.toFixed(0)}</Text>
          <TouchableOpacity
            style={styles.addMoneyBtn}
            activeOpacity={0.9}
            onPress={() => {}}
          >
            <Text style={styles.addMoneyText}>Add money</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction history */}
        <Text style={styles.sectionTitle}>TRANSACTION HISTORY</Text>
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
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.txList}>
          {filteredTx.length === 0 ? (
            <View style={styles.emptyTx}>
              <Ionicons name="receipt-outline" size={40} color={BORDER} />
              <Text style={styles.emptyTxText}>No transactions in this category</Text>
            </View>
          ) : (
            filteredTx.map((tx) => (
              <TransactionRow
                key={tx.id}
                type={tx.type}
                title={tx.title}
                date={tx.date}
                amount={tx.amount}
              />
            ))
          )}
        </View>

        <BrandingFooter />
      </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    paddingVertical: 14,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  settingsBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD },
  balanceSection: {
    alignItems: "center",
    paddingVertical: 28,
  },
  walletIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: TITLE_DARK,
    marginTop: 6,
  },
  addMoneyBtn: {
    marginTop: 20,
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
    minWidth: 200,
    alignItems: "center",
  },
  addMoneyText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  filtersScroll: { marginHorizontal: -PAD },
  filtersWrap: {
    paddingHorizontal: PAD,
    paddingBottom: 16,
    gap: 10,
    flexDirection: "row",
  },
  filterChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#E8E8E8",
    borderRadius: 12,
  },
  filterChipActive: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: TEAL,
  },
  filterChipText: { fontSize: 14, fontWeight: "600", color: TEXT_GRAY },
  filterChipTextActive: { color: TEAL },
  txList: { gap: 10 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  txIconWrap: { width: 40, alignItems: "center" },
  txBody: { flex: 1, marginLeft: 12 },
  txTitle: { fontSize: 15, fontWeight: "600", color: TITLE_DARK },
  txDate: { fontSize: 12, color: TEXT_GRAY, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "700" },
  txAmountCredit: { color: TEAL },
  txAmountDebit: { color: TITLE_DARK },
  emptyTx: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyTxText: { fontSize: 14, color: TEXT_GRAY, marginTop: 12 },
});
