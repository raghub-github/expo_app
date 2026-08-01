import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/src/theme";
import {
  fetchRiderReferralMe,
  type RiderReferralHistoryItem,
} from "@/src/services/referral.service";

const TEAL = colors.primary[600];
const TEAL_DARK = colors.primary[700] ?? "#0F766E";
const PAGE_BG = "#F4F6F8";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

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

function filterHistory(items: RiderReferralHistoryItem[], filter: FilterKey) {
  if (filter === "active") return items.filter((r) => r.is_active);
  if (filter === "earned") return items.filter((r) => Number(r.reward_earned ?? 0) > 0);
  return items;
}

function displayId(row: RiderReferralHistoryItem): string {
  const id = row.referred_display_id?.trim();
  if (id) return id;
  if (row.referred_user_id != null) return `GMR${row.referred_user_id}`;
  return "—";
}

export function ReferralDetailsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = (
    ["total", "active", "earned"].includes(String(params.filter))
      ? params.filter
      : "total"
  ) as FilterKey;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["rider", "referral", "me"],
    queryFn: ({ signal }) => fetchRiderReferralMe(signal),
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
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{TITLES[filter]}</Text>
          <Text style={styles.headerSub}>
            {t("profile.referralDetailsSub", "Referral details")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>
            {filter === "earned"
              ? `₹${Math.round(totalEarned)}`
              : String(rows.length)}
          </Text>
          <Text style={styles.summaryLabel}>{TITLES[filter]}</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={TEAL} style={{ marginTop: 24 }} />
        ) : isError ? (
          <Text style={styles.empty}>
            {t(
              "profile.referralsLoadFailed",
              "Could not load referrals. Go back and retry.",
            )}
          </Text>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={28} color={MUTED} />
            <Text style={styles.empty}>
              {t("profile.noReferralsInList", "No referrals in this list yet.")}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {rows.map((row, index) => (
              <View
                key={String(row.id)}
                style={[styles.row, index < rows.length - 1 && styles.rowBorder]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="person-outline" size={18} color={TEAL_DARK} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{displayId(row)}</Text>
                  {row.referred_name ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {row.referred_name}
                    </Text>
                  ) : null}
                  <Text style={styles.rowMeta}>
                    {statusLabel(row.status)} · ₹{Number(row.reward_earned ?? 0)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: { backgroundColor: "#F1F5F9" },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: TEXT },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 32 },
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
  summaryValue: { fontSize: 28, fontWeight: "800", color: TEAL_DARK },
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
