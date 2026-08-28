/**
 * Profile tab — GatiMitra-style account card with GMitra Plus subscription strip.
 */

import { useCallback, useMemo, useState, useEffect, useLayoutEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { markWalletEntrySource } from "@/store/walletChromeStore";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrandingFooter } from "@/components/BrandingFooter";
import { shareReferralCode } from "@/lib/referralShare";
import { presentReferralCopy } from "@/lib/referralCopy";
import { isCustomProfileUploadUrl } from "@/lib/emailAvatar";
import { getNameInitials } from "@/lib/nameInitials";
import { useProfile } from "@/hooks/useProfile";
import { useCurrentSubscription } from "@/hooks/useCustomerSubscription";
import { GmitraPlusMembershipSheet } from "@/components/profile/GmitraPlusMembershipSheet";
import { ProfilePhotoSourceSheet } from "@/components/profile/ProfilePhotoSourceSheet";
import { ProfilePhotoViewerSheet } from "@/components/profile/ProfilePhotoViewerSheet";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { profileService, type UserProfile } from "@/services/profile.service";
import { referralService } from "@/services/referral.service";
import { invalidateProfileCache, PROFILE_QUERY_KEY, writeCachedProfile } from "@/lib/profileCache";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = "#15803D";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";
const GOLD = "#F59E0B";
const GOLD_SOFT = "#FEF3C7";

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
  const segments = useSegments();
  const queryClient = useQueryClient();
  const insets = useAppSafeAreaInsets();
  /** Pushed from food home (`/profile`) — root layout omits the status-bar spacer. */
  const inProfileStack = segments[0] === "profile";
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const profileTopPad =
    (inProfileStack || hideStatusBarSpacer ? insets.top : 0) + STATUS_BAR_TO_HEADER_GAP + 6;
  const { data: profile } = useProfile();
  const { data: subscriptionStatus } = useCurrentSubscription(true);

  useLayoutEffect(() => {
    if (!inProfileStack) return;
    // Food grid-first leaves immersive chrome; reset before first paint on /profile stack.
    useScreenChromeStore.getState().setImmersiveStatusBarChrome(false);
    useScreenChromeStore.setState({
      statusBarBackground: PAGE_BG,
      statusBarStyle: "dark",
      hideStatusBarSpacer: false,
    });
  }, [inProfileStack]);

  useFocusEffect(
    useCallback(() => {
      if (inProfileStack) {
        useScreenChromeStore.getState().setImmersiveStatusBarChrome(false);
      }
      useScreenChromeStore.setState({
        statusBarBackground: PAGE_BG,
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
      });
      void queryClient.invalidateQueries({ queryKey: ["referral", "config", "customer"] });
    }, [queryClient, inProfileStack])
  );

  const displayName = profile?.full_name?.trim() || t("common.customer");
  const initials = useMemo(() => getNameInitials(displayName), [displayName]);
  const email = profile?.email?.trim() || null;
  const lifetimeSavingsDisplay = useMemo(() => {
    const amount = profile?.lifetime_savings_inr ?? 0;
    const rounded = Math.round(Math.max(0, amount));
    return rounded.toLocaleString("en-IN");
  }, [profile?.lifetime_savings_inr]);
  const referralCode = profile?.referral_code ?? null;
  const { data: referralConfig } = useQuery({
    queryKey: ["referral", "config", "customer"],
    queryFn: () => referralService.getConfig(),
    staleTime: 30_000,
  });
  const showReferralUi = referralConfig?.referralEnabled === true;
  const referralCopy = presentReferralCopy({
    audience: "customer",
    referralEnabled: referralConfig?.referralEnabled,
    rewardEnabled: referralConfig?.rewardEnabled,
    rewardsPaused: referralConfig?.rewardSummary?.rewardsPaused,
    currency: referralConfig?.currency,
    minOrderAmount: referralConfig?.minOrderAmount,
    requireKyc: referralConfig?.requireKyc,
    firstOrderOnly: referralConfig?.firstOrderOnly,
    milestones: referralConfig?.milestones,
  });
  const customerId = profile?.customer_id ?? profile?.user_id ?? null;
  const isEmailVerified = profile?.is_email_verified ?? false;
  const profileImageUrl = profile?.profile_image_url?.trim() || null;
  const hasCustomUpload = isCustomProfileUploadUrl(profileImageUrl);
  const avatarCandidates = useMemo(() => {
    if (!hasCustomUpload || !profileImageUrl) return [];
    const abs = toAbsoluteImageUrl(profileImageUrl);
    return abs ? [abs] : [];
  }, [hasCustomUpload, profileImageUrl]);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [membershipSheetVisible, setMembershipSheetVisible] = useState(false);
  const [photoSourceSheetVisible, setPhotoSourceSheetVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const avatarUri = avatarCandidates[avatarIndex] ?? null;
  const showAvatarImage = !!avatarUri;
  const subscriptionActive = subscriptionStatus?.active ?? profile?.gmitra_plus_active ?? false;
  const subscriptionPlanName =
    subscriptionStatus?.subscription?.planName ??
    subscriptionStatus?.plan?.planName ??
    "Membership";

  useEffect(() => {
    setAvatarIndex(0);
  }, [avatarCandidates]);

  const handleAvatarError = useCallback(() => {
    setAvatarIndex((current) => {
      if (current + 1 < avatarCandidates.length) return current + 1;
      return current;
    });
  }, [avatarCandidates.length]);

  const pickProfilePhoto = useCallback(
    async (source: "camera" | "library") => {
      try {
        const perm =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow access to update your profile photo.");
          return;
        }

        const res =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
              });

        if (res.canceled || !res.assets?.[0]?.uri) return;

        const asset = res.assets[0];
        const name = asset.fileName ?? `profile-${Date.now()}.jpg`;
        const mimeType = asset.mimeType ?? "image/jpeg";

        setUploadingPhoto(true);
        const { profile_image_url } = await profileService.uploadProfileImage({
          uri: asset.uri,
          name,
          mimeType,
        });

        queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, (prev) => {
          if (!prev || typeof prev !== "object") return prev;
          const next = { ...prev, profile_image_url };
          void writeCachedProfile(next);
          return next;
        });
        setAvatarIndex(0);
        void invalidateProfileCache(queryClient);
      } catch (err) {
        Alert.alert(
          "Upload failed",
          err instanceof Error ? err.message : "Could not upload profile photo. Try again."
        );
      } finally {
        setUploadingPhoto(false);
      }
    },
    [queryClient]
  );

  const handleChangePhoto = useCallback(() => {
    if (uploadingPhoto) return;
    setPhotoSourceSheetVisible(true);
  }, [uploadingPhoto]);

  const handleAvatarPress = useCallback(() => {
    if (uploadingPhoto) return;
    if (showAvatarImage) {
      setPhotoViewerVisible(true);
      return;
    }
    setPhotoSourceSheetVisible(true);
  }, [uploadingPhoto, showAvatarImage]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard`);
    } catch {
      Alert.alert("Error", "Could not copy");
    }
  }, []);

  const subscriptionBenefits = useMemo(() => {
    const planBenefits = subscriptionStatus?.plan?.benefits;
    if (planBenefits?.length) return planBenefits;
    if (subscriptionActive) {
      return ["Your membership benefits apply automatically on eligible orders."];
    }
    return [
      "Free delivery on eligible orders",
      "Exclusive member-only offers",
      "Priority support during peak hours",
    ];
  }, [subscriptionStatus?.plan?.benefits, subscriptionActive]);

  const freeDeliveryNote = useMemo(() => {
    const freeDeliveryRadius = subscriptionStatus?.plan?.maxFreeDeliveryRadiusKm;
    if (!subscriptionStatus?.plan?.freeDeliveryEnabled || freeDeliveryRadius == null) return null;
    return `Free delivery within ${freeDeliveryRadius} km on eligible orders.`;
  }, [
    subscriptionStatus?.plan?.freeDeliveryEnabled,
    subscriptionStatus?.plan?.maxFreeDeliveryRadiusKm,
  ]);

  const handleSubscriptionPress = useCallback(() => {
    setMembershipSheetVisible(true);
  }, []);

  const handleReferNow = useCallback(() => {
    void shareReferralCode(referralCode, displayName, null, referralCopy);
  }, [referralCode, displayName, referralCopy]);

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
    ...(showReferralUi
      ? [{ id: "rewards", label: t("profile.rewardsAndReferrals"), icon: "gift-outline" as const, path: "/profile/referrals", badge: "New" }]
      : []),
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
        <View style={[styles.profileCard, { marginTop: profileTopPad }]}>
          <View style={styles.profileCardBody}>
            <View style={styles.identityRow}>
              <View style={styles.avatarWrap}>
                <Pressable
                  style={styles.avatar}
                  onPress={handleAvatarPress}
                  disabled={uploadingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel={showAvatarImage ? "View profile photo" : "Change profile photo"}
                >
                  {showAvatarImage ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                      onError={handleAvatarError}
                    />
                  ) : (
                    <AppText style={styles.avatarText}>{initials}</AppText>
                  )}
                </Pressable>
                <Pressable
                  style={styles.avatarCameraBadge}
                  onPress={handleChangePhoto}
                  disabled={uploadingPhoto}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={11} color="#fff" />
                  )}
                </Pressable>
                {isEmailVerified && !showAvatarImage ? (
                  <View style={styles.avatarVerifiedDot}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                  </View>
                ) : null}
              </View>
              <View style={styles.identityBody}>
                <AppText style={styles.userName} numberOfLines={1}>{displayName}</AppText>
                {email ? (
                  <View style={styles.emailRow}>
                    <AppText style={styles.userEmail} numberOfLines={1}>{email}</AppText>
                    {isEmailVerified ? (
                      <View style={styles.emailVerifiedTag}>
                        <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                        <AppText style={styles.emailVerifiedText}>Verified</AppText>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <AppText style={styles.userEmail}>Add email in profile</AppText>
                )}
                <Pressable style={styles.editLink} onPress={() => router.push("/profile/edit")}>
                  <AppText style={styles.editLinkText}>{t("profile.editProfile")}</AppText>
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
            <AppText style={styles.plusStripText}>
              {subscriptionActive ? `${subscriptionPlanName} Active` : `Join ${subscriptionPlanName}`}
            </AppText>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Lifetime savings */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsRow}>
            <View style={styles.savingsIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={GREEN_DARK} />
            </View>
            <AppText style={styles.savingsLabel} numberOfLines={1}>
              {t("profile.lifetimeSavings")}
            </AppText>
            <AppText style={styles.savingsValue} numberOfLines={1}>
              ₹{lifetimeSavingsDisplay}
            </AppText>
          </View>
        </View>

        {/* Customer / Referral IDs */}
        {(customerId || (showReferralUi && referralCode)) ? (
          <View style={styles.idCard}>
            {customerId ? (
              <TouchableOpacity style={styles.idRow} onPress={() => copyToClipboard(customerId, "Customer ID")}>
                <AppText style={styles.idLabel}>{t("profile.customerId")}</AppText>
                <View style={styles.idValueRow}>
                  <AppText style={styles.idValue}>{customerId}</AppText>
                  <Ionicons name="copy-outline" size={15} color={MUTED} />
                </View>
              </TouchableOpacity>
            ) : null}
            {customerId && showReferralUi && referralCode ? <View style={styles.idDivider} /> : null}
            {showReferralUi && referralCode ? (
              <TouchableOpacity style={styles.idRow} onPress={() => copyToClipboard(referralCode, t("profile.referralId"))}>
                <AppText style={styles.idLabel}>{t("profile.referralId")}</AppText>
                <View style={styles.idValueRow}>
                  <AppText style={styles.idValue}>{referralCode}</AppText>
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
            <AppText style={styles.addressTitle}>{addressLine ? "Delivery address" : "Add delivery address"}</AppText>
            <AppText style={styles.addressSub} numberOfLines={2}>
              {addressLine ?? "Save your home or work for faster checkout"}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Menu list */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuRow, index < menuItems.length - 1 && styles.menuRowBorder]}
              onPress={() => {
                if (!item.path) return;
                if (item.path === "/wallet") markWalletEntrySource("default");
                router.push(item.path as never);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name={item.icon} size={20} color={TEXT} />
              <AppText style={styles.menuLabel}>{item.label}</AppText>
              {item.badge ? (
                <View style={styles.menuBadge}>
                  <AppText style={styles.menuBadgeText}>{item.badge}</AppText>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={17} color="#C4C4C4" />
            </TouchableOpacity>
          ))}
        </View>

        {showReferralUi ? (
          <View style={styles.referCard}>
            <AppText style={styles.referTitle}>{referralCopy.title}</AppText>
            <AppText style={styles.referSub}>{referralCopy.subtitle}</AppText>
            <TouchableOpacity style={styles.referBtn} activeOpacity={0.9} onPress={handleReferNow}>
              <AppText style={styles.referBtnText}>{t("profile.referNow")}</AppText>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : null}

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

      <ProfilePhotoSourceSheet
        visible={photoSourceSheetVisible}
        hasPhoto={hasCustomUpload && showAvatarImage}
        onClose={() => setPhotoSourceSheetVisible(false)}
        onPickCamera={() => void pickProfilePhoto("camera")}
        onPickGallery={() => void pickProfilePhoto("library")}
        onViewPhoto={() => setPhotoViewerVisible(true)}
      />

      <ProfilePhotoViewerSheet
        visible={photoViewerVisible}
        imageUri={avatarUri}
        onClose={() => setPhotoViewerVisible(false)}
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
  avatarWrap: {
    width: 68,
    height: 68,
    position: "relative",
  },
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
    marginTop: 2,
    marginLeft: 2,
  },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarVerifiedDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 3,
  },
  avatarCameraBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN_DARK,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 3,
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
