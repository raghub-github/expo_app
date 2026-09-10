import React, { useMemo } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { OtpVerifySheetModal } from "@gatimitra/otp-verify-ui";
import { colors } from "@/src/theme";
import { riderOtpVerifyTheme } from "@/src/theme/otpVerifyTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

type Props = {
  visible: boolean;
  proofImageUri: string;
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  customerName?: string | null;
  bottomOffset?: number;
  /** Render inside an existing Modal (drop-order screen) instead of stacking another Modal. */
  embedded?: boolean;
  onDismiss: () => void;
  onSubmit: (otp: string) => void;
  onClearError?: () => void;
};

const DeliveryProofPhoto = React.memo(function DeliveryProofPhoto({
  uri,
  title,
  capturedLabel,
  photoHeight,
}: {
  uri: string;
  title: string;
  capturedLabel: string;
  photoHeight: number;
}) {
  const source = useMemo(() => ({ uri }), [uri]);
  return (
    <>
      <Text style={[styles.sectionTitle, flexShrinkText]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.photoBox, { height: photoHeight }]}>
        <Image
          source={source}
          style={styles.photoPreview}
          resizeMode="cover"
          resizeMethod="resize"
          fadeDuration={0}
        />
        <View style={[rowLayout.row, styles.photoBadge]}>
          <Ionicons name="camera" size={16} color={colors.success[700]} style={rowLayout.noShrink} />
          <Text style={[styles.photoBadgeText, flexShrinkText]} numberOfLines={1}>
            {capturedLabel}
          </Text>
        </View>
      </View>
    </>
  );
});

function FoodDeliveryConfirmBottomSheetInner({
  visible,
  proofImageUri,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  onDismiss,
  onSubmit,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const { isShortHeight, rh } = useResponsiveLayout();

  const displayName =
    customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");

  const subtitle = isShortHeight
    ? t(
        "orders.activeFood.deliveryOtpSheetSubtitleShort",
        "Ask {{name}} for the 4-digit delivery OTP",
        { name: displayName }
      )
    : t(
        "orders.activeFood.deliveryOtpSheetSubtitle",
        "Ask {{name}} for the 4-digit delivery OTP",
        { name: displayName }
      );

  const photoSection = (
    <DeliveryProofPhoto
      uri={proofImageUri}
      title={t("orders.activeFood.deliveryPhotoCaptured", "Delivery photo")}
      capturedLabel={t("orders.activeFood.photoCaptured", "Captured")}
      photoHeight={rh(isShortHeight ? 100 : 140, { min: 88, max: 160 })}
    />
  );

  return (
    <OtpVerifySheetModal
      visible={visible}
      title={t("auth.verifyOtp", "Verify OTP")}
      subtitle={subtitle}
      otpLength={4}
      onVerify={onSubmit}
      onCancel={onDismiss}
      loading={loading}
      error={error}
      resetKey={resetKey}
      autoSubmitOnComplete
      hideVerifyButton
      hideCancelButton
      dockToKeyboard
      dismissOnBackdropPress={false}
      animationType="none"
      embedded={embedded}
      theme={riderOtpVerifyTheme}
      prependContent={photoSection}
    />
  );
}

export const FoodDeliveryConfirmBottomSheet = React.memo(FoodDeliveryConfirmBottomSheetInner);

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
    maxWidth: "100%",
  },
  photoBox: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.success[300],
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    marginBottom: 8,
    maxWidth: "100%",
  },
  photoPreview: { width: "100%", height: "100%" },
  photoBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: "90%",
  },
  photoBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success[800],
  },
});
