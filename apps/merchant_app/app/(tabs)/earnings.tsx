/**
 * Earnings & Payments — summary cards and payout list (SaaS-style).
 */

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraMerchant, H_PADDING, TAB_BAR_HEIGHT, SCROLL_BOTTOM_SAFE } from "@/constants/theme";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={GatiMitraMerchant.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroRow}>
          <Text style={styles.heroLabel}>Available balance</Text>
          <TouchableOpacity style={GatiMitraMerchant.cursorPointer}>
            <Ionicons name="help-circle-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.heroValue}>₹24,580</Text>
        <Text style={styles.heroSub}>Settlements: Next on Wed, Mar 5</Text>
        <TouchableOpacity style={[styles.withdrawBtn, GatiMitraMerchant.cursorPointer]}>
          <Text style={styles.withdrawBtnText}>Withdraw</Text>
          <Ionicons name="arrow-forward" size={18} color={GatiMitraMerchant.primary} />
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.row}>
        <View style={styles.miniCard}>
          <Ionicons name="trending-up-outline" size={22} color={GatiMitraMerchant.primary} />
          <Text style={styles.miniValue}>₹12,450</Text>
          <Text style={styles.miniLabel}>Today</Text>
        </View>
        <View style={styles.miniCard}>
          <Ionicons name="calendar-outline" size={22} color={GatiMitraMerchant.primary} />
          <Text style={styles.miniValue}>₹1,24,200</Text>
          <Text style={styles.miniLabel}>This month</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent payouts</Text>
        <View style={styles.payoutCard}>
          <View style={styles.payoutRow}>
            <View style={styles.payoutIcon}>
              <Ionicons name="checkmark-circle" size={24} color={GatiMitraMerchant.success} />
            </View>
            <View style={styles.payoutInfo}>
              <Text style={styles.payoutTitle}>Settlement #STL-4821</Text>
              <Text style={styles.payoutMeta}>Feb 28, 2025 • Bank transfer</Text>
            </View>
            <Text style={styles.payoutAmount}>+₹18,240</Text>
          </View>
        </View>
        <View style={styles.payoutCard}>
          <View style={styles.payoutRow}>
            <View style={styles.payoutIcon}>
              <Ionicons name="checkmark-circle" size={24} color={GatiMitraMerchant.success} />
            </View>
            <View style={styles.payoutInfo}>
              <Text style={styles.payoutTitle}>Settlement #STL-4819</Text>
              <Text style={styles.payoutMeta}>Feb 25, 2025 • Bank transfer</Text>
            </View>
            <Text style={styles.payoutAmount}>+₹22,100</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: { paddingHorizontal: H_PADDING },
  heroCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    overflow: "hidden",
    ...GatiMitraMerchant.shadow,
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  heroLabel: { fontSize: 14, color: "rgba(255,255,255,0.9)" },
  heroValue: { fontSize: 28, fontWeight: "800", color: "#fff" },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 16,
    gap: 6,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.primary },
  row: { flexDirection: "row", gap: 12, marginBottom: 24 },
  miniCard: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 16,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  miniValue: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginTop: 8 },
  miniLabel: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  section: {},
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  payoutCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  payoutRow: { flexDirection: "row", alignItems: "center" },
  payoutIcon: { marginRight: 12 },
  payoutInfo: { flex: 1 },
  payoutTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  payoutMeta: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  payoutAmount: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.success },
});
