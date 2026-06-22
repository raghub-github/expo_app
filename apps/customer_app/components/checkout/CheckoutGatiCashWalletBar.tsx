/**
 * Zomato-style GatiCash wallet toggle on checkout — use wallet balance on this order.
 */

import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";

function formatInrLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

type Props = {
  balance: number;
  maxApplyAmount: number;
  applyAmount: number;
  checked: boolean;
  onToggle: () => void;
  loading?: boolean;
};

export function CheckoutGatiCashWalletBar({
  balance,
  maxApplyAmount,
  applyAmount,
  checked,
  onToggle,
  loading = false,
}: Props) {
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.bar}>
        <ActivityIndicator size="small" color={BRAND} />
        <Text style={styles.loadingText}>Loading GatiCash…</Text>
      </View>
    );
  }

  if (balance <= 0.005) return null;

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.checkHit}
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
          {checked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
        </View>
      </Pressable>

      <View style={styles.textCol}>
        <Text style={styles.primaryText}>
          Use ₹{formatInrLabel(checked ? applyAmount : maxApplyAmount)} from GatiCash
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.balanceText}>Balance: ₹{formatInrLabel(balance)}</Text>
          <Pressable onPress={() => router.push("/wallet/add-money")} hitSlop={6}>
            <Text style={styles.addMoneyLink}>Add Money ›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  checkHit: {
    paddingTop: 2,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkBoxOn: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    lineHeight: 21,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  balanceText: {
    fontSize: 13,
    color: TEXT_GRAY,
  },
  addMoneyLink: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_GRAY,
  },
});
