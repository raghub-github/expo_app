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

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

export function RiderHomeLocationPrompt() {
  const { t } = useTranslation();
  const riderId = useOnboardingStore((s) => s.data.riderId);
  const { needsHomeLocation, saving, error, requestAndSave } = useRiderHomeLocation(riderId);

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
    <PermissionBottomSheetShell visible={needsHomeLocation} maxHeightRatio={0.78}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={32} color={ACCENT_DARK} />
        </View>

        <Text style={styles.title}>{tx("title", "Allow location access")}</Text>
        <Text style={styles.subtitle}>
          {tx(
            "subtitle",
            "We need your location to save your home address and show nearby orders on the map."
          )}
        </Text>

        <View style={styles.bulletBox}>
          <Text style={styles.bullet}>{tx("bullet1", "• Used for order matching near you")}</Text>
          <Text style={styles.bullet}>{tx("bullet2", "• Saved as city, state, pincode & address")}</Text>
          <Text style={styles.bullet}>{tx("bullet3", "• Required once on your home screen")}</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
          onPress={handleAllow}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={tx("allowButton", "Allow location")}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.primaryBtnText}>
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
          <Text style={styles.secondaryBtnText}>
            {t("location.openSettings", { defaultValue: "Open Settings" })}
          </Text>
        </TouchableOpacity>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
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
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  bulletBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.2)",
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
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
    textAlign: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: ACCENT,
    marginBottom: 10,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
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
