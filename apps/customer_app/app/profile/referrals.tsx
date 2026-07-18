/**
 * Rewards & Referrals — share referral code and earn GatiMitra credit.
 */

import { View, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { profileService } from "@/services/profile.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { copyReferralCode, shareReferralCode } from "@/lib/referralShare";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = "#15803D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";

const STEPS = [
  { icon: "share-social-outline" as const, title: "Share your code", body: "Send your unique referral code to friends and family." },
  { icon: "person-add-outline" as const, title: "They sign up", body: "Your friend downloads GatiMitra and enters your code." },
  { icon: "gift-outline" as const, title: "You both earn", body: "Rewards are credited when they place their first order." },
];

export default function ReferralsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: profile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
  });

  const referralCode = profile?.referral_code ?? null;
  const displayName = profile?.full_name?.trim() || null;

  return (
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
        <AppText style={styles.heroSub}>{t("profile.referEarnSub")}</AppText>
      </View>

      <View style={styles.codeCard}>
        <AppText style={styles.codeLabel}>{t("profile.referralId")}</AppText>
        <AppText style={styles.codeValue}>{referralCode ?? "—"}</AppText>
        <View style={styles.codeActions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => copyReferralCode(referralCode)}
          >
            <Ionicons name="copy-outline" size={18} color={TEXT} />
            <AppText style={styles.secondaryBtnText}>Copy code</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.9}
            onPress={() => shareReferralCode(referralCode, displayName)}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <AppText style={styles.primaryBtnText}>{t("profile.referNow")}</AppText>
          </TouchableOpacity>
        </View>
      </View>

      <AppText style={styles.sectionTitle}>How it works</AppText>
      <View style={styles.stepsCard}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={[styles.stepRow, index < STEPS.length - 1 && styles.stepBorder]}>
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

      <View style={styles.tipCard}>
        <Ionicons name="information-circle-outline" size={20} color={GREEN} />
        <AppText style={styles.tipText}>
          Share via WhatsApp, SMS, or any app. Your friend must enter your code during sign-up.
        </AppText>
      </View>
    </ScrollView>
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
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: TEXT },
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
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: TEXT, marginBottom: 10, marginLeft: 2 },
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
});
