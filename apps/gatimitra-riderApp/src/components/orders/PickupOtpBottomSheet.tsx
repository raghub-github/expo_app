import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RidePickupOtpEntry } from "@/src/components/orders/RidePickupOtpEntry";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  customerName?: string | null;
  otpContext?: "customer" | "merchant";
  /** Ride drop leg — delivery OTP without photo. */
  purpose?: "pickup" | "drop";
  /** Keep tab bar visible under the sheet (navigation / tab screens). */
  bottomOffset?: number;
  onDismiss: () => void;
  onSubmit: (otp: string) => void;
};

export function PickupOtpBottomSheet({
  visible,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  otpContext = "customer",
  purpose = "pickup",
  bottomOffset = 0,
  onDismiss,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const isFood = otpContext === "merchant";
  const isDropOtp = purpose === "drop";

  const displayName =
    customerName?.trim() ||
    (isFood
      ? t("orders.activeFood.merchantFallback", "the restaurant")
      : t("orders.activeRide.customerFallback", "Customer"));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.72}
      showOuterHandle={false}
      bottomOffset={bottomOffset}
      keyboardAware
    >
      <LinearGradient
        colors={isFood ? ["#F0FDFA", "#FFFFFF"] : ["#EFF6FF", "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <LinearGradient
            colors={
              isFood
                ? [colors.primary[600], colors.primary[400]]
                : [colors.secondary[600], colors.secondary[400]]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconBadge}
          >
            <Ionicons
              name={isFood ? "restaurant-outline" : "shield-checkmark"}
              size={22}
              color="#ffffff"
            />
          </LinearGradient>

          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              {isFood
                ? t(
                    "orders.activeFood.otpSheetTitle",
                    "Enter OTP to mark order as picked up"
                  )
                : isDropOtp
                  ? t("orders.activeRide.dropOtpSheetTitle", "Enter drop OTP")
                  : t("orders.activeRide.otpSheetTitle", "Verify pickup OTP")}
            </Text>
            <Text style={styles.subtitle}>
              {isFood
                ? t(
                    "orders.activeFood.otpSheetSubtitle",
                    "Ask {{name}} for the 4-digit pickup OTP, then enter it below to confirm collection.",
                    { name: displayName }
                  )
                : isDropOtp
                  ? t(
                      "orders.activeRide.dropOtpSheetSubtitle",
                      "Ask {{name}} for the 4-digit drop OTP shown in their app to complete the ride.",
                      { name: displayName }
                    )
                  : t(
                      "orders.activeRide.otpSheetSubtitle",
                      "Ask {{name}} for the 4-digit pickup OTP from their app, then verify below.",
                      { name: displayName }
                    )}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
        contentContainerStyle={styles.scrollContent}
      >
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={18} color={colors.error[600]} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <RidePickupOtpEntry
          loading={loading}
          resetKey={resetKey}
          mode={isFood ? "food" : "ride"}
          onSubmit={onSubmit}
        />
      </ScrollView>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[300],
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    lineHeight: 19,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 16,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.error[700],
    lineHeight: 18,
  },
});
