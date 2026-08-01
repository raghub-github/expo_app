/**
 * Referral list detail — filtered by total / active / earned.
 */

import { useMemo } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  referralService,
  type ReferralHistoryItem,
} from "@/services/referral.service";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = "#15803D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";

type FilterKey = "total" | "active" | "earned";

const TITLES: Record<FilterKey, string> = {
  total: "Total Referrals",
  active: "Active Users",
  earned: "Total Earned",
};

function statusLabel(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "reward_credited") return "Reward credited";
  if (s === "first_order_pending") return "First order pending";
  if (s === "milestone_pending") return "Milestone pending";
  if (s === "cap_reached") return "Monthly cap reached";
  if (s === "fraud_blocked") return "Blocked";
  if (s === "cancelled") return "Cancelled";
  if (s === "attributed" || s === "pending") return "Pending";
  return status?.replace(/_/g, " ") || "Pending";
}

function filterHistory(items: ReferralHistoryItem[], filter: FilterKey) {
  if (filter === "active") return items.filter((r) => r.is_active);
  if (filter === "earned") return items.filter((r) => Number(r.reward_earned ?? 0) > 0);
  return items;
}

function displayId(row: ReferralHistoryItem): string {
  const id = row.referred_display_id?.trim();
  if (id) return id;
  // Never fall back to DB PK — only show public customer_id.
  return "—";
}

export default function ReferralDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = (["total", "active", "earned"].includes(String(params.filter))
    ? params.filter
    : "total") as FilterKey;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["referral", "me"],
    queryFn: () => referralService.getMe(),
  });

  const rows = useMemo(
    () => filterHistory(data?.history ?? [], filter),
    [data?.history, filter],
  );

  const totalEarned = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.reward_earned) || 0), 0),
    [rows],
  );

  return (
    <>
      <Stack.Screen options={{ title: TITLES[filter] }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 24) + 16,
        }}
      >
        <View style={styles.summaryCard}>
          <AppText style={styles.summaryValue}>
            {filter === "earned" ? `₹${Math.round(totalEarned)}` : String(rows.length)}
          </AppText>
          <AppText style={styles.summaryLabel}>{TITLES[filter]}</AppText>
        </View>

        {isLoading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 24 }} />
        ) : isError ? (
          <AppText style={styles.empty}>Could not load referrals. Go back and retry.</AppText>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={28} color={MUTED} />
            <AppText style={styles.empty}>No referrals in this list yet.</AppText>
          </View>
        ) : (
          <View style={styles.listCard}>
            {rows.map((row, index) => (
              <View
                key={String(row.id)}
                style={[styles.row, index < rows.length - 1 && styles.rowBorder]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="person-outline" size={18} color={GREEN_DARK} />
                </View>
                <View style={styles.rowBody}>
                  <AppText style={styles.rowTitle}>{displayId(row)}</AppText>
                  {row.referred_name ? (
                    <AppText style={styles.rowSub} numberOfLines={1}>
                      {row.referred_name}
                    </AppText>
                  ) : null}
                  <AppText style={styles.rowMeta}>
                    {statusLabel(row.status)} · ₹{Number(row.reward_earned ?? 0)}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  summaryValue: { fontSize: 28, fontWeight: "800", color: GREEN_DARK },
  summaryLabel: { marginTop: 4, fontSize: 13, color: MUTED, fontWeight: "600" },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: TEXT },
  rowSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  rowMeta: { fontSize: 12, color: MUTED, marginTop: 3 },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  empty: { textAlign: "center", color: MUTED, fontSize: 14, marginTop: 8 },
});
