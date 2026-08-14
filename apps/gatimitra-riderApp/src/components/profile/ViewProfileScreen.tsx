// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { useSessionStore } from "@/src/stores/sessionStore";
import { SUPPORTED_LANGUAGES } from "@/src/stores/languageStore";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";
import { colors } from "@/src/theme";
import { fetchRiderReferralConfig } from "@/src/services/referral.service";

const TEAL = colors.primary[600];
const TEAL_LIGHT = colors.primary[50];
const TEAL_BORDER = colors.primary[200];

function initialsFromName(name?: string | null) {
  if (!name?.trim()) return "GM";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function formatMobile(mobile?: string | null) {
  if (!mobile?.trim()) return "—";
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile.trim();
}

function approvalLabel(status: string, t: (key: string, fallback?: string) => string) {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return t("profile.verified", "Verified");
    case "PENDING_APPROVAL":
    case "DRAFT":
      return t("profile.pending", "Pending");
    case "REJECTED":
      return t("profile.viewProfileDetails.rejected", "Rejected");
    case "SUSPENDED":
      return t("profile.viewProfileDetails.suspended", "Suspended");
    default:
      return t("profile.notVerified", "Not Verified");
  }
}

type ReadOnlyFieldProps = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function ReadOnlyField({ label, value, icon }: ReadOnlyFieldProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconWrap}>
        <Ionicons name={icon} size={18} color={TEAL} />
      </View>
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      <Ionicons name="lock-closed" size={14} color="#CBD5E1" />
    </View>
  );
}

export function ViewProfileScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const riderId = session?.riderId ?? session?.userId;
  const { data: profile, isLoading, isError, refetch, isRefetching } = useRiderProfile();
  const { data: riderStatus } = useRiderStatus(riderId);
  const [avatarError, setAvatarError] = useState(false);
  const [showReferralUi, setShowReferralUi] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRiderReferralConfig(controller.signal).then((config) => {
      setShowReferralUi(config?.referralEnabled === true);
    });
    return () => controller.abort();
  }, []);

  const displayProfile = profile
    ? {
        ...profile,
        name: profile.name ?? riderStatus?.name ?? null,
        city: profile.city ?? riderStatus?.homeAddress?.city ?? null,
        mobile: profile.mobile?.trim() || riderStatus?.mobile?.trim() || null,
        referralCode:
          profile.referralCode?.trim() || riderStatus?.referralCode?.trim() || null,
        preferredLanguage:
          profile.preferredLanguage || riderStatus?.preferredLanguage || "en",
        selfieUrl: profile.selfieUrl ?? riderStatus?.selfieUrl ?? null,
        riderDisplayId:
          profile.riderDisplayId ??
          (riderId && /^\d+$/.test(String(riderId)) ? `GMR${riderId}` : "—"),
      }
    : null;

  const avatarUri = useMemo(
    () => (displayProfile?.selfieUrl ? toAbsoluteImageUrl(displayProfile.selfieUrl) : null),
    [displayProfile?.selfieUrl],
  );

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUri]);

  const languageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === displayProfile?.preferredLanguage)?.native ??
    SUPPORTED_LANGUAGES.find((l) => l.code === displayProfile?.preferredLanguage)?.label ??
    displayProfile?.preferredLanguage ??
    "—";

  const showAvatar = Boolean(avatarUri) && !avatarError;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t("profile.viewProfileDetails.title", "My Profile")}</Text>
          <Text style={styles.headerSub}>
            {t("profile.viewProfileDetails.subtitle", "Your registered partner details")}
          </Text>
        </View>
      </View>

      {isLoading && !displayProfile ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.centerStateText}>
            {t("profile.viewProfileDetails.loading", "Loading your profile…")}
          </Text>
        </View>
      ) : isError || !displayProfile ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
          <Text style={styles.centerStateTitle}>
            {t("profile.viewProfileDetails.loadFailed", "Could not load profile")}
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={TEAL} />
          }
        >
          <View style={styles.heroCard}>
            <View style={styles.avatarCircle}>
              {showAvatar && avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImg}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <Text style={styles.avatarLetters}>{initialsFromName(displayProfile.name)}</Text>
              )}
            </View>
            <Text style={styles.heroName}>{displayProfile.name?.trim() || "—"}</Text>
            <Text style={styles.heroId}>{displayProfile.riderDisplayId}</Text>
            <View style={styles.readOnlyBadge}>
              <Ionicons name="lock-closed" size={12} color={TEAL} />
              <Text style={styles.readOnlyBadgeText}>
                {t("profile.viewProfileDetails.readOnlyNote", "Details cannot be changed in the app")}
              </Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              {t("profile.viewProfileDetails.personalSection", "Personal information")}
            </Text>
            <ReadOnlyField
              label={t("onboarding.profile.fullName", "Full Name")}
              value={displayProfile.name?.trim() || "—"}
              icon="person-outline"
            />
            <ReadOnlyField
              label={t("profile.viewProfileDetails.mobile", "Mobile number")}
              value={formatMobile(displayProfile.mobile)}
              icon="call-outline"
            />
            <ReadOnlyField
              label={t("onboarding.profile.city", "City")}
              value={displayProfile.city?.trim() || "—"}
              icon="location-outline"
            />
            {displayProfile.state?.trim() ? (
              <ReadOnlyField
                label={t("profile.viewProfileDetails.state", "State")}
                value={displayProfile.state.trim()}
                icon="map-outline"
              />
            ) : null}
            {displayProfile.address?.trim() ? (
              <ReadOnlyField
                label={t("profile.viewProfileDetails.address", "Address")}
                value={[displayProfile.address, displayProfile.pincode].filter(Boolean).join(", ")}
                icon="home-outline"
              />
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              {t("profile.viewProfileDetails.preferencesSection", "Preferences & referral")}
            </Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconWrap}>
                <Ionicons name="language-outline" size={18} color={TEAL} />
              </View>
              <View style={styles.fieldBody}>
                <Text style={styles.fieldLabel}>
                  {t("onboarding.profile.preferredLanguage", "Preferred Language")}
                </Text>
                <View style={styles.languageChip}>
                  <Text style={styles.languageChipText}>{languageLabel}</Text>
                </View>
              </View>
              <Ionicons name="lock-closed" size={14} color="#CBD5E1" />
            </View>
            {showReferralUi ? (
              <ReadOnlyField
                label={t("profile.viewProfileDetails.myReferralCode", "Your referral code")}
                value={displayProfile.referralCode?.trim() || "—"}
                icon="gift-outline"
              />
            ) : null}
            {displayProfile.referredByDisplayId ? (
              <ReadOnlyField
                label={t("profile.viewProfileDetails.referredBy", "Referred by")}
                value={displayProfile.referredByDisplayId}
                icon="people-outline"
              />
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              {t("profile.viewProfileDetails.accountSection", "Account status")}
            </Text>
            <ReadOnlyField
              label={t("profile.kycStatus", "KYC Status")}
              value={approvalLabel(displayProfile.approvalStatus ?? riderStatus?.approvalStatus ?? "", t)}
              icon="shield-checkmark-outline"
            />
            <ReadOnlyField
              label={t("profile.viewProfileDetails.accountStatus", "Account status")}
              value={(displayProfile.accountStatus ?? riderStatus?.accountStatus ?? "—").replace(/_/g, " ")}
              icon="briefcase-outline"
            />
          </View>

          <Text style={styles.footerHint}>
            {t(
              "profile.viewProfileDetails.supportHint",
              "To update any detail, contact GatiMitra rider support.",
            )}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  backBtnPressed: {
    opacity: 0.75,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#64748B",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerStateText: {
    fontSize: 14,
    color: "#64748B",
  },
  centerStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TEAL,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  heroCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: TEAL_BORDER,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetters: {
    fontSize: 28,
    fontWeight: "700",
    color: TEAL,
  },
  heroName: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  heroId: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: TEAL,
    letterSpacing: 0.5,
  },
  readOnlyBadge: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: TEAL_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  readOnlyBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: TEAL,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  fieldIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBody: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  languageChip: {
    alignSelf: "flex-start",
    backgroundColor: TEAL,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  languageChipText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footerHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
});
