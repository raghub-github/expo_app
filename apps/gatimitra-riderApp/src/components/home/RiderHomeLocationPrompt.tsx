import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderHomeLocation } from "@/src/hooks/useRiderHomeLocation";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

export function RiderHomeLocationPrompt() {
  const { t } = useTranslation();
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const { needsHomeLocation, saving, error, requestAndSave } = useRiderHomeLocation(riderId);
  const { height, isShortHeight } = useResponsiveLayout();
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.68 : 0.58));

  const tx = (key: string, fallback: string) =>
    t(`homeLocation.${key}`, { defaultValue: fallback });

  const handleAllow = () => {
    void requestAndSave().catch(() => {
      // error surfaced via hook state
    });
  };

  const handleOpenSettings = () => {
    void permissionManager.openSettings("location_foreground");
  };

  return (
    <PermissionBottomSheetShell
      visible={needsHomeLocation}
      maxHeightRatio={isShortHeight ? 0.86 : 0.78}
    >
      <ResponsiveSheetBody
        maxHeight={bodyMaxH}
        contentContainerStyle={styles.content}
        footerStyle={styles.footerSlot}
        footer={
          <View>
            <TouchableOpacity
              style={[
                rowLayout.row,
                styles.primaryBtn,
                saving && styles.primaryBtnDisabled,
              ]}
              onPress={handleAllow}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={tx("allowButton", "Allow location")}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color="#ffffff"
                    style={rowLayout.noShrink}
                  />
                  <Text style={[styles.primaryBtnText, flexShrinkText]} numberOfLines={2}>
                    {tx("allowButton", "Allow & save my address")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleOpenSettings}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText} numberOfLines={1}>
                {t("location.openSettings", { defaultValue: "Open Settings" })}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={32} color={ACCENT_DARK} />
        </View>

        <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
          {tx("title", "Allow location access")}
        </Text>
        <Text
          style={[styles.subtitle, flexShrinkText]}
          numberOfLines={isShortHeight ? 4 : 5}
        >
          {tx(
            "subtitle",
            "We need your location to save your home address and show nearby orders on the map."
          )}
        </Text>

        <View style={styles.bulletBox}>
          <Text style={[styles.bullet, flexShrinkText]} numberOfLines={2}>
            {tx("bullet1", "• Used for order matching near you")}
          </Text>
          <Text style={[styles.bullet, flexShrinkText]} numberOfLines={2}>
            {tx("bullet2", "• Saved as city, state, pincode & address")}
          </Text>
          <Text style={[styles.bullet, flexShrinkText]} numberOfLines={2}>
            {tx("bullet3", "• Required once on your home screen")}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, flexShrinkText]} numberOfLines={3}>
              {error}
            </Text>
          </View>
        ) : null}
      </ResponsiveSheetBody>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ecfdf3",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
    maxWidth: "100%",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
    maxWidth: "100%",
  },
  bulletBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.2)",
    maxWidth: "100%",
  },
  bullet: {
    fontSize: 13,
    lineHeight: 20,
    color: "#166534",
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    maxWidth: "100%",
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
    textAlign: "center",
  },
  primaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: ACCENT,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
});
