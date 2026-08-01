import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "@/src/theme";
import { shareRiderReferralCode } from "@/src/lib/rider-referral-share";
import { fetchRiderReferralMe } from "@/src/services/referral.service";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";

const TEAL = colors.primary[600];
const TEAL_DARK = colors.primary[700] ?? "#0F766E";
const PAGE_BG = "#F4F6F8";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

export function ReferralsScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const riderId = session?.riderId ?? session?.userId;
  const { data: riderStatus } = useRiderStatus(riderId);
  const riderName = riderStatus?.name?.trim() || "GatiMitra Partner";

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["rider", "referral", "me"],
    queryFn: ({ signal }) => fetchRiderReferralMe(signal),
  });

  const history = data?.history ?? [];
  const stats = data?.stats ?? {
    totalReferrals: history.length,
    totalActive: history.filter((r) => r.is_active).length,
    totalEarned: history.reduce((s, r) => s + (Number(r.reward_earned) || 0), 0),
  };
  const referralCode =
    data?.referralCode?.trim() || riderStatus?.referralCode?.trim() || null;
  const headline = data?.config?.rewardSummary?.headline?.trim();

  const steps = useMemo(
    () => [
      {
        icon: "share-social-outline" as const,
        title: t("profile.referralStepShare", "Share your link"),
        body: t(
          "profile.referralStepShareBody",
          "Send your unique referral link via WhatsApp, SMS, or any app.",
        ),
      },
      {
        icon: "download-outline" as const,
        title: t("profile.referralStepInstall", "They join via your link"),
        body: t(
          "profile.referralStepInstallBody",
          "Partners who join from your link get the referral applied automatically.",
        ),
      },
      {
        icon: "gift-outline" as const,
        title: t("profile.referralStepEarn", "You both earn rewards"),
        body:
          headline ||
          t(
            "profile.referralStepEarnBody",
            "After they complete delivery milestones, rewards credit to your wallet.",
          ),
      },
    ],
    [headline, t],
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
          <Text style={styles.headerTitle}>
            {t("profile.referAndEarn", "Refer & Earn")}
          </Text>
          <Text style={styles.headerSub}>
            {t("profile.referralsSubtitle", "Share your link and track rewards")}
          </Text>
        </View>
      </View>

      {isLoading && !data ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : isError && !data ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
          <Text style={styles.centerTitle}>
            {t("profile.referralsLoadFailed", "Could not load referrals")}
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={TEAL}
            />
          }
        >
          <View style={styles.stepsCard}>
            {steps.map((step, i) => (
              <View
                key={step.title}
                style={[styles.stepRow, i < steps.length - 1 && styles.stepBorder]}
              >
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={18} color={TEAL_DARK} />
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBodyText}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {referralCode ? (
            <Pressable
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
              onPress={() => void shareRiderReferralCode(referralCode, riderName)}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>
                {t("profile.shareReferral", "Share referral link")}
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionTitle}>
            {t("profile.yourReferrals", "Your referrals")}
          </Text>

          <View style={styles.statRow}>
            {(
              [
                {
                  key: "total" as const,
                  label: t("profile.totalReferral", "Total Referral"),
                  value: String(stats.totalReferrals),
                },
                {
                  key: "active" as const,
                  label: t("profile.totalActiveUser", "Total Active User"),
                  value: String(stats.totalActive),
                },
                {
                  key: "earned" as const,
                  label: t("profile.totalEarn", "Total Earn"),
                  value: `₹${Math.round(Number(stats.totalEarned) || 0)}`,
                },
              ] as const
            ).map((card) => (
              <Pressable
                key={card.key}
                style={({ pressed }) => [
                  styles.statCard,
                  pressed && styles.statCardPressed,
                ]}
                onPress={() => router.push(`/referral-details/${card.key}`)}
              >
                <Text style={styles.statValue} numberOfLines={1}>
                  {card.value}
                </Text>
                <Text style={styles.statLabel} numberOfLines={2}>
                  {card.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.tipCard}>
            <Ionicons name="information-circle-outline" size={18} color={TEAL_DARK} />
            <Text style={styles.tipText}>
              {t(
                "profile.referralTip",
                "Rewards credit to your wallet after qualifying milestones. Amounts and caps are controlled by GatiMitra and update live.",
              )}
            </Text>
          </View>
        </ScrollView>
      )}
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
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  centerTitle: { fontSize: 15, fontWeight: "700", color: TEXT, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TEAL,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  scroll: { padding: 16, paddingBottom: 32 },
  stepsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    marginBottom: 12,
  },
  stepRow: { flexDirection: "row", padding: 14, gap: 12, alignItems: "flex-start" },
  stepBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  stepBodyText: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 17 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 16,
  },
  shareBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 10,
    marginLeft: 2,
  },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 72,
    justifyContent: "center",
  },
  statCardPressed: { backgroundColor: "#F8FAFC" },
  statValue: { fontSize: 16, fontWeight: "800", color: TEAL_DARK },
  statLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    textAlign: "center",
    lineHeight: 13,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    padding: 14,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  tipText: { flex: 1, fontSize: 12, color: TEAL_DARK, lineHeight: 17 },
});
