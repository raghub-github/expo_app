import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

const TERMS = [
  {
    key: "benefits",
    defaultValue:
      "Membership gives priority ride assignments, faster payouts, and exclusive incentives while your plan is active.",
  },
  {
    key: "charges",
    defaultValue:
      "Subscription charges include plan price plus applicable GST. The amount shown at checkout is deducted from your rider wallet.",
  },
  {
    key: "autoRenew",
    defaultValue:
      "When auto-renewal is on for a daily plan, the fee is deducted from your wallet only on the first order you accept each day. If you accept no orders that day, nothing is deducted. Turning auto-renew off stops further daily charges. Weekly or monthly plans renew on their billing schedule when auto-renew is on.",
  },
  {
    key: "wallet",
    defaultValue:
      "Wallet deduction happens instantly on activation and on each daily first-accept renewal (or scheduled renewal for other cycles). If balance is low, renewal may continue and wallet can go negative up to ₹35 for subscription dues only.",
  },
  {
    key: "restrictions",
    defaultValue:
      "If dues remain unpaid at the ₹35 limit with no earnings for 3 consecutive days, new orders are paused until dues are cleared via Pay Now.",
  },
] as const;

export function SubscriptionTermsSection({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.title}>
        {t("subscription.termsTitle", "Terms & Conditions")}
      </Text>
      {TERMS.map((item, index) => (
        <View key={item.key} style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{index + 1}</Text>
          </View>
          <Text style={styles.body}>
            {t(`subscription.terms.${item.key}`, item.defaultValue)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    padding: 14,
    gap: 12,
  },
  wrapCompact: {
    marginTop: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7C3AED",
  },
  body: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },
});
