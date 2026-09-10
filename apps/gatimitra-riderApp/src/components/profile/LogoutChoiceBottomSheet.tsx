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
import { useTranslation } from "react-i18next";
import type { RiderLogoutScope } from "@/src/stores/logoutSheetStore";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { flexShrinkText } from "@/src/theme/responsiveText";

/** Coral logout CTA — matches profile logout mock. */
const LOGOUT_CORAL = "#E85D6C";
const SHEET_RADIUS = 24;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (scope: RiderLogoutScope) => void;
};

export function LogoutChoiceBottomSheet({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { rs, insets, height, isShortHeight } = useResponsiveLayout();
  const [busy, setBusy] = useState<RiderLogoutScope | null>(null);
  const bottomPad = resolveRiderBottomInset(insets.bottom) + rs(12);
  const maxH = Math.round(height * (isShortHeight ? 0.75 : 0.55));

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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ResponsiveSheetBody
            maxHeight={maxH}
            contentContainerStyle={styles.body}
            footerBottomInset={bottomPad}
            footer={
              <View>
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={busy != null}
                  onPress={() => pick("this_device")}
                  style={[styles.primaryBtn, busy != null && styles.btnDisabled]}
                >
                  {busy === "this_device" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText} numberOfLines={1}>
                      {t("profile.logout", "Logout")}
                    </Text>
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
                    <Text style={[styles.outlineBtnText, flexShrinkText]} numberOfLines={2}>
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
            }
          >
            <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
              {t("profile.logoutChoice.title", "Logout")}
            </Text>
            <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={3}>
              {t(
                "profile.logoutChoice.subtitle",
                "Choose how you want to sign out of GatiMitra Rider."
              )}
            </Text>
          </ResponsiveSheetBody>
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
    maxWidth: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: 10,
    overflow: "hidden",
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
    marginBottom: 6,
  },
  body: {
    paddingTop: 4,
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
    marginBottom: 8,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: LOGOUT_CORAL,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  outlineBtn: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: LOGOUT_CORAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: LOGOUT_CORAL,
    textAlign: "center",
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
