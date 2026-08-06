/**
 * Settings – account, preferences, legal, sign out.
 * UI aligned with profile tab (white cards on grey background).
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, Switch, Modal, Pressable, ActivityIndicator, AppState, type AppStateStatus } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import {
  usePushPermissionController,
  setPreference,
  loadPreferences,
} from "@gatimitra/expo-push-kit";
import { useAuthStore } from "@/store/authStore";
import { useLanguageStore } from "@/store/languageStore";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import { getConfig } from "@/config/env";

const { green: GREEN, greenDark: GREEN_DARK, text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG } =
  ProfileTheme;

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
};

function SettingsRow({ icon, label, value, onPress, right, showChevron = true }: RowProps) {
  const isPressable = !!onPress;
  const content = (
    <View style={styles.rowInner}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={19} color={GREEN_DARK} />
      </View>
      <View style={styles.rowTextWrap}>
        <AppText style={styles.rowLabel}>{label}</AppText>
        {value ? <AppText style={styles.rowValue}>{value}</AppText> : null}
      </View>
      {right !== undefined ? right : isPressable && showChevron ? (
        <Ionicons name="chevron-forward" size={17} color="#C4C4C4" />
      ) : null}
    </View>
  );
  if (isPressable) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.rowOuter}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.rowOuter}>{content}</View>;
}

function SectionTitle({ title }: { title: string }) {
  return <AppText style={styles.sectionTitle}>{title}</AppText>;
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const logoutAllDevices = useAuthStore((s) => s.logoutAllDevices);
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  /** Which option is signing out — keeps spinner until session is cleared. */
  const [loggingOut, setLoggingOut] = useState<"this" | "all" | null>(null);
  const [backendPushEnabled, setBackendPushEnabled] = useState(true);

  const { language, hydrate } = useLanguageStore();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const { apiBaseUrl } = getConfig();
  const authRef = useRef({ session, hydrated });
  authRef.current = { session, hydrated };

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      androidPackageName: Constants.expoConfig?.android?.package,
      androidChannels: [
        { channelId: "default", name: "Orders & updates", lightColor: "#14b8a6" },
      ],
      getAuth: () => {
        const { session: s, hydrated: h } = authRef.current;
        if (!h || !s?.accessToken || s.role !== "customer") return null;
        return { accessToken: s.accessToken, role: "customer" as const };
      },
    }),
    [apiBaseUrl]
  );

  const { snapshot, controller } = usePushPermissionController(pushOptions);
  const osNotificationsOn = snapshot.osStatus === "granted";
  const pushToggleOn = osNotificationsOn && backendPushEnabled;
  const expoGo = Constants.appOwnership === "expo";

  const prefsCfg = useMemo(
    () => ({
      baseUrl: apiBaseUrl,
      getAuthHeader: async () => {
        const token = authRef.current.session?.accessToken;
        return token ? `Bearer ${token}` : null;
      },
    }),
    [apiBaseUrl]
  );

  useEffect(() => {
    if (!session?.accessToken) return;
    void loadPreferences(prefsCfg)
      .then((prefs) => {
        const orderPref = prefs.items?.find(
          (p) => p.type === "ORDER_UPDATES" || p.type === "ALL" || p.type === "orders"
        );
        if (orderPref) setBackendPushEnabled(orderPref.push !== false);
      })
      .catch(() => {});
  }, [session?.accessToken, prefsCfg]);

  // After user enables "Allow notifications" in Android Settings and returns,
  // re-read OS permission and register Expo + FCM tokens while logged in.
  useEffect(() => {
    if (!session?.accessToken || session.role !== "customer") return;
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      void (async () => {
        const snap = await controller.refresh({ syncIfGranted: true });
        if (snap.osStatus === "granted" && snap.lastBackendSyncOk) {
          setBackendPushEnabled(true);
        }
      })();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [session?.accessToken, session?.role, controller]);

  const handleNotificationsToggle = useCallback(
    async (next: boolean) => {
      if (expoGo) {
        // Expo Go cannot register remote push — still open OS settings for the host app.
        await controller.openSettings();
        return;
      }
      if (next) {
        const result = await controller.requestOrOpenSettings();
        if (result.granted && session?.accessToken) {
          setBackendPushEnabled(true);
          // Force a second sync in case the first raced the OS grant.
          await controller.syncTokens();
          try {
            await setPreference(prefsCfg, "ORDER_UPDATES", { push: true, in_app: true });
          } catch {
            // non-fatal
          }
        }
        return;
      }
      setBackendPushEnabled(false);
      if (session?.accessToken) {
        try {
          await setPreference(prefsCfg, "ORDER_UPDATES", { push: false });
        } catch {
          // non-fatal
        }
      }
      if (osNotificationsOn) {
        await controller.openSettings();
      }
    },
    [controller, session?.accessToken, prefsCfg, osNotificationsOn, expoGo]
  );

  const handleSignOutThisDevice = async () => {
    if (loggingOut) return;
    setLoggingOut("this");
    try {
      // Best-effort push unregister — never block logout on a hung network call.
      await Promise.race([
        controller.unregisterCurrent().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      await logout();
      setLogoutModalVisible(false);
      router.replace("/(auth)/login");
    } catch {
      setLoggingOut(null);
    }
  };

  const handleSignOutAllDevices = async () => {
    if (loggingOut) return;
    setLoggingOut("all");
    try {
      await Promise.race([
        controller.unregisterCurrent().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      await logoutAllDevices();
      setLogoutModalVisible(false);
      router.replace("/(auth)/login");
    } catch {
      setLoggingOut(null);
    }
  };

  const closeLogoutModal = () => {
    if (loggingOut) return;
    setLogoutModalVisible(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor="#fff" />
      <ProfileSubpageHeader title={t("profile.settings")} onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title={t("settings.account")} />
        <View style={styles.card}>
          <SettingsRow
            icon="person-outline"
            label={t("settings.editProfile")}
            onPress={() => router.push("/profile/edit")}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="location-outline"
            label={t("settings.savedAddresses")}
            onPress={() => router.push("/profile/addresses")}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="mail-outline"
            label={t("profile.verifyEmail")}
            onPress={() => router.push("/profile/verify-email")}
          />
        </View>

        <SectionTitle title={t("settings.preferences")} />
        <View style={styles.card}>
          <View style={styles.rowOuter}>
            <View style={styles.rowInner}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="notifications-outline" size={19} color={GREEN_DARK} />
              </View>
              <View style={styles.rowTextWrap}>
                <AppText style={styles.rowLabel}>{t("settings.pushNotifications")}</AppText>
                <AppText style={styles.rowValue}>
                  {expoGo
                    ? "Use a development build for OS push"
                    : !osNotificationsOn
                      ? "Turn on in phone Settings to receive alerts"
                      : t("settings.pushNotificationsSub")}
                </AppText>
              </View>
              <Switch
                value={pushToggleOn}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: "#E5E7EB", true: GREEN }}
                thumbColor="#fff"
              />
            </View>
          </View>
          <View style={styles.separator} />
          <SettingsRow
            icon="language-outline"
            label={t("settings.language")}
            value={t(`languages.${language}`)}
            onPress={() => router.push("/profile/language")}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="accessibility-outline"
            label="Accessibility settings"
            value="Hearing, vision & mobility"
            onPress={() => router.push("/profile/accessibility")}
          />
        </View>

        <SectionTitle title="Privacy & data" />
        <View style={styles.card}>
          <SettingsRow
            icon="cloud-download-outline"
            label="Download my data"
            value="DPDPA right of access"
            onPress={() => router.push("/profile/legal/dpdpa-compliance-notice" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="key-outline"
            label="App permissions"
            value="Camera, location, photos, contacts"
            onPress={() => router.push("/profile/legal/permissions-rationale" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="nutrition-outline"
            label="Cookie & tracking"
            value="SDKs and personalisation"
            onPress={() => router.push("/profile/legal/cookie-tracking-policy" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="trash-outline"
            label="Delete my account"
            value="Request closure — reviewed, permanent"
            onPress={() => router.push("/profile/delete-account" as never)}
          />
        </View>

        <SectionTitle title={t("settings.legal")} />
        <View style={styles.card}>
          <SettingsRow
            icon="document-text-outline"
            label={t("settings.termsOfService")}
            onPress={() => router.push("/profile/legal/terms-of-service" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t("settings.privacyPolicy")}
            onPress={() => router.push("/profile/legal/privacy-policy" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="cash-outline"
            label="Refund & Cancellation"
            onPress={() => router.push("/profile/legal/refund-cancellation-policy" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="car-outline"
            label="Shipping & Delivery"
            onPress={() => router.push("/profile/legal/shipping-delivery-policy" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="hammer-outline"
            label="Grievance Redressal"
            onPress={() => router.push("/profile/legal/grievance-redressal-mechanism" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="library-outline"
            label="All policies & documents"
            onPress={() => router.push("/profile/legal" as never)}
          />
        </View>

        <SectionTitle title={t("settings.about")} />
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline"
            label="About GatiMitra"
            onPress={() => router.push("/profile/about" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="accessibility-outline"
            label="Accessibility statement"
            onPress={() => router.push("/profile/legal/accessibility-statement" as never)}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="git-branch-outline"
            label="Open-source licences"
            onPress={() => router.push("/profile/legal/open-source-licenses" as never)}
          />
        </View>

        <SectionTitle title={t("settings.accountActions")} />
        <TouchableOpacity
          onPress={() => {
            setLoggingOut(null);
            setLogoutModalVisible(true);
          }}
          style={styles.logoutBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <AppText style={styles.logoutText}>{t("settings.signOut")}</AppText>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeLogoutModal}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={closeLogoutModal}
          disabled={loggingOut != null}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={32} color="#fff" />
            </View>
            <AppText style={styles.modalTitle}>{t("settings.signOutModalTitle")}</AppText>
            <AppText style={styles.modalMessage}>{t("settings.signOutModalMessage")}</AppText>
            <TouchableOpacity
              style={[styles.modalOptionBtn, loggingOut === "this" && styles.modalOptionBtnActive]}
              onPress={() => void handleSignOutThisDevice()}
              activeOpacity={0.85}
              disabled={loggingOut != null}
            >
              <Ionicons name="phone-portrait-outline" size={20} color={GREEN_DARK} />
              <AppText style={styles.modalOptionText}>{t("settings.thisDevice")}</AppText>
              {loggingOut === "this" ? (
                <ActivityIndicator size="small" color={GREEN_DARK} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalOptionBtn, loggingOut === "all" && styles.modalOptionBtnActive]}
              onPress={() => void handleSignOutAllDevices()}
              activeOpacity={0.85}
              disabled={loggingOut != null}
            >
              <Ionicons name="phone-portrait-outline" size={20} color={GREEN_DARK} />
              <AppText style={styles.modalOptionText}>{t("settings.allDevices")}</AppText>
              {loggingOut === "all" ? (
                <ActivityIndicator size="small" color={GREEN_DARK} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelBtn, loggingOut != null && styles.modalCancelBtnDisabled]}
              onPress={closeLogoutModal}
              activeOpacity={0.8}
              disabled={loggingOut != null}
            >
              <AppText style={styles.modalCancelText}>{t("common.cancel")}</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  rowOuter: { paddingVertical: 14, paddingHorizontal: 14 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: ProfileTheme.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: "600", color: TEXT },
  rowValue: { fontSize: 12, color: MUTED, marginTop: 2 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginLeft: 14 + 36 + 12,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 4,
  },
  logoutText: { fontSize: 15, fontWeight: "700", color: "#DC2626" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: TEXT, marginBottom: 8 },
  modalMessage: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  modalOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: PAGE_BG,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  modalOptionBtnActive: {
    borderColor: GREEN,
    backgroundColor: "#ECFDF5",
  },
  modalOptionText: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT },
  modalCancelBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: PAGE_BG,
    alignItems: "center",
    marginTop: 4,
  },
  modalCancelBtnDisabled: { opacity: 0.5 },
  modalCancelText: { fontSize: 15, fontWeight: "700", color: TEXT },
});
