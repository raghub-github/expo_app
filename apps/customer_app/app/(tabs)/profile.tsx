/**
 * Profile tab – GatiMitra Account screen.
 * Gradient header with visible status bar, quick actions, single rewards/referral entry, refer CTA.
 */

import { useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { profileService } from "@/services/profile.service";

const TEAL = "#14b8a6";
const TEAL_DARK = "#0d9488";
const TEAL_LIGHT = "#5eead4";
const MINT_SOFT = "#ccfbf1";
const MINT_SOFT_ALT = "#E0F2F1";
const TITLE_DARK = "#0f172a";
const TEXT_GRAY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const CARD_BG = "#FFFFFF";
const BORDER_LIGHT = "#f1f5f9";
const SURFACE = "#f8fafc";

const SHADOW = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

const SHADOW_SOFT = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
    retry: false,
  });

  const displayName = profile?.full_name?.trim() || t("common.customer");
  const lifetimeSavings = "2,167";
  const referralCode = profile?.referral_code ?? null;
  const customerId = profile?.customer_id ?? profile?.user_id ?? profile?.referral_code ?? null;
  const isEmailVerified = profile?.is_email_verified ?? false;

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard`);
    } catch {
      Alert.alert("Error", "Could not copy");
    }
  }, []);
  const addressParts = [
    profile?.address_line1,
    profile?.address_line2,
    [profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(", "),
    profile?.country,
  ].filter(Boolean);
  const addressLine = addressParts.length > 0 ? addressParts.join(", ") : null;

  const quickActions = [
    { id: "transactions", label: t("profile.transactions"), icon: "receipt-outline" as const, path: "/wallet" },
    { id: "support", label: t("profile.support"), icon: "help-circle-outline" as const, path: "/profile/help" },
    { id: "settings", label: t("profile.settings"), icon: "settings-outline" as const, path: "/profile/settings" },
  ];
  const menuItems = [
    { id: "rewards", label: t("profile.rewardsAndReferrals"), icon: "gift-outline" as const, path: null },
    { id: "addresses", label: t("profile.savedAddresses"), icon: "location-outline" as const, path: "/profile/addresses" },
    { id: "help", label: t("profile.helpAndSupport"), icon: "help-buoy-outline" as const, path: "/profile/help" },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient – starts below the white status bar */}
        <LinearGradient
          colors={[TEAL_DARK, TEAL, TEAL_LIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerCurve} />
          {customerId ? (
            <View style={styles.customerIdBadge}>
              <Text style={styles.customerIdLabel}>{t("profile.customerId")}</Text>
              <View style={styles.customerIdRow}>
                <Text style={styles.customerIdValue} numberOfLines={1}>{customerId}</Text>
                <TouchableOpacity
                  hitSlop={6}
                  style={styles.copyBtn}
                  onPress={() => copyToClipboard(customerId, "Customer ID")}
                >
                  <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.95)" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{displayName}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => router.push("/profile/edit")}>
                  <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.savings}>{t("profile.lifetimeSavings")}: ₹{lifetimeSavings}</Text>
              {referralCode ? (
                <View style={styles.referralIdWrap}>
                  <Text style={styles.referralIdLabel}>{t("profile.referralId")}</Text>
                  <View style={styles.referralIdRow}>
                    <Text style={styles.referralIdValue} selectable numberOfLines={1}>
                      {referralCode}
                    </Text>
                    <TouchableOpacity
                      hitSlop={6}
                      style={styles.copyBtn}
                      onPress={() => copyToClipboard(referralCode, t("profile.referralId"))}
                    >
                      <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.95)" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              <View style={styles.linksRow}>
                {!isEmailVerified && profile?.email ? (
                  <TouchableOpacity
                    style={styles.linkChip}
                    onPress={() => router.push("/profile/verify-email")}
                  >
                    <Ionicons name="mail-unread-outline" size={14} color="rgba(255,255,255,0.95)" />
                    <Text style={styles.linkChipText}>{t("profile.verifyEmail")}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.linkChip} onPress={() => router.push("/profile/edit")}>
                  <Text style={styles.linkChipText}>{t("profile.editProfile")}</Text>
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.95)" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </LinearGradient>

        {addressLine ? (
          <View style={[styles.addressCard, SHADOW_SOFT]}>
            <View style={styles.addressIconWrap}>
              <Ionicons name="location-outline" size={20} color={TEAL} />
            </View>
            <Text style={styles.addressText} numberOfLines={2}>
              {addressLine}
            </Text>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickCardsWrap}>
          {quickActions.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.quickCard, SHADOW_SOFT]}
              activeOpacity={0.85}
              onPress={() => a.path && router.push(a.path as any)}
            >
              <View style={styles.quickCardIconWrap}>
                <Ionicons name={a.icon} size={24} color={TEAL} />
              </View>
              <Text style={styles.quickCardLabel} numberOfLines={1}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Menu list – single Rewards & Referrals, no duplicate Settings */}
        <View style={[styles.listCard, SHADOW_SOFT]}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.listRow, index < menuItems.length - 1 && styles.listRowBorder]}
              onPress={() => (item.path ? router.push(item.path as any) : null)}
              activeOpacity={0.7}
            >
              <View style={styles.listIconWrap}>
                <Ionicons name={item.icon} size={22} color={TEAL} />
              </View>
              <Text style={styles.listLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Single Refer & Earn CTA */}
        <LinearGradient
          colors={[MINT_SOFT_ALT, MINT_SOFT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.referBanner, SHADOW_SOFT]}
        >
          <View style={styles.referBannerContent}>
            <View style={styles.referIconWrap}>
              <Ionicons name="gift" size={28} color={TEAL_DARK} />
            </View>
            <View style={styles.referTextWrap}>
              <Text style={styles.referTitle}>{t("profile.referEarnTitle")}</Text>
              <Text style={styles.referSub}>{t("profile.referEarnSub")}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.referBtn} activeOpacity={0.9}>
            <Text style={styles.referBtnText}>{t("profile.referNow")}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>
      </ScrollView>
    </View>
  );
}

const PAD_H = 20;
const SECTION_GAP = 20;
const CARD_RADIUS = 16;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD_H,
    paddingTop: 0,
    paddingBottom: 40,
  },
  headerGradient: {
    paddingHorizontal: PAD_H + 4,
    paddingTop: 24,
    paddingBottom: 28,
    marginHorizontal: -4,
    marginTop: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  headerCurve: {
    position: "absolute",
    right: -40,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  customerIdBadge: {
    position: "absolute",
    top: 16,
    right: PAD_H + 4,
    zIndex: 2,
    alignItems: "flex-end",
    maxWidth: "50%",
  },
  customerIdLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.95)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  customerIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  customerIdValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    maxWidth: 100,
  },
  copyBtn: {
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  profileRow: { flexDirection: "row", alignItems: "center" },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 36 },
  profileInfo: { marginLeft: 18, flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileName: { fontSize: 20, fontWeight: "700", color: "#fff", letterSpacing: 0.2 },
  savings: { fontSize: 14, color: "rgba(255,255,255,0.92)", marginTop: 4 },
  referralIdWrap: { marginTop: 6 },
  referralIdLabel: { fontSize: 11, color: "rgba(255,255,255,0.95)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  referralIdRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, marginTop: 2 },
  referralIdValue: { fontSize: 13, fontWeight: "600", color: "#fff" },
  linksRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 10, gap: 8 },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  linkChipText: { fontSize: 13, color: "rgba(255,255,255,0.98)", fontWeight: "600" },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginTop: 18,
  },
  addressIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: MINT_SOFT_ALT,
    alignItems: "center",
    justifyContent: "center",
  },
  addressText: { flex: 1, fontSize: 14, color: TITLE_DARK, lineHeight: 20 },
  quickCardsWrap: {
    flexDirection: "row",
    marginTop: SECTION_GAP,
    gap: 12,
  },
  quickCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 10,
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
  },
  quickCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: MINT_SOFT_ALT,
    alignItems: "center",
    justifyContent: "center",
  },
  quickCardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TITLE_DARK,
    marginTop: 10,
    textAlign: "center",
  },
  listCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    marginTop: SECTION_GAP,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER_LIGHT },
  listIconWrap: { width: 40, alignItems: "center" },
  listLabel: { flex: 1, fontSize: 15, fontWeight: "500", color: TITLE_DARK },
  referBanner: {
    marginTop: SECTION_GAP,
    borderRadius: CARD_RADIUS,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.2)",
  },
  referBannerContent: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  referIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  referTextWrap: { flex: 1 },
  referTitle: { fontSize: 16, fontWeight: "700", color: TITLE_DARK },
  referSub: { fontSize: 13, color: TEXT_GRAY, marginTop: 2 },
  referBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TEAL_DARK,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  referBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
