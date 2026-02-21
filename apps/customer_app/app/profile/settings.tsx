/**
 * Settings – account, preferences, legal, support, about, sign out.
 * Professional UI; each row is a single touch target (no overlapping).
 * Language preference opens Language screen for user to set app language.
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

const TEAL = "#14b8a6";
const TITLE_DARK = "#0f172a";
const TEXT_GRAY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const CARD_BG = "#FFFFFF";
const BORDER_LIGHT = "#f1f5f9";
const SURFACE = "#f8fafc";

const SHADOW_SOFT = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

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
        <Ionicons name={icon} size={22} color={TEAL} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {right !== undefined ? right : isPressable && showChevron ? <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} /> : null}
    </View>
  );
  if (isPressable) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.rowOuter}>
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
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title={t("settings.account")} />
        <View style={[styles.card, SHADOW_SOFT]}>
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
        </View>

        <SectionTitle title={t("settings.preferences")} />
        <View style={[styles.card, SHADOW_SOFT]}>
          <View style={styles.rowOuter}>
            <View style={styles.rowInner}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="notifications-outline" size={22} color={TEAL} />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>{t("settings.pushNotifications")}</Text>
                <Text style={styles.rowValue}>{t("settings.pushNotificationsSub")}</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: "#e2e8f0", true: TEAL }}
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
        </View>

        <SectionTitle title={t("settings.legal")} />
        <View style={[styles.card, SHADOW_SOFT]}>
          <SettingsRow icon="document-text-outline" label={t("settings.termsOfService")} onPress={() => {}} />
          <View style={styles.separator} />
          <SettingsRow icon="shield-checkmark-outline" label={t("settings.privacyPolicy")} onPress={() => {}} />
        </View>

        <SectionTitle title={t("settings.about")} />
        <View style={[styles.card, SHADOW_SOFT]}>
          <SettingsRow icon="information-circle-outline" label={t("settings.appVersion")} value="1.0.0" showChevron={false} />
        </View>

        <SectionTitle title={t("settings.accountActions")} />
        <TouchableOpacity
          onPress={() => setLogoutModalVisible(true)}
          style={styles.logoutBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={22} color="#dc2626" />
          <Text style={styles.logoutText}>{t("settings.signOut")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLogoutModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="log-out-outline" size={36} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{t("settings.signOutModalTitle")}</Text>
            <Text style={styles.modalMessage}>{t("settings.signOutModalMessage")}</Text>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={handleSignOutThisDevice}
              activeOpacity={0.85}
            >
              <Ionicons name="phone-portrait-outline" size={20} color={TEAL} />
              <Text style={styles.modalOptionText}>{t("settings.thisDevice")}</Text>
              <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOptionBtn}
              onPress={handleSignOutAllDevices}
              activeOpacity={0.85}
            >
              <Ionicons name="phone-portrait-outline" size={20} color={TEAL} />
              <Text style={styles.modalOptionText}>{t("settings.allDevices")}</Text>
              <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setLogoutModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PAD_H = 20;
const CARD_RADIUS = 16;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD_H,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
  },
  rowOuter: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowIconWrap: { width: 44, alignItems: "center", justifyContent: "center" },
  rowTextWrap: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowLabel: { fontSize: 16, fontWeight: "500", color: TITLE_DARK },
  rowValue: { fontSize: 13, color: TEXT_GRAY, marginTop: 2 },
  separator: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
    marginLeft: 18 + 44 + 12,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    backgroundColor: "rgba(220,38,38,0.08)",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.2)",
  },
  logoutText: { fontSize: 16, fontWeight: "600", color: "#dc2626" },
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
    backgroundColor: CARD_BG,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: TEXT_GRAY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  modalOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: SURFACE,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  modalOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
    marginLeft: 12,
  },
  modalCancelBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: BORDER_LIGHT,
    alignItems: "center",
    marginTop: 8,
  },
  modalCancelText: { fontSize: 16, fontWeight: "600", color: TITLE_DARK },
});
