import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_SEMIBOLD } from "@/src/theme/headerFonts";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { PremiumAllowButton } from "@/src/components/permissions/PremiumAllowButton";
import { readCameraPermission, requestCameraPermission } from "@/src/lib/cameraPermission";

type Props = {
  visible: boolean;
  onGranted: () => void;
  onDismiss: () => void;
};

/**
 * Pre-system camera permission sheet — same shell + layout as onboarding permission steps.
 */
export function PickupCameraPermissionSheet({ visible, onGranted, onDismiss }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleAllow = async () => {
    setLoading(true);
    try {
      const current = await readCameraPermission();
      if (current.granted) {
        onGranted();
        return;
      }

      const result = await requestCameraPermission();
      if (result.granted) {
        onGranted();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.82}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>
          {t("orders.activeFood.cameraPermissionStep", "Pickup verification")}
        </Text>

        <View style={styles.iconWrap}>
          <Ionicons name="camera" size={32} color={colors.primary[700]} />
        </View>

        <Text style={styles.title}>
          {t("orders.activeFood.cameraPermissionTitle", "Camera Permission")}
        </Text>
        <Text style={styles.message}>
          {t(
            "orders.activeFood.cameraPermissionDesc",
            "Allow camera access to securely scan the restaurant's Pickup QR Code or Barcode for quick order verification. We respect your privacy and only use the camera while scanning."
          )}
        </Text>

        <View style={styles.instructionsBox}>
          <Text style={styles.instructionsTitle}>
            {t("orders.activeFood.cameraPermissionWhatToDo", "What to do")}
          </Text>
          {[
            t("orders.activeFood.cameraPermissionStep1", "Tap Allow Access below"),
            t("orders.activeFood.cameraPermissionStep2", "Allow camera when prompted"),
            t("orders.activeFood.cameraPermissionStep3", "Align the QR or barcode inside the frame"),
          ].map((line, index) => (
            <View key={line} style={styles.instructionRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.instructionText}>{line}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonWrap}>
          <PremiumAllowButton
            onPress={handleAllow}
            loading={loading}
            disabled={loading}
            label={t("orders.activeFood.allowAccess", "Allow Access")}
          />
          <Pressable onPress={onDismiss} style={styles.skipBtn} hitSlop={8}>
            <Text style={styles.skipText}>
              {t("orders.activeFood.notNow", "Not Now")}
            </Text>
          </Pressable>
        </View>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  stepLabel: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 12,
    color: colors.gray[500],
    textAlign: "center",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  iconWrap: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 22,
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  instructionsBox: {
    backgroundColor: colors.primary[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  instructionsTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: colors.primary[800],
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 20,
  },
  buttonWrap: {
    width: "100%",
  },
  skipBtn: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 15,
    color: colors.gray[600],
    textDecorationLine: "underline",
  },
});
