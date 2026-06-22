/**
 * Profile tab — GatiMitra-style account card with GMitra Plus subscription strip.
 */

import { useCallback, useMemo, useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Pressable } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { BrandingFooter } from "@/components/BrandingFooter";
import { shareReferralCode } from "@/lib/referralShare";
import { buildEmailAvatarCandidates } from "@/lib/emailAvatar";
import { useProfile } from "@/hooks/useProfile";
import { useCurrentSubscription } from "@/hooks/useCustomerSubscription";
import { GmitraPlusMembershipSheet } from "@/components/profile/GmitraPlusMembershipSheet";

import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = "#15803D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";
const GOLD = "#F59E0B";
const GOLD_SOFT = "#FEF3C7";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "GM";
}

type MenuItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  path: string | null;
  badge?: string;
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: subscriptionStatus } = useCurrentSubscription(true);

  const displayName = profile?.full_name?.trim() || t("common.customer");
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const email = profile?.email?.trim() || null;
  const lifetimeSavingsDisplay = useMemo(() => {
    const amount = profile?.lifetime_savings_inr ?? 0;
    const rounded = Math.round(Math.max(0, amount));
    return rounded.toLocaleString("en-IN");
  }, [profile?.lifetime_savings_inr]);
  const referralCode = profile?.referral_code ?? null;
  const customerId = profile?.customer_id ?? profile?.user_id ?? null;
  const isEmailVerified = profile?.is_email_verified ?? false;
  const profileImageUrl = profile?.profile_image_url?.trim() || null;
  const showEmailAvatar = isEmailVerified && !!email;
  const avatarCandidates = useMemo(() => {
    if (!showEmailAvatar || !email) return [];
    return buildEmailAvatarCandidates(email, profileImageUrl);
  }, [showEmailAvatar, email, profileImageUrl]);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [membershipSheetVisible, setMembershipSheetVisible] = useState(false);
  const avatarUri = avatarCandidates[avatarIndex] ?? null;
  const subscriptionActive = subscriptionStatus?.active ?? profile?.gmitra_plus_active ?? false;
  const subscriptionPlanName =
    subscriptionStatus?.subscription?.planName ??
    subscriptionStatus?.plan?.planName ??
    "Membership";
  const subscriptionBenefits = subscriptionStatus?.plan?.benefits ?? [];
  const freeDeliveryRadius = subscriptionStatus?.plan?.maxFreeDeliveryRadiusKm;

  useEffect(() => {
    setAvatarIndex(0);
  }, [avatarCandidates]);

  const handleAvatarError = useCallback(() => {
    setAvatarIndex((current) => {
      if (current + 1 < avatarCandidates.length) return current + 1;
      return current;
    });
  }, [avatarCandidates.length]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard`);
    } catch {
      Alert.alert("Error", "Could not copy");
    }
  }, []);

  const freeDeliveryNote = useMemo(() => {
    if (!subscriptionStatus?.plan?.freeDeliveryEnabled || freeDeliveryRadius == null) return null;
    return `Free delivery within ${freeDeliveryRadius} km on eligible orders.`;
  }, [subscriptionStatus?.plan?.freeDeliveryEnabled, freeDeliveryRadius]);

  const handleSubscriptionPress = useCallback(() => {
    setMembershipSheetVisible(true);
  }, []);

  const handleReferNow = useCallback(() => {
    void shareReferralCode(referralCode, displayName);
  }, [referralCode, displayName]);

  const addressParts = [
    profile?.address_line1,
    profile?.address_line2,
    [profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(", "),
    profile?.country,
  ].filter(Boolean);
  const addressLine = addressParts.length > 0 ? addressParts.join(", ") : null;

  const menuItems: MenuItem[] = [
    { id: "transactions", label: t("profile.transactions"), icon: "wallet-outline", path: "/wallet" },
    { id: "support", label: t("profile.support"), icon: "chatbubble-ellipses-outline", path: "/support" },
    { id: "rewards", label: t("profile.rewardsAndReferrals"), icon: "gift-outline", path: "/profile/referrals", badge: "New" },
    { id: "addresses", label: t("profile.savedAddresses"), icon: "location-outline", path: "/profile/addresses" },
    { id: "collections", label: t("profile.yourCollections"), icon: "bookmark-outline", path: "/profile/collections" },
    { id: "settings", label: t("profile.settings"), icon: "settings-outline", path: "/profile/settings" },
    { id: "help", label: "Help & Support", icon: "help-buoy-outline", path: "/profile/help" },
    { id: "legal", label: "Legal & Policies", icon: "shield-checkmark-outline", path: "/profile/legal" },
    { id: "about", label: "About", icon: "information-circle-outline", path: "/profile/about" },
    ...( !isEmailVerified && profile?.email
      ? [{ id: "verify", label: t("profile.verifyEmail"), icon: "mail-outline" as const, path: "/profile/verify-email", badge: "!" }]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor={PAGE_BG} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card — GatiMitra-style with subscription strip */}
        <View style={[styles.profileCard, { marginTop: Math.max(insets.top - 4, 6) }]}>
          <View style={styles.profileCardBody}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                {showEmailAvatar && avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                    onError={handleAvatarError}
                  />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}
                {isEmailVerified ? (
                  <View style={styles.avatarVerifiedDot}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                ) : null}
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                {email ? (
                  <View style={styles.emailRow}>
                    <Text style={styles.userEmail} numberOfLines={1}>{email}</Text>
                    {isEmailVerified ? (
                      <View style={styles.emailVerifiedTag}>
                        <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                        <Text style={styles.emailVerifiedText}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.userEmail}>Add email in profile</Text>
                )}
                <Pressable style={styles.editLink} onPress={() => router.push("/profile/edit")}>
                  <Text style={styles.editLinkText}>{t("profile.editProfile")}</Text>
                  <Ionicons name="chevron-forward" size={14} color={GREEN} />
                </Pressable>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.plusStrip}
            activeOpacity={0.88}
            onPress={handleSubscriptionPress}
          >
            <View style={styles.plusCrownRing}>
              <MaterialCommunityIcons name="crown" size={16} color={GOLD} />
            </View>
            <Text style={styles.plusStripText}>
              {subscriptionActive ? `${subscriptionPlanName} Active` : `Join ${subscriptionPlanName}`}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Lifetime savings */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsRow}>
            <View style={styles.savingsIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={GREEN_DARK} />
            </View>
            <Text style={styles.savingsLabel} numberOfLines={1}>
              {t("profile.lifetimeSavings")}
            </Text>
            <Text style={styles.savingsValue} numberOfLines={1}>
              ₹{lifetimeSavingsDisplay}
            </Text>
          </View>
        </View>

        {/* Customer / Referral IDs */}
        {(customerId || referralCode) ? (
          <View style={styles.idCard}>
            {customerId ? (
              <TouchableOpacity style={styles.idRow} onPress={() => copyToClipboard(customerId, "Customer ID")}>
                <Text style={styles.idLabel}>{t("profile.customerId")}</Text>
                <View style={styles.idValueRow}>
                  <Text style={styles.idValue}>{customerId}</Text>
                  <Ionicons name="copy-outline" size={15} color={MUTED} />
                </View>
              </TouchableOpacity>
            ) : null}
            {customerId && referralCode ? <View style={styles.idDivider} /> : null}
            {referralCode ? (
              <TouchableOpacity style={styles.idRow} onPress={() => copyToClipboard(referralCode, t("profile.referralId"))}>
                <Text style={styles.idLabel}>{t("profile.referralId")}</Text>
                <View style={styles.idValueRow}>
                  <Text style={styles.idValue}>{referralCode}</Text>
                  <Ionicons name="copy-outline" size={15} color={MUTED} />
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Address */}
        <TouchableOpacity style={styles.addressRow} activeOpacity={0.8} onPress={() => router.push("/profile/addresses")}>
          <View style={styles.addressIconWrap}>
            <Ionicons name="location-outline" size={18} color={GREEN} />
          </View>
          <View style={styles.addressCopy}>
            <Text style={styles.addressTitle}>{addressLine ? "Delivery address" : "Add delivery address"}</Text>
            <Text style={styles.addressSub} numberOfLines={2}>
              {addressLine ?? "Save your home or work for faster checkout"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Menu list */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuRow, index < menuItems.length - 1 && styles.menuRowBorder]}
              onPress={() => (item.path ? router.push(item.path as never) : null)}
              activeOpacity={0.75}
            >
              <Ionicons name={item.icon} size={20} color={TEXT} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.badge ? (
                <View style={styles.menuBadge}>
                  <Text style={styles.menuBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={17} color="#C4C4C4" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Refer banner */}
        <View style={styles.referCard}>
          <Text style={styles.referTitle}>{t("profile.referEarnTitle")}</Text>
          <Text style={styles.referSub}>{t("profile.referEarnSub")}</Text>
          <TouchableOpacity style={styles.referBtn} activeOpacity={0.9} onPress={handleReferNow}>
            <Text style={styles.referBtnText}>{t("profile.referNow")}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <BrandingFooter />
      </ScrollView>

      <GmitraPlusMembershipSheet
        visible={membershipSheetVisible}
        onClose={() => setMembershipSheetVisible(false)}
        active={subscriptionActive}
        planName={subscriptionPlanName}
        benefits={subscriptionBenefits}
        freeDeliveryNote={freeDeliveryNote}
        description={
          subscriptionActive
            ? null
            : `Add ${subscriptionPlanName} at checkout on your next order — save on delivery and unlock member-only offers.`
        }
        onBrowseRestaurants={() => router.push("/(tabs)")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },
  profileCardBody: { padding: 16, paddingBottom: 14 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    overflow: "hidden",
    position: "relative",
  },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarVerifiedDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarText: { fontSize: 22, fontWeight: "800", color: GREEN_DARK },
  identityBody: { flex: 1 },
  userName: { fontSize: 18, fontWeight: "800", color: TEXT, letterSpacing: -0.2 },
  userEmail: { fontSize: 13, color: MUTED, flexShrink: 1 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" },
  emailVerifiedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  emailVerifiedText: { fontSize: 10, fontWeight: "700", color: GREEN_DARK },
  editLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 6 },
  editLinkText: { fontSize: 13, fontWeight: "700", color: GREEN },
  plusStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PAGE_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  plusCrownRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GOLD_SOFT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  plusStripText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GREEN_DARK,
    letterSpacing: 0.1,
  },
  savingsCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
  },
  savingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  savingsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  savingsLabel: {
    flex: 1,
    fontSize: 13,
    color: MUTED,
    fontWeight: "600",
  },
  savingsValue: {
    fontSize: 18,
    fontWeight: "800",
    color: GREEN_DARK,
    flexShrink: 0,
    marginLeft: 8,
  },
  idCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  idRow: { paddingHorizontal: 14, paddingVertical: 12 },
  idDivider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 14 },
  idLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  idValueRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  idValue: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  addressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  addressCopy: { flex: 1 },
  addressTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  addressSub: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 17 },
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 14,
    gap: 12,
  },
  menuRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT },
  menuBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
  menuBadgeText: { fontSize: 10, fontWeight: "800", color: "#DC2626" },
  referCard: {
    marginTop: 12,
    backgroundColor: GREEN_DARK,
    borderRadius: 14,
    padding: 16,
  },
  referTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  referSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4, lineHeight: 17 },
  referBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  referBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
