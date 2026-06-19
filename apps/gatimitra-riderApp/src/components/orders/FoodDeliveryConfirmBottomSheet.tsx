import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { OrderOtpVerifySheetContent } from "@/src/components/orders/OrderOtpVerifySheetContent";
import { colors } from "@/src/theme";

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
  bottomOffset = 0,
  embedded = true,
  onDismiss,
  onSubmit,
  onClearError,
}: Props) {
  const { t } = useTranslation();

  const displayName =
    customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");

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
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.82}
      showOuterHandle={false}
      bottomOffset={bottomOffset}
      keyboardAware
      compactBottomInset
      fitContent
      embedded={embedded}
    >
      <OrderOtpVerifySheetContent
        title={t("orders.activeFood.deliveryOtpSheetTitle", "Verify delivery OTP")}
        subtitle={t(
          "orders.activeFood.deliveryOtpSheetSubtitle",
          "Ask {{name}} for the 4-digit delivery OTP",
          { name: displayName }
        )}
        compactSubtitle={t(
          "orders.activeFood.deliveryOtpSheetCompact",
          "Enter delivery OTP from {{name}} — photo saves after verify",
          { name: displayName }
        )}
        iconName="shield-checkmark"
        headerGradient={["#EFF6FF", "#FFFFFF"]}
        badgeGradient={[colors.secondary[600], colors.secondary[400]]}
        error={error}
        loading={loading}
        resetKey={resetKey}
        otpMode="delivery"
        inputMode="system"
        autoFocus
        onSubmit={onSubmit}
        onClearError={onClearError}
        prependContent={photoSection}
      />
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginHorizontal: 20,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
  },
  photoBox: {
    marginHorizontal: 20,
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
