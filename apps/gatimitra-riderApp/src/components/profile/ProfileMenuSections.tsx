// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
// @refresh reset
import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import {
  SUPPORTED_LANGUAGES,
  useLanguageStore,
} from "@/src/stores/languageStore";
import { ProfileListCard } from "@/src/components/profile/ProfileListCard";

type ProfileMenuSectionsProps = {
  riderName: string;
  cityLabel: string;
  kycLabel: string;
  kycVerified: boolean;
  vehicleSubtitle: string;
  onLanguagePress: () => void;
};

export function ProfileMenuSections({
  riderName,
  cityLabel,
  kycLabel,
  kycVerified,
  vehicleSubtitle,
  onLanguagePress,
}: ProfileMenuSectionsProps) {
  const { t, i18n } = useTranslation();
  const permissions = usePermissionStore((s) => s.permissions);
  const selectedLanguage = useLanguageStore((s) => s.selectedLanguage);

  const languageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === (selectedLanguage || i18n.language))?.label ??
    "English";

  const notificationsEnabled =
    permissions?.notifications === "granted" || permissions?.notifications === "limited";

  return (
    <>
      <ProfileListCard
        headerIcon="person-outline"
        headerIconColor="#7C3AED"
        headerIconBg="#EDE9FE"
        title={t("profile.account")}
        subtitle={t("profile.accountSub")}
        rows={[
          {
            key: "personal",
            icon: "person-outline",
            iconColor: "#7C3AED",
            iconBg: "#EDE9FE",
            title: t("profile.personalInfo"),
            subtitle: riderName || cityLabel,
            onPress: () => router.push("/view-profile"),
          },
          {
            key: "kyc",
            icon: "shield-checkmark-outline",
            iconColor: "#059669",
            iconBg: "#D1FAE5",
            title: t("profile.kycStatus"),
            subtitle: kycLabel,
            subtitleTone: kycVerified ? "success" : "warning",
            onPress: () => router.push("/view-documents"),
          },
          {
            key: "vehicle",
            icon: "bicycle-outline",
            iconColor: "#2563EB",
            iconBg: "#DBEAFE",
            title: t("profile.vehicle"),
            subtitle: vehicleSubtitle,
            onPress: () => router.push("/view-vehicle"),
          },
          {
            key: "my-rides",
            icon: "car-outline",
            iconColor: "#0D9488",
            iconBg: "#CCFBF1",
            title: t("profile.myOrders.menu", "My Orders"),
            subtitle: t("profile.myOrders.menuSub", "Food, ride & parcel history"),
            onPress: () => router.push("/my-rides"),
          },
        ]}
      />

      <View style={styles.sectionSpacer} />

      <ProfileListCard
        headerIcon="settings-outline"
        headerIconColor="#7C3AED"
        headerIconBg="#EDE9FE"
        title={t("profile.settings")}
        subtitle={t("profile.settingsSub")}
        rows={[
          {
            key: "language",
            icon: "language-outline",
            iconColor: "#7C3AED",
            iconBg: "#EDE9FE",
            title: t("profile.language"),
            subtitle: languageLabel,
            onPress: onLanguagePress,
          },
          {
            key: "notifications",
            icon: "notifications-outline",
            iconColor: "#EA580C",
            iconBg: "#FFEDD5",
            title: t("profile.notifications"),
            subtitle: notificationsEnabled
              ? t("profile.manage", "Manage")
              : t("profile.notificationSettings.tapToEnable", "Tap to enable"),
            subtitleTone: notificationsEnabled ? "success" : "warning",
            onPress: () => router.push("/notification-settings"),
          },
          {
            key: "device-sessions",
            icon: "phone-portrait-outline",
            iconColor: "#4F46E5",
            iconBg: "#EEF2FF",
            title: t("profile.deviceSessions.menu", "Logged-in devices"),
            subtitle: t("profile.deviceSessions.menuSub", "Manage sessions & log out others"),
            onPress: () => router.push("/device-sessions"),
          },
        ]}
      />

      <View style={styles.sectionSpacer} />

      <ProfileListCard
        headerIcon="headset-outline"
        headerIconColor="#059669"
        headerIconBg="#D1FAE5"
        title={t("profile.support")}
        subtitle={t("profile.supportSub")}
        rows={[
          {
            key: "raise-ticket",
            icon: "add-circle-outline",
            iconColor: "#059669",
            iconBg: "#D1FAE5",
            title: t("profile.raiseTicket"),
            subtitle: t("profile.raiseTicketSub"),
            onPress: () => router.push("/raise-ticket"),
          },
          {
            key: "my-queue",
            icon: "list-outline",
            iconColor: "#2563EB",
            iconBg: "#DBEAFE",
            title: t("profile.myQueue", "My queue"),
            subtitle: t("profile.myQueueMenuSub", "Tickets you have raised"),
            onPress: () => router.push("/my-tickets"),
          },
          {
            key: "team-leader",
            icon: "people-outline",
            iconColor: "#7C3AED",
            iconBg: "#EDE9FE",
            title: t("profile.teamLeader.menu", "Connect with Team Leader"),
            subtitle: t(
              "profile.teamLeader.temporarilyUnavailable",
              "Temporarily unavailable"
            ),
            disabled: true,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionSpacer: {
    height: 14,
    width: "100%",
  },
});
