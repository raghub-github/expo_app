// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
// @refresh reset
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { ProfileSubscriptionCard } from "@/src/components/profile/ProfileSubscriptionCard";
import { ProfileInstagramCard } from "@/src/components/profile/ProfileInstagramCard";
import { ProfileCommunityCards } from "@/src/components/profile/ProfileCommunityCards";
import { ProfileReferralCard } from "@/src/components/profile/ProfileReferralCard";
import { ProfileLogoutRow } from "@/src/components/profile/ProfileLogoutRow";
import { useLogoutSheetStore } from "@/src/stores/logoutSheetStore";
import { ProfileMenuSections } from "@/src/components/profile/ProfileMenuSections";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { formatVehicleSubtitle } from "@/src/lib/rider-vehicle-options";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { PROFILE_CARD_RADIUS } from "@/src/components/profile/ProfilePromoCard";
import { profileHeroShadow } from "@/src/components/profile/profileCardShadow";
import { RiderRatingBadge } from "@/src/components/profile/RiderRatingBadge";
import { formatRiderRatingDisplay } from "@/src/lib/format-rider-rating";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

const PAGE_BG = "#F4F6F8";
const PAD = 16;
const CARD_RADIUS = PROFILE_CARD_RADIUS;
const SECTION_GAP = 14;

function riderDisplayId(riderId?: string | null, userId?: string) {
  if (riderId && /^\d+$/.test(String(riderId))) return `GMR${riderId}`;
  if (userId) {
    const m = userId.match(/usr_(\d+)/);
    if (m) return `GMR${m[1]}`;
  }
  if (!userId) return "—";
  const compact = userId.replace(/\D/g, "").slice(-6) || userId.slice(0, 8).toUpperCase();
  return `GM${compact}`;
}

function initialsFromName(name?: string | null) {
  if (!name?.trim()) return "GM";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function firstNameFrom(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function ProfilePage() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const onboardingData = useOnboardingStore((s) => s.data);
  const riderId = session?.riderId ?? session?.userId;
  const { data: riderStatus } = useRiderStatus(riderId);
  const { data: vehicleStatus } = useRiderVehicle();
  const [avatarError, setAvatarError] = useState(false);
  const openLogoutSheet = useLogoutSheetStore((s) => s.open);
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);

  const riderName =
    riderStatus?.name?.trim() ||
    onboardingData.fullName?.trim() ||
    t("profile.partnerLabel", "GatiMitra Partner");

  const firstName = firstNameFrom(riderName);
  const displayId = riderDisplayId(riderId, session?.userId);

  const rawAvatarUri =
    riderStatus?.selfieUrl ||
    onboardingData.selfieSignedUrl ||
    onboardingData.selfieUri ||
    null;

  const avatarUri = useMemo(() => toAbsoluteImageUrl(rawAvatarUri), [rawAvatarUri]);

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUri]);

  const showAvatar = Boolean(avatarUri) && !avatarError;
  const avatarInitials = initialsFromName(riderName);

  const kycLabel = useMemo(() => {
    const status = riderStatus?.approvalStatus?.toUpperCase();
    if (status === "APPROVED" || status === "VERIFIED") return t("profile.verified");
    if (status === "PENDING" || status === "UNDER_REVIEW") return t("profile.pending");
    return t("profile.notVerified");
  }, [riderStatus?.approvalStatus, t]);

  const isVerified = kycLabel === t("profile.verified");

  const cityLabel =
    riderStatus?.homeAddress?.city?.trim() ||
    onboardingData.city?.trim() ||
    t("profile.cityFallback");

  const vehicleSubtitle = formatVehicleSubtitle(
    vehicleStatus?.vehicle ?? null,
    Boolean(vehicleStatus?.isComplete),
    t("profile.vehicleIncomplete", "Add vehicle details"),
  );

  const openProfile = () => router.push("/view-profile");

  const ratingDisplay = formatRiderRatingDisplay(riderStatus?.rating);
  const referralCode = riderStatus?.referralCode?.trim() || null;

  const verifiedLines = t("profile.verifiedPartner", "Verified Partner").split(/\s+/);
  const ribbonTop = verifiedLines.slice(0, -1).join(" ") || "Verified";
  const ribbonBottom = verifiedLines.length > 1 ? verifiedLines[verifiedLines.length - 1] : "Partner";

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={["#0F766E", "#0D9488", "#10B981", "#22C55E"]}
            locations={[0, 0.32, 0.68, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.heroGradient}
          >
            {isVerified ? (
              <View style={styles.ribbon} pointerEvents="none">
                <View style={styles.ribbonInner}>
                  <Ionicons name="shield-checkmark" size={14} color="#FFF" />
                  <Text style={styles.ribbonTxt}>{ribbonTop}</Text>
                  <Text style={styles.ribbonTxt}>{ribbonBottom}</Text>
                </View>
              </View>
            ) : null}

            {ratingDisplay ? (
              <RiderRatingBadge
                rating={ratingDisplay}
                style={[styles.ratingBadge, isVerified && styles.ratingBelowRibbon]}
                variant="light"
              />
            ) : null}

            <View style={styles.heroContent}>
              <Pressable onPress={openProfile} style={styles.avatarBox}>
                <View style={styles.avatarCircle}>
                  {showAvatar && avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImg}
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <Text style={styles.avatarLetters}>{avatarInitials}</Text>
                  )}
                </View>
                <View style={styles.camBtn}>
                  <Ionicons name="camera" size={12} color="#0F766E" />
                </View>
              </Pressable>

              <View style={styles.heroText}>
                <Text style={styles.hello} numberOfLines={1}>
                  {t("profile.hiGreeting", { name: firstName, defaultValue: `Hi, ${firstName} 👋` })}
                </Text>
                <Text style={styles.heroSub}>
                  {t("profile.managePartnerProfile", "Manage your partner profile")}
                </Text>
                <Text style={styles.riderId}>
                  {t("profile.riderIdLabel", {
                    id: displayId,
                    defaultValue: `Rider ID: ${displayId}`,
                  })}
                </Text>
                <Pressable
                  onPress={openProfile}
                  style={({ pressed }) => [styles.viewProfileBtn, pressed && styles.viewProfileBtnPressed]}
                >
                  <Text style={styles.viewProfileLabel} numberOfLines={1}>
                    {t("profile.viewProfile", "View Profile")}
                    <Text style={styles.viewProfileChevron}>{" \u203A"}</Text>
                  </Text>
                </Pressable>
              </View>
            </View>

            {referralCode ? (
              <View style={styles.referralCorner} pointerEvents="none">
                <Text style={styles.referralCornerLabel}>
                  {t("profile.referralId", "Referral ID")}
                </Text>
                <Text style={styles.referralCornerCode} numberOfLines={1}>
                  {referralCode}
                </Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>

        <View style={styles.promoStack}>
          <ProfileSubscriptionCard />
          <View style={styles.stackSpacer} />
          <ProfileInstagramCard />
          <View style={styles.stackSpacer} />
          <ProfileCommunityCards />
          <View style={styles.stackSpacer} />
          <ProfileReferralCard referralCode={referralCode} riderName={riderName} />
          <View style={styles.stackSpacer} />
          <ProfileMenuSections
            riderName={riderName}
            cityLabel={cityLabel}
            vehicleSubtitle={vehicleSubtitle}
            kycLabel={kycLabel}
            kycVerified={isVerified}
            onLanguagePress={() => setLanguageSheetVisible(true)}
          />
          <View style={styles.stackSpacer} />
          <ProfileLogoutRow onPress={openLogoutSheet} />
        </View>
      </ScrollView>

      <LanguageSelectionSheet
        visible={languageSheetVisible}
        onClose={() => setLanguageSheetVisible(false)}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 12,
    paddingBottom: 16,
  },
  promoStack: {
    width: "100%",
    alignSelf: "stretch",
  },
  stackSpacer: {
    height: SECTION_GAP,
    width: "100%",
  },
  heroCard: {
    width: "100%",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    marginBottom: SECTION_GAP,
    ...profileHeroShadow,
  },
  heroGradient: {
    paddingHorizontal: PAD,
    paddingVertical: 18,
    minHeight: 140,
    position: "relative",
  },
  ratingBadge: {
    position: "absolute",
    top: 10,
    right: PAD,
    zIndex: 2,
  },
  ratingBelowRibbon: {
    top: 58,
  },
  ribbon: {
    position: "absolute",
    top: 0,
    right: PAD,
    zIndex: 3,
  },
  ribbonInner: {
    backgroundColor: "#065F46",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: "center",
  },
  ribbonTxt: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
    textAlign: "center",
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 56,
  },
  avatarBox: {
    position: "relative",
    marginRight: 14,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: "#FFF",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetters: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFF",
  },
  camBtn: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  hello: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
  },
  heroSub: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
  },
  riderId: {
    marginTop: 4,
    fontSize: 11.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
  },
  viewProfileBtn: {
    alignSelf: "flex-start",
    flexShrink: 0,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(6, 78, 59, 0.72)",
  },
  viewProfileBtnPressed: {
    backgroundColor: "rgba(6, 78, 59, 0.88)",
  },
  viewProfileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    flexShrink: 0,
  },
  viewProfileChevron: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  referralCorner: {
    position: "absolute",
    right: PAD,
    bottom: 12,
    alignItems: "flex-end",
    maxWidth: "42%",
  },
  referralCornerLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  referralCornerCode: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
