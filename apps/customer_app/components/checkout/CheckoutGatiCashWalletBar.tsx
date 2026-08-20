/**
 * Zomato-style GatiCash wallet toggle on checkout — use wallet balance on this order.
 */

import type { ReactNode } from "react";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

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
  /** Delivery / takeaway toggle on the right of this row. */
  trailing?: ReactNode;
};

export function CheckoutGatiCashWalletBar({
  balance,
  maxApplyAmount,
  applyAmount,
  checked,
  onToggle,
  loading = false,
  trailing,
}: Props) {
  const router = useRouter();
  const dark = useMerchantUiDark();
  const accent = dark ? MerchantDarkPalette.accent : BRAND;
  const hideWallet = balance <= 0.005;

  if (loading) {
    return (
      <View style={[styles.bar, dark && styles.barDark]}>
        <ActivityIndicator size="small" color={accent} />
        <CheckoutText style={[styles.loadingText, dark && styles.mutedDark, styles.textCol]} numberOfLines={1}>
          Loading GatiCash…
        </CheckoutText>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    );
  }

  if (hideWallet && !trailing) return null;

  return (
    <View style={[styles.bar, dark && styles.barDark]}>
      {!hideWallet ? (
        <View style={styles.leftCluster}>
          <Pressable
            style={styles.checkHit}
            onPress={onToggle}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <View style={[styles.checkBox, dark && styles.checkBoxDark, checked && styles.checkBoxOn, checked && dark && { backgroundColor: accent, borderColor: accent }]}>
              {checked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
            </View>
          </Pressable>

          <View style={styles.textCol}>
            <CheckoutText style={[styles.primaryText, dark && styles.textDark]} numberOfLines={1}>
              Use ₹{formatInrLabel(checked ? applyAmount : maxApplyAmount)} from GatiCash
            </CheckoutText>
            <View style={styles.subRow}>
              <CheckoutText style={[styles.balanceText, dark && styles.mutedDark]} numberOfLines={1}>
                Balance: ₹{formatInrLabel(balance)}
              </CheckoutText>
              <Pressable onPress={() => router.push("/wallet/add-money")} hitSlop={6}>
                <CheckoutText style={[styles.addMoneyLink, dark && { color: accent }]} numberOfLines={1}>
                  Add Money ›
                </CheckoutText>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.leftCluster} />
      )}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  leftCluster: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    marginRight: 10,
  },
  checkHit: {
    marginRight: 10,
    flexShrink: 0,
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
    flexWrap: "nowrap",
    alignItems: "center",
    marginTop: 3,
  },
  balanceText: {
    fontSize: 13,
    color: TEXT_GRAY,
    flexShrink: 1,
  },
  addMoneyLink: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND,
    marginLeft: 6,
    flexShrink: 0,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_GRAY,
  },
  barDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderTopColor: MerchantDarkPalette.border,
    borderBottomColor: MerchantDarkPalette.border,
  },
  checkBoxDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: MerchantDarkPalette.chipBorder,
  },
  textDark: { color: MerchantDarkPalette.text },
  mutedDark: { color: MerchantDarkPalette.textMuted },
  trailing: {
    flexShrink: 0,
    marginLeft: 4,
  },
});
