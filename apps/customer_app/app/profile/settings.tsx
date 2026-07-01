/**
 * Settings – account, preferences, legal, sign out.
 * UI aligned with profile tab (white cards on grey background).
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";
import { useLanguageStore } from "@/store/languageStore";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";

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
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
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
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const logoutAllDevices = useAuthStore((s) => s.logoutAllDevices);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const { language, hydrate } = useLanguageStore();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleSignOutThisDevice = async () => {
    setLogoutModalVisible(false);
    await logout();
    router.replace("/");
  };

  const handleSignOutAllDevices = async () => {
    setLogoutModalVisible(false);
    await logoutAllDevices();
    router.replace("/");
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
                <Text style={styles.rowLabel}>{t("settings.pushNotifications")}</Text>
                <Text style={styles.rowValue}>{t("settings.pushNotificationsSub")}</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
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
          onPress={() => setLogoutModalVisible(true)}
          style={styles.logoutBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>{t("settings.signOut")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={logoutModalVisible} transparent animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLogoutModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={32} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{t("settings.signOutModalTitle")}</Text>
            <Text style={styles.modalMessage}>{t("settings.signOutModalMessage")}</Text>
            <TouchableOpacity style={styles.modalOptionBtn} onPress={handleSignOutThisDevice} activeOpacity={0.85}>
              <Ionicons name="phone-portrait-outline" size={20} color={GREEN_DARK} />
              <Text style={styles.modalOptionText}>{t("settings.thisDevice")}</Text>
              <Ionicons name="chevron-forward" size={18} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOptionBtn} onPress={handleSignOutAllDevices} activeOpacity={0.85}>
              <Ionicons name="phone-portrait-outline" size={20} color={GREEN_DARK} />
              <Text style={styles.modalOptionText}>{t("settings.allDevices")}</Text>
              <Ionicons name="chevron-forward" size={18} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setLogoutModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalCancelText}>{t("common.cancel")}</Text>
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
  modalOptionText: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT },
  modalCancelBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: PAGE_BG,
    alignItems: "center",
    marginTop: 4,
  },
  modalCancelText: { fontSize: 15, fontWeight: "700", color: TEXT },
});
