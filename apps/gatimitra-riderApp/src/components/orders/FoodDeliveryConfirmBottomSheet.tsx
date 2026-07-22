import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { OtpVerifySheetModal } from "@gatimitra/otp-verify-ui";
import { colors } from "@/src/theme";
import { riderOtpVerifyTheme } from "@/src/theme/otpVerifyTheme";

type Props = {
  visible: boolean;
  proofImageUri: string;
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  customerName?: string | null;
  bottomOffset?: number;
  embedded?: boolean;
  onDismiss: () => void;
  onSubmit: (otp: string) => void;
  onClearError?: () => void;
};

export function FoodDeliveryConfirmBottomSheet({
  visible,
  proofImageUri,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  onDismiss,
  onSubmit,
  onClearError,
}: Props) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState("");

  const displayName =
    customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");

  useEffect(() => {
    if (!visible) {
      setOtp("");
      return;
    }
    setOtp("");
  }, [visible, resetKey]);

  useEffect(() => {
    if (error?.trim()) {
      setOtp("");
    }
  }, [error, resetKey]);

  const photoSection = (
    <>
      <Text style={styles.sectionTitle}>
        {t("orders.activeFood.deliveryPhotoCaptured", "Delivery photo")}
      </Text>
      <View style={styles.photoBox}>
        <Image source={{ uri: proofImageUri }} style={styles.photoPreview} resizeMode="cover" />
        <View style={styles.photoBadge}>
          <Ionicons name="camera" size={16} color={colors.success[700]} />
          <Text style={styles.photoBadgeText}>
            {t("orders.activeFood.photoCaptured", "Captured")}
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <OtpVerifySheetModal
      visible={visible}
      title={t("auth.verifyOtp", "Verify OTP")}
      subtitle={t(
        "orders.activeFood.deliveryOtpSheetSubtitle",
        "Ask {{name}} for the 4-digit delivery OTP",
        { name: displayName }
      )}
      otpLength={4}
      value={otp}
      onChange={(next) => {
        if (error?.trim()) onClearError?.();
        setOtp(next);
      }}
      onVerify={onSubmit}
      onCancel={onDismiss}
      loading={loading}
      error={error}
      autoSubmitOnComplete
      hideVerifyButton
      hideCancelButton
      dockToKeyboard
      dismissOnBackdropPress={false}
      theme={riderOtpVerifyTheme}
      prependContent={photoSection}
    />
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
  },
  photoBox: {
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.success[300],
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    marginBottom: 8,
  },
  photoPreview: { width: "100%", height: "100%" },
  photoBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  photoBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success[800],
  },
});
