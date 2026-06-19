// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect } from "expo-router";
import { colors } from "@/src/theme";
import { PROFILE_CARD_RADIUS } from "@/src/components/profile/ProfilePromoCard";
import { usePermissionStore } from "@/src/stores/permissionStore";
import {
  useNotificationSettingsStore,
  type RiderNotificationPrefs,
} from "@/src/stores/notificationSettingsStore";
import { openNotificationPermissionSettings } from "@/src/services/permissions/androidIntents";
import {
  getNotificationPermissions,
  requestNotificationPermissions,
} from "@/src/services/permissions/notificationsWrapper";

const TEAL = colors.primary[600];
const PAGE_BG = "#F4F6F8";

type ToggleRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
};

type DeviceControlChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function DeviceControlChip({ icon, label }: DeviceControlChipProps) {
  return (
    <View style={styles.deviceChip}>
      <View style={styles.deviceChipIcon}>
        <Ionicons name={icon} size={18} color={TEAL} />
      </View>
      <Text style={styles.deviceChipLabel}>{label}</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: ToggleRowProps) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={[styles.toggleIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: "#E2E8F0", true: "#99F6E4" }}
        thumbColor={value ? TEAL : "#F8FAFC"}
      />
    </View>
  );
}

export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const prefs = useNotificationSettingsStore((s) => s.prefs);
  const hydrated = useNotificationSettingsStore((s) => s.hydrated);
  const hydrate = useNotificationSettingsStore((s) => s.hydrate);
  const setPref = useNotificationSettingsStore((s) => s.setPref);
  const refreshPermissions = usePermissionStore((s) => s.refreshPermissions);
  const systemGranted = usePermissionStore(
    (s) =>
      s.permissions?.notifications === "granted" ||
      s.permissions?.notifications === "limited",
  );

  const [liveGranted, setLiveGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const permissionOk = liveGranted ?? systemGranted;

  const syncPermission = useCallback(async () => {
    const live = await getNotificationPermissions();
    setLiveGranted(live.status === "granted");
    await refreshPermissions();
  }, [refreshPermissions]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      void syncPermission();
    }, [syncPermission]),
  );

  const handleMasterToggle = async (enabled: boolean) => {
    if (!enabled) {
      await setPref("pushEnabled", false);
      return;
    }
    setBusy(true);
    try {
      const result = await requestNotificationPermissions();
      const granted = result.status === "granted";
      setLiveGranted(granted);
      await refreshPermissions();
      if (granted) {
        await setPref("pushEnabled", true);
      } else {
        await setPref("pushEnabled", false);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryToggle = async (key: keyof RiderNotificationPrefs, value: boolean) => {
    if (!permissionOk || !prefs.pushEnabled) return;
    await setPref(key, value);
  };

  const categoriesDisabled = !permissionOk || !prefs.pushEnabled;

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.headerTitle}>
            {t("profile.notificationSettings.title", "Notification settings")}
          </Text>
          <Text style={styles.headerSub}>
            {t(
              "profile.notificationSettings.subtitle",
              "Choose which alerts you want on this device",
            )}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.statusBanner,
            permissionOk ? styles.statusBannerOk : styles.statusBannerWarn,
          ]}
        >
          <Ionicons
            name={permissionOk ? "checkmark-circle" : "alert-circle"}
            size={22}
            color={permissionOk ? "#059669" : "#D97706"}
          />
          <View style={styles.statusBannerText}>
            <Text style={styles.statusBannerTitle}>
              {permissionOk
                ? t("profile.notificationSettings.deviceOn", "Notifications allowed on device")
                : t("profile.notificationSettings.deviceOff", "Notifications blocked on device")}
            </Text>
            <Text style={styles.statusBannerSub}>
              {permissionOk
                ? t(
                    "profile.notificationSettings.deviceOnHint",
                    "You will receive push alerts when categories below are on.",
                  )
                : t(
                    "profile.notificationSettings.deviceOffHint",
                    "Enable notifications in your phone settings to get order alerts.",
                  )}
            </Text>
          </View>
        </View>

        {!permissionOk ? (
          <Pressable
            onPress={() => void openNotificationPermissionSettings()}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>
              {t("profile.notificationSettings.openDeviceSettings", "Open device settings")}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: "#FFEDD5" }]}>
              <Ionicons name="notifications" size={18} color="#EA580C" />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>
                {t("profile.notificationSettings.pushTitle", "Push notifications")}
              </Text>
              <Text style={styles.cardSub}>
                {t(
                  "profile.notificationSettings.pushSub",
                  "Master switch for GatiMitra alerts on this phone",
                )}
              </Text>
            </View>
          </View>
          <ToggleRow
            icon="notifications-outline"
            iconColor="#EA580C"
            iconBg="#FFEDD5"
            title={t("profile.notificationSettings.enablePush", "Enable push alerts")}
            subtitle={
              permissionOk
                ? t("profile.enabled", "Enabled")
                : t("profile.disabled", "Disabled")
            }
            value={prefs.pushEnabled && permissionOk}
            onValueChange={(v) => void handleMasterToggle(v)}
            disabled={busy || (!permissionOk && !prefs.pushEnabled)}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: "#EDE9FE" }]}>
              <Ionicons name="options-outline" size={18} color="#7C3AED" />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>
                {t("profile.notificationSettings.categoriesTitle", "Alert categories")}
              </Text>
              <Text style={styles.cardSub}>
                {t(
                  "profile.notificationSettings.categoriesSub",
                  "Turn off types you do not want to receive",
                )}
              </Text>
            </View>
          </View>

          <ToggleRow
            icon="bicycle-outline"
            iconColor="#2563EB"
            iconBg="#DBEAFE"
            title={t("profile.notificationSettings.newOrders", "New orders")}
            subtitle={t(
              "profile.notificationSettings.newOrdersSub",
              "When a new delivery is available near you",
            )}
            value={prefs.newOrders}
            onValueChange={(v) => void handleCategoryToggle("newOrders", v)}
            disabled={categoriesDisabled}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="sync-outline"
            iconColor="#0D9488"
            iconBg="#CCFBF1"
            title={t("profile.notificationSettings.orderUpdates", "Order updates")}
            subtitle={t(
              "profile.notificationSettings.orderUpdatesSub",
              "Pickup, delivery, and cancellation updates",
            )}
            value={prefs.orderUpdates}
            onValueChange={(v) => void handleCategoryToggle("orderUpdates", v)}
            disabled={categoriesDisabled}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="wallet-outline"
            iconColor="#B45309"
            iconBg="#FEF3C7"
            title={t("profile.notificationSettings.earnings", "Earnings & payouts")}
            subtitle={t(
              "profile.notificationSettings.earningsSub",
              "Payment credits and wallet updates",
            )}
            value={prefs.earnings}
            onValueChange={(v) => void handleCategoryToggle("earnings", v)}
            disabled={categoriesDisabled}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="shield-checkmark-outline"
            iconColor="#059669"
            iconBg="#D1FAE5"
            title={t("profile.notificationSettings.account", "Account & verification")}
            subtitle={t(
              "profile.notificationSettings.accountSub",
              "KYC, vehicle approval, and profile updates",
            )}
            value={prefs.accountAlerts}
            onValueChange={(v) => void handleCategoryToggle("accountAlerts", v)}
            disabled={categoriesDisabled}
          />
          <View style={styles.rowDivider} />
          <ToggleRow
            icon="pricetag-outline"
            iconColor="#BE185D"
            iconBg="#FCE7F3"
            title={t("profile.notificationSettings.offers", "Offers & announcements")}
            subtitle={t(
              "profile.notificationSettings.offersSub",
              "Promotions and partner program news",
            )}
            value={prefs.offers}
            onValueChange={(v) => void handleCategoryToggle("offers", v)}
            disabled={categoriesDisabled}
          />
        </View>

        <View style={styles.deviceCard}>
          <View style={styles.deviceCardAccent} />
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: "#CCFBF1" }]}>
              <Ionicons name="phone-portrait-outline" size={18} color={TEAL} />
            </View>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>
                {t("profile.notificationSettings.deviceControlsTitle", "Phone notification style")}
              </Text>
              <Text style={styles.cardSub}>
                {t(
                  "profile.notificationSettings.deviceControlsSub",
                  "Sound and vibration are managed on your device",
                )}
              </Text>
            </View>
          </View>

          <View style={styles.deviceChipRow}>
            <DeviceControlChip
              icon="volume-high-outline"
              label={t("profile.notificationSettings.sound", "Sound")}
            />
            <DeviceControlChip
              icon="phone-portrait-outline"
              label={t("profile.notificationSettings.vibration", "Vibration")}
            />
            <DeviceControlChip
              icon="moon-outline"
              label={t("profile.notificationSettings.dnd", "DND")}
            />
          </View>

          <View style={styles.deviceHintBox}>
            <Ionicons name="information-circle" size={18} color="#0D9488" />
            <Text style={styles.deviceHintText}>
              {t(
                "profile.notificationSettings.soundTip",
                "These options live in your phone settings for GatiMitra — not inside this app.",
              )}
            </Text>
          </View>

          <Pressable
            onPress={() => void openNotificationPermissionSettings()}
            style={({ pressed }) => [
              styles.deviceCta,
              pressed && styles.deviceCtaPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(
              "profile.notificationSettings.openPhoneSettings",
              "Open phone notification settings",
            )}
          >
            <View style={styles.deviceCtaIconWrap}>
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.deviceCtaCopy}>
              <Text style={styles.deviceCtaTitle}>
                {t(
                  "profile.notificationSettings.openPhoneSettings",
                  "Open phone notification settings",
                )}
              </Text>
              <Text style={styles.deviceCtaSub}>
                {t(
                  "profile.notificationSettings.openPhoneSettingsSub",
                  "Channels, sound, banner & priority",
                )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: PROFILE_CARD_RADIUS,
    borderWidth: 1,
  },
  statusBannerOk: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  statusBannerWarn: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  statusBannerText: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusBannerSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TEAL,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: PROFILE_CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  cardHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleRowDisabled: {
    opacity: 0.55,
  },
  toggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  toggleSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F1F5F9",
    marginLeft: 68,
  },
  deviceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: PROFILE_CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    position: "relative",
  },
  deviceCardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: TEAL,
  },
  deviceChipRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
  },
  deviceChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  deviceChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  deviceChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
    textAlign: "center",
  },
  deviceHintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  deviceHintText: {
    flex: 1,
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  deviceCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: TEAL,
  },
  deviceCtaPressed: {
    backgroundColor: colors.primary[700],
  },
  deviceCtaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceCtaCopy: {
    flex: 1,
    minWidth: 0,
  },
  deviceCtaTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  deviceCtaSub: {
    marginTop: 2,
    fontSize: 11,
    color: "rgba(255,255,255,0.88)",
  },
});
