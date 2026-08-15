/**
 * Merchant Refer & Earn — displays backend referral code, stats, and configured rewards.
 * Never calculates amounts locally.
 */

import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMerchantReferralMe,
  fetchMerchantReferralShare,
  type MerchantReferralMeResponse,
} from "@/services/referral.service";
import { friendlyReferralStatus, presentReferralCopy, REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE } from "@/lib/referralCopy";
import { useFocusEffect } from "expo-router";

export default function ReferralsScreen() {
  const router = useRouter();
  const { token, partner } = useAuth();
  const [data, setData] = useState<MerchantReferralMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const next = await fetchMerchantReferralMe(token);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load referrals");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const copy = presentReferralCopy({
    audience: "merchant",
    referralEnabled: data?.config?.referralEnabled,
    rewardEnabled: data?.config?.rewardEnabled,
    rewardsPaused: data?.config?.rewardSummary?.rewardsPaused,
    currency: data?.config?.currency,
    minOrderAmount: data?.config?.milestones?.[0]?.minOrderAmount,
    requireKyc: data?.config?.requireKyc,
    milestones: data?.config?.milestones,
  });
  const referralCode = data?.referralCode?.trim() || null;
  const stats = data?.stats ?? {
    totalReferrals: data?.history?.length ?? 0,
    totalActive: (data?.history ?? []).filter((r) => r.is_active).length,
    totalEarned: (data?.history ?? []).reduce((s, r) => s + (Number(r.reward_earned) || 0), 0),
  };
  const senderName =
    partner?.parent?.owner_name?.trim() ||
    partner?.parent?.brand_name?.trim() ||
    partner?.parent?.parent_name?.trim() ||
    "Your store";

  const onShare = async () => {
    if (!token || sharing) return;
    setSharing(true);
    try {
      const code = referralCode;
      if (!code) {
        Alert.alert("Referral unavailable", "Your referral code is still being generated.");
        return;
      }
      let url = `https://partner.gatimitra.com/merchant-ref/${code}`;
      try {
        const payload = await fetchMerchantReferralShare(token);
        if (payload.shareUrl?.trim()) url = payload.shareUrl.trim();
      } catch {
        /* keep production link — never use the backend message body */
      }
      const message = copy.shareMessage({
        referrerName: senderName,
        referralCode: code,
        shareUrl: url,
      });
      await Share.share({
        message,
        url,
        title: "Refer & Earn on GatiMitra",
      });
    } catch (e) {
      Alert.alert("Share failed", e instanceof Error ? e.message : "Could not share.");
    } finally {
      setSharing(false);
    }
  };

  const onCopy = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{copy.title}</Text>
          <Text style={styles.headerSub}>{copy.subtitle}</Text>
        </View>
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={GatiMitraMerchant.textTertiary} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : data && data.config?.referralEnabled !== true ? (
        <View style={styles.center}>
          <Ionicons name="gift-outline" size={40} color={GatiMitraMerchant.textTertiary} />
          <Text style={styles.errorText}>{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={GatiMitraMerchant.primary}
            />
          }
        >
          {copy.hasActiveReward ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>How it works</Text>
              {copy.steps.map((step, index) => (
                <View key={step.title} style={styles.stepRow}>
                  <Text style={styles.stepIndex}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneName}>{step.title}</Text>
                    <Text style={styles.milestoneAmt}>{step.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {referralCode ? (
            <View style={styles.card}>
              <Text style={styles.label}>Your referral code</Text>
              <Text style={styles.code}>{referralCode}</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => void onCopy()}
                  style={[styles.secondaryBtn, copied && styles.secondaryBtnCopied]}
                  disabled={copied}
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={16}
                    color={copied ? GatiMitraMerchant.primary : GatiMitraMerchant.navy}
                  />
                  <Text style={[styles.secondaryBtnText, copied && styles.secondaryBtnTextCopied]}>
                    {copied ? "Copied" : "Copy code"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void onShare()}
                  style={[styles.primaryBtn, sharing && { opacity: 0.7 }]}
                  disabled={sharing}
                >
                  <Ionicons name="share-social-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Share link</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Sharing as {senderName}</Text>
            </View>
          ) : null}

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalReferrals}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalActive}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>₹{Math.round(Number(stats.totalEarned) || 0)}</Text>
              <Text style={styles.statLabel}>Earned</Text>
            </View>
          </View>

          {copy.hasActiveReward ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Referral reward</Text>
              {copy.youEarnLine ? (
                <Text style={[styles.rewardLine, { marginTop: 8 }]}>{copy.youEarnLine}</Text>
              ) : null}
              {copy.theyEarnDetail ? (
                <Text style={styles.cardBody}>{copy.theyEarnDetail}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Referral reward</Text>
              <Text style={styles.cardBody}>{copy.unavailableMessage}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Your referrals</Text>
          {(data?.history ?? []).length === 0 ? (
            <Text style={styles.empty}>No referrals yet. Share your link to get started.</Text>
          ) : (
            (data?.history ?? []).map((row) => (
              <View key={String(row.id)} style={styles.historyCard}>
                <Text style={styles.historyName}>
                  {row.referred_name || row.referred_display_id || "Invited merchant"}
                </Text>
                <Text style={styles.historyMeta}>
                  {friendlyReferralStatus(row.status)}
                  {row.completed_orders != null ? ` · ${row.completed_orders} orders` : ""}
                </Text>
                <Text style={styles.historyEarn}>
                  ₹{Math.round(Number(row.reward_earned) || 0)} credited
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    gap: 10,
  },
  backBtn: { padding: 6 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  headerSub: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  errorText: { color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "600" },
  scroll: { padding: H_PADDING, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  cardBody: { marginTop: 6, fontSize: 13, color: GatiMitraMerchant.textSecondary, lineHeight: 18 },
  rewardLine: { marginTop: 4, fontSize: 13, color: GatiMitraMerchant.navy },
  label: { fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.textTertiary, letterSpacing: 0.4 },
  code: { marginTop: 6, fontSize: 22, fontWeight: "800", letterSpacing: 1, color: GatiMitraMerchant.navy },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  secondaryBtnText: { fontWeight: "600", color: GatiMitraMerchant.navy },
  secondaryBtnCopied: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
  },
  secondaryBtnTextCopied: { color: GatiMitraMerchant.primary, fontWeight: "700" },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  primaryBtnText: { fontWeight: "700", color: "#fff" },
  hint: { marginTop: 8, fontSize: 11, color: GatiMitraMerchant.textTertiary },
  statRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    padding: 12,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  statLabel: { marginTop: 4, fontSize: 11, color: GatiMitraMerchant.textSecondary },
  sectionTitle: { marginTop: 8, fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  empty: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  historyCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    padding: 12,
  },
  historyName: { fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  historyMeta: { marginTop: 2, fontSize: 12, color: GatiMitraMerchant.textSecondary },
  historyEarn: { marginTop: 4, fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primaryDark },
  milestoneRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  milestoneName: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  milestoneAmt: { marginTop: 2, fontSize: 12, color: GatiMitraMerchant.textSecondary },
  stepRow: { flexDirection: "row", gap: 10, marginTop: 10, alignItems: "flex-start" },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GatiMitraMerchant.navy,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
});
