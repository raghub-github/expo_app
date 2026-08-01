/**
 * Rewards & Referrals — live config, share link, FAQ sheet.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  copyReferralCode,
  openReferralWhatsApp,
  shareReferralCode,
} from "@/lib/referralShare";
import {
  clearPendingReferral,
  storePendingReferral,
} from "@/lib/pendingReferral";
import {
  referralService,
  type ReferralPublicConfig,
} from "@/services/referral.service";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { useProfile } from "@/hooks/useProfile";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = "#15803D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Live amounts from current referral rules. */
function resolveCustomerRewards(config: ReferralPublicConfig | undefined | null) {
  const rules = config?.milestones ?? [];
  const primary =
    rules.find((m) => m.alsoCreditReferred) ??
    rules.find((m) => num(m.rewardAmount) > 0 || num(m.referredRewardAmount) > 0) ??
    rules[0];

  const referrer = num(primary?.rewardAmount);
  const referredRaw = primary?.referredRewardAmount;
  const referred =
    primary?.alsoCreditReferred
      ? num(referredRaw != null ? referredRaw : primary.rewardAmount)
      : 0;

  // Display "both" amount: prefer positive shared value when admin set only one side.
  const bothDisplay =
    referrer > 0 && referred > 0
      ? referrer === referred
        ? referrer
        : null
      : referrer > 0
        ? referrer
        : referred > 0
          ? referred
          : 0;

  return {
    minOrder: num(config?.minOrderAmount, 249),
    monthlyCap: num(config?.monthlyRewardCap),
    referrer,
    referred,
    bothDisplay,
    currency: config?.currency ?? "INR",
    rewardEnabled: Boolean(config?.rewardEnabled),
    referralEnabled: Boolean(config?.referralEnabled),
    autoApply: Boolean(config?.autoApplyEnabled),
    firstOrderOnly: Boolean(config?.firstOrderOnly ?? true),
  };
}

function buildFaqs(config: ReferralPublicConfig | undefined | null) {
  const r = resolveCustomerRewards(config);
  const inr = (n: number) => `₹${n}`;
  const earnLine =
    r.referrer > 0 && r.referred > 0 && r.referrer !== r.referred
      ? `You earn ${inr(r.referrer)} GatiCash and your friend earns ${inr(r.referred)} GatiCash after their first qualifying delivered order.`
      : r.bothDisplay != null && r.bothDisplay > 0
        ? `You and your friend each earn ${inr(r.bothDisplay)} GatiCash after their first qualifying delivered order.`
        : r.rewardEnabled
          ? "Reward amounts are set by GatiMitra. Check back soon — amounts update live from admin."
          : "Rewards are currently paused by admin. Referral tracking still works.";

  return [
    {
      q: "How much do I earn?",
      a: earnLine,
    },
    {
      q: "What is the minimum order?",
      a: `Your friend’s first delivered order must be at least ${inr(r.minOrder)} to qualify for the reward.`,
    },
    {
      q: "Is there a monthly limit?",
      a:
        r.monthlyCap > 0
          ? `Yes. You can earn up to ${inr(r.monthlyCap)} in referral rewards per calendar month. Extra referrals still track, but credits pause until next month.`
          : "No monthly cap is configured right now.",
    },
    {
      q: "When is the reward credited?",
      a: r.firstOrderOnly
        ? "After your friend’s first qualifying order is delivered (not on signup or install)."
        : "After a qualifying delivered order that matches the active referral rule.",
    },
    {
      q: "Do I need to enter a code?",
      a: r.autoApply
        ? "No. Friends who install from your shared link get the referral applied automatically."
        : "They may need to apply your referral code during signup if auto-apply is off.",
    },
    {
      q: "Can I withdraw GatiCash?",
      a: "No. Referral rewards credit as non-withdrawable GatiCash and can only be spent inside GatiMitra.",
    },
    {
      q: "Are rewards active right now?",
      a: r.rewardEnabled
        ? "Yes — rewards are enabled. Amounts and caps update automatically when GatiMitra changes them."
        : r.referralEnabled
          ? "Referral tracking is on, but reward payouts are currently paused."
          : "Customer referral is currently paused.",
    },
  ];
}

export default function ReferralsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [faqOpen, setFaqOpen] = useState(false);
  const params = useLocalSearchParams<{
    code?: string;
    click?: string;
    autoApply?: string;
  }>();
  const { data: profile } = useProfile();
  const referrerName = profile?.full_name?.trim() || null;

  const { data, refetch, isLoading, isError, isFetching } = useQuery({
    queryKey: ["referral", "me"],
    queryFn: () => referralService.getMe(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  // Lightweight public config poll so amounts/FAQs stay in sync without waiting on /me.
  const { data: liveConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["referral", "config", "customer"],
    queryFn: () => referralService.getConfig(),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });

  const referralCode = data?.referralCode ?? null;
  const shareUrl = data?.shareUrl ?? null;
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyReferralCode(referralCode, shareUrl);
    if (!ok) return;
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [referralCode, shareUrl]);

  const config = liveConfig ?? data?.config;
  const history = data?.history ?? [];
  const stats = data?.stats ?? {
    totalReferrals: history.length,
    totalActive: history.filter((r) => r.is_active).length,
    totalEarned: history.reduce((s, r) => s + (Number(r.reward_earned) || 0), 0),
  };
  const rewards = useMemo(() => resolveCustomerRewards(config), [config]);
  const faqs = useMemo(() => buildFaqs(config), [config]);
  const rewardSummary = config?.rewardSummary ?? null;

  useFocusEffect(
    useCallback(() => {
      void refetch();
      void refetchConfig();
    }, [refetch, refetchConfig]),
  );

  useEffect(() => {
    navigation.setOptions({
      title: "Rewards & Referrals",
      headerRight: () => (
        <Pressable
          onPress={() => setFaqOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Referral FAQ"
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Ionicons name="information-circle-outline" size={24} color={GREEN_DARK} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    const code = String(params.code ?? "").trim().toUpperCase();
    if (!code) return;
    void storePendingReferral({
      code,
      clickToken: params.click ? String(params.click) : null,
      source: "deep_link",
    });
    if (params.autoApply === "1") {
      void (async () => {
        try {
          await referralService.apply({
            referralCode: code,
            clickToken: params.click ? String(params.click) : undefined,
            source: "deep_link",
          });
          await clearPendingReferral();
          await refetch();
        } catch {
          /* keep pending for resume after auth */
        }
      })();
    }
  }, [params.autoApply, params.click, params.code, refetch]);

  const steps = useMemo(() => {
    const min = rewards.minOrder;
    let earnBody: string;
    if (rewards.referrer > 0 && rewards.referred > 0 && rewards.referrer !== rewards.referred) {
      earnBody = `After their first delivered order of ₹${min}+, you get ₹${rewards.referrer} and they get ₹${rewards.referred} GatiCash.`;
    } else if (rewards.bothDisplay != null && rewards.bothDisplay > 0) {
      earnBody = `After their first delivered order of ₹${min}+, you both get ₹${rewards.bothDisplay} GatiCash.`;
    } else if (rewards.rewardEnabled) {
      earnBody = `After their first delivered order of ₹${min}+, GatiCash is credited per the live reward rules.`;
    } else {
      earnBody = `After their first delivered order of ₹${min}+, rewards credit when admin re-enables payouts.`;
    }
    return [
      {
        icon: "share-social-outline" as const,
        title: "Share your link",
        body: "Send your unique referral link via WhatsApp, SMS, or any app.",
      },
      {
        icon: "download-outline" as const,
        title: "They install via your link",
        body: rewards.autoApply
          ? "Friends who install from your link get the referral applied automatically — no code entry."
          : "Share your referral ID so friends can apply it when they join.",
      },
      {
        icon: "gift-outline" as const,
        title: "You both earn GatiCash",
        body: earnBody,
      },
    ];
  }, [rewards]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="gift" size={28} color={GREEN_DARK} />
          </View>
          <AppText style={styles.heroTitle}>{t("profile.referEarnTitle")}</AppText>
          <AppText style={styles.heroSub}>
            {!config
              ? isLoading || isFetching
                ? "Loading your referral details…"
                : "Could not load referral details. Pull to retry."
              : config.rewardEnabled
                ? t("profile.referEarnSub")
                : "Referral tracking is on. Rewards are currently paused by admin."}
          </AppText>
        </View>

        {isError && !data ? (
          <TouchableOpacity
            style={styles.retryCard}
            activeOpacity={0.85}
            onPress={() => {
              void refetch();
              void refetchConfig();
            }}
          >
            <Ionicons name="refresh" size={18} color={GREEN_DARK} />
            <AppText style={styles.retryText}>Tap to retry</AppText>
          </TouchableOpacity>
        ) : null}

        <View style={styles.codeCard}>
          <AppText style={styles.codeLabel}>{t("profile.referralId")}</AppText>
          <AppText style={styles.codeValue}>
            {referralCode ?? (isLoading || isFetching ? "Loading…" : "—")}
          </AppText>
          <View style={styles.codeActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, copiedLink && styles.secondaryBtnCopied]}
              activeOpacity={0.85}
              onPress={() => void handleCopyLink()}
              disabled={copiedLink}
            >
              <Ionicons
                name={copiedLink ? "checkmark" : "copy-outline"}
                size={18}
                color={copiedLink ? GREEN_DARK : TEXT}
              />
              <AppText style={[styles.secondaryBtnText, copiedLink && styles.secondaryBtnTextCopied]}>
                {copiedLink ? "Copied" : "Copy link"}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.9}
              onPress={() =>
                shareReferralCode(referralCode, referrerName, shareUrl, rewardSummary)
              }
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <AppText style={styles.primaryBtnText}>{t("profile.referNow")}</AppText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.whatsappBtn}
            activeOpacity={0.9}
            onPress={() =>
              openReferralWhatsApp(referralCode, referrerName, shareUrl, rewardSummary)
            }
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <AppText style={styles.primaryBtnText}>WhatsApp</AppText>
          </TouchableOpacity>
        </View>

        <AppText style={styles.sectionTitle}>How it works</AppText>
        <View style={styles.stepsCard}>
          {steps.map((step, index) => (
            <View
              key={step.title}
              style={[styles.stepRow, index < steps.length - 1 && styles.stepBorder]}
            >
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={20} color={GREEN_DARK} />
              </View>
              <View style={styles.stepBody}>
                <AppText style={styles.stepTitle}>{step.title}</AppText>
                <AppText style={styles.stepBodyText}>{step.body}</AppText>
              </View>
            </View>
          ))}
        </View>

        <AppText style={[styles.sectionTitle, { marginTop: 16 }]}>Your referrals</AppText>
        <View style={styles.statRow}>
          {[
            {
              key: "total" as const,
              label: "Total Referral",
              value: String(stats.totalReferrals),
            },
            {
              key: "active" as const,
              label: "Total Active User",
              value: String(stats.totalActive),
            },
            {
              key: "earned" as const,
              label: "Total Earn",
              value: `₹${Math.round(Number(stats.totalEarned) || 0)}`,
            },
          ].map((card) => (
            <TouchableOpacity
              key={card.key}
              style={styles.statCard}
              activeOpacity={0.85}
              onPress={() =>
                router.push(`/profile/referral-details/${card.key}` as never)
              }
            >
              <AppText style={styles.statValue} numberOfLines={1}>
                {card.value}
              </AppText>
              <AppText style={styles.statLabel} numberOfLines={2}>
                {card.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="information-circle-outline" size={20} color={GREEN} />
          <AppText style={styles.tipText}>
            Rewards credit as non-withdrawable GatiCash after a qualifying delivered order. Amounts
            and caps are controlled by GatiMitra and update live.
          </AppText>
        </View>
      </ScrollView>

      <StoreBottomSheetShell
        visible={faqOpen}
        onClose={() => setFaqOpen(false)}
        maxHeightRatio={0.78}
      >
        <View style={styles.faqHeader}>
          <AppText style={styles.faqTitle}>Referral FAQ</AppText>
        </View>
        <ScrollView
          style={styles.faqScroll}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          showsVerticalScrollIndicator={false}
        >
          {faqs.map((item) => (
            <View key={item.q} style={styles.faqItem}>
              <AppText style={styles.faqQ}>{item.q}</AppText>
              <AppText style={styles.faqA}>{item.a}</AppText>
            </View>
          ))}
        </ScrollView>
      </StoreBottomSheetShell>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: "800", color: TEXT, textAlign: "center" },
  heroSub: { fontSize: 13, color: MUTED, textAlign: "center", marginTop: 6, lineHeight: 19 },
  retryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  retryText: { fontSize: 13, fontWeight: "700", color: GREEN_DARK },
  codeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  codeValue: {
    fontSize: 26,
    fontWeight: "800",
    color: GREEN_DARK,
    marginTop: 6,
    letterSpacing: 1,
  },
  codeActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: PAGE_BG,
  },
  secondaryBtnCopied: {
    borderColor: "#BBF7D0",
    backgroundColor: "#ECFDF5",
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: TEXT },
  secondaryBtnTextCopied: { color: GREEN_DARK },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: GREEN,
  },
  whatsappBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#16A34A",
  },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: TEXT, marginBottom: 10, marginLeft: 2 },
  statRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
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
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: GREEN_DARK,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    textAlign: "center",
    lineHeight: 13,
  },
  stepsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
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
  tipText: { flex: 1, fontSize: 12, color: GREEN_DARK, lineHeight: 17 },
  faqHeader: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  faqTitle: { fontSize: 18, fontWeight: "800", color: TEXT },
  faqScroll: { maxHeight: 420, paddingHorizontal: 18 },
  faqItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  faqQ: { fontSize: 14, fontWeight: "700", color: TEXT },
  faqA: { fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 19 },
});
