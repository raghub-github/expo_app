import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { RiderLogoutScope } from "@/src/stores/logoutSheetStore";

/** Coral logout CTA — matches profile logout mock. */
const LOGOUT_CORAL = "#E85D6C";
const HPAD = 20;
const SHEET_RADIUS = 24;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (scope: RiderLogoutScope) => void;
};

export function LogoutChoiceBottomSheet({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<RiderLogoutScope | null>(null);
  const bottomInset = Math.max(insets.bottom, 16);

  if (!visible) return null;

  const pick = (scope: RiderLogoutScope) => {
    if (busy) return;
    setBusy(scope);
    // Tiny tick so press feedback shows, then advance to reason sheet.
    requestAnimationFrame(() => {
      onSelect(scope);
      setBusy(null);
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {t("profile.logoutChoice.title", "Logout")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "profile.logoutChoice.subtitle",
              "Choose how you want to sign out of GatiMitra Rider."
            )}
          </Text>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={busy != null}
            onPress={() => pick("this_device")}
            style={[styles.primaryBtn, busy != null && styles.btnDisabled]}
          >
            {busy === "this_device" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{t("profile.logout", "Logout")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={busy != null}
            onPress={() => pick("all_devices")}
            style={[styles.outlineBtn, busy != null && styles.btnDisabled]}
          >
            {busy === "all_devices" ? (
              <ActivityIndicator color={LOGOUT_CORAL} />
            ) : (
              <Text style={styles.outlineBtnText}>
                {t("profile.logoutChoice.allDevices", "Logout from all devices")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={busy != null}
            onPress={onClose}
            style={styles.cancelLink}
          >
            <Text style={styles.cancelLinkText}>{t("profile.cancelLogout", "Cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: HPAD,
    paddingTop: 10,
    ...(Platform.OS === "android"
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 24,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 18,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: LOGOUT_CORAL,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  outlineBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: LOGOUT_CORAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: LOGOUT_CORAL,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  cancelLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelLinkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
});
