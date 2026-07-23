import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { readCameraPermission } from "@/src/lib/cameraPermission";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_SEMIBOLD } from "@/src/theme/headerFonts";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { PremiumAllowButton } from "@/src/components/permissions/PremiumAllowButton";
import { PickupCameraPermissionSheet } from "@/src/components/orders/PickupCameraPermissionSheet";

type Props = {
  visible: boolean;
  barcodeEnabled?: boolean;
  otpEnabled?: boolean;
  onBack: () => void;
  onScanBarcode: (opts?: { cameraGranted?: boolean }) => void;
  onEnterOtp: () => void;
};

function ScanIllustration() {
  return (
    <View style={styles.illusCircle}>
      <View style={styles.bracketTL} />
      <View style={styles.bracketTR} />
      <View style={styles.bracketBL} />
      <View style={styles.bracketBR} />
      <Ionicons name="qr-code-outline" size={28} color={colors.primary[700]} />
    </View>
  );
}

function OtpIllustration() {
  return (
    <View style={[styles.illusCircle, styles.illusCircleOtp]}>
      <Ionicons name="keypad" size={28} color={colors.primary[700]} />
    </View>
  );
}

export function FoodPickupVerificationScreen({
  visible,
  barcodeEnabled = true,
  otpEnabled = true,
  onBack,
  onScanBarcode,
  onEnterOtp,
}: Props) {
  const { t } = useTranslation();
  const [cameraSheetVisible, setCameraSheetVisible] = useState(false);

  const openScanner = useCallback(
    (cameraGranted = false) => {
      onScanBarcode({ cameraGranted });
    },
    [onScanBarcode]
  );

  const handleScanPress = useCallback(async () => {
    const permission = await readCameraPermission();
    if (permission.granted) {
      openScanner(true);
      return;
    }
    setCameraSheetVisible(true);
  }, [openScanner]);

  const handleCameraGranted = useCallback(() => {
    setCameraSheetVisible(false);
    openScanner(true);
  }, [openScanner]);

  return (
    <>
      <PermissionBottomSheetShell
        visible={visible}
        maxHeightRatio={0.72}
        dismissible
        onDismiss={onBack}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.heroIconWrap}>
            <Ionicons name="shield-checkmark" size={30} color={colors.primary[700]} />
          </View>

          <Text style={styles.title}>
            {t("orders.activeFood.verifyPickupTitle", "Verify Pickup")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "orders.activeFood.verifyNeedDesc",
              "Choose one of the options below to confirm the order pickup."
            )}
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>
              {t("orders.activeFood.verifyNeedTitle", "We need to verify this pickup")}
            </Text>
            <Text style={styles.infoBoxText}>
              {t(
                "orders.activeFood.verifySafeDesc",
                "This verification helps ensure a smooth and secure delivery experience."
              )}
            </Text>
          </View>

          {barcodeEnabled ? (
            <View style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <ScanIllustration />
                <View style={styles.optionHeaderText}>
                  <View style={styles.recommendedPill}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={styles.recommendedText}>
                      {t("orders.activeFood.recommended", "Recommended")}
                    </Text>
                  </View>
                  <Text style={styles.optionTitle}>
                    {t("orders.activeFood.verifyBarcodeTitle", "Scan Barcode")}
                  </Text>
                  <Text style={styles.optionDesc}>
                    {t(
                      "orders.activeFood.verifyBarcodeDesc",
                      "Scan the barcode or QR code on the restaurant bill, invoice, or merchant KOT."
                    )}
                  </Text>
                </View>
              </View>
              <PremiumAllowButton
                onPress={handleScanPress}
                label={t("orders.activeFood.scanBarcode", "Scan Barcode")}
              />
            </View>
          ) : null}

          {otpEnabled ? (
            <View style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <OtpIllustration />
                <View style={styles.optionHeaderText}>
                  <Text style={styles.optionTitle}>
                    {t("orders.activeFood.verifyOtpTitle", "Continue with OTP")}
                  </Text>
                  <Text style={styles.optionDesc}>
                    {t(
                      "orders.activeFood.verifyOtpDesc",
                      "Enter the pickup OTP provided by the merchant."
                    )}
                  </Text>
                </View>
              </View>
              <Pressable style={styles.secondaryBtn} onPress={onEnterOtp}>
                <Ionicons name="keypad-outline" size={18} color={colors.primary[700]} />
                <Text style={styles.secondaryBtnText}>
                  {t("orders.activeFood.enterOtp", "Enter OTP")}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </PermissionBottomSheetShell>

      <PickupCameraPermissionSheet
        visible={cameraSheetVisible && visible}
        onGranted={handleCameraGranted}
        onDismiss={() => setCameraSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: "100%",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 14,
  },
  heroIconWrap: {
    alignSelf: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 22,
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 13,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: colors.primary[50],
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  infoBoxTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    color: colors.primary[800],
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoBoxText: {
    fontSize: 13,
    color: colors.gray[700],
    lineHeight: 19,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary[100],
    gap: 14,
    ...(Platform.OS === "android"
      ? { elevation: 2 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        }),
  },
  optionHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  optionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  recommendedPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary[600],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  optionTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 17,
    color: "#111827",
    marginBottom: 4,
  },
  optionDesc: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 12,
    color: colors.gray[600],
    lineHeight: 18,
  },
  illusCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  illusCircleOtp: {
    backgroundColor: colors.primary[50],
  },
  bracketTL: {
    position: "absolute",
    top: 7,
    left: 7,
    width: 11,
    height: 11,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.primary[600],
    borderTopLeftRadius: 2,
  },
  bracketTR: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 11,
    height: 11,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.primary[600],
    borderTopRightRadius: 2,
  },
  bracketBL: {
    position: "absolute",
    bottom: 7,
    left: 7,
    width: 11,
    height: 11,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.primary[600],
    borderBottomLeftRadius: 2,
  },
  bracketBR: {
    position: "absolute",
    bottom: 7,
    right: 7,
    width: 11,
    height: 11,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.primary[600],
    borderBottomRightRadius: 2,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.primary[300],
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[700],
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
