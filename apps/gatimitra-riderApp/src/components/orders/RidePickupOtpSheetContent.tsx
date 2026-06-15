import React from "react";
import { View, Text, StyleSheet, Image, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { RidePickupOtpEntry } from "@/src/components/orders/RidePickupOtpEntry";
import { resolveRideVehicleImage } from "@/src/lib/ride-vehicle-assets";
import { colors } from "@/src/theme";

type Props = {
  customerName?: string | null;
  rideType?: string | null;
  error?: string | null;
  loading?: boolean;
  resetKey?: number;
  waitTimerLabel?: string | null;
  onSubmit: (otp: string) => void;
  onClearError?: () => void;
};

export function RidePickupOtpSheetContent({
  customerName,
  rideType,
  error,
  loading = false,
  resetKey = 0,
  waitTimerLabel,
  onSubmit,
  onClearError,
}: Props) {
  const { t } = useTranslation();

  const displayName =
    customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");
  const vehicleImage: ImageSourcePropType = resolveRideVehicleImage(rideType);

  return (
    <View style={styles.root}>
      <View style={styles.handle} />

      <Text style={styles.sheetTitle}>
        {t("orders.activeRide.verifyCustomerTitle", "Verify Customer")}
      </Text>
      <Text style={styles.sheetSubtitle}>
        {t(
          "orders.activeRide.otpSubtitle",
          "Ask the customer for their 4-digit code to start the ride."
        )}
      </Text>

      <View style={styles.vehicleWrap}>
        <Image source={vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
      </View>

      {waitTimerLabel ? (
        <View style={styles.waitTimerCard}>
          <Text style={styles.waitTimerLabel}>{waitTimerLabel}</Text>
        </View>
      ) : null}

      <View style={styles.sheetBody}>
        <View style={styles.cardTop}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary[700]} />
            </View>
            <Text style={styles.cardTitle}>
              {t("orders.activeRide.otpEntryLabel", "Enter 4-digit OTP")}
            </Text>
          </View>
          <Text style={styles.cardHint}>
            {t(
              "orders.activeRide.otpEntryHintCustomer",
              "Please enter the code shared by {{name}}.",
              { name: displayName }
            )}
          </Text>
        </View>

        <RidePickupOtpEntry
          loading={loading}
          error={error}
          resetKey={resetKey}
          mode="ride"
          inputMode="keypad"
          layout="ride-sheet"
          autoSubmit
          hideSectionCopy
          onSubmit={onSubmit}
          onErrorClear={onClearError}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    overflow: "visible",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[300],
    marginTop: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    letterSpacing: -0.3,
    paddingHorizontal: 20,
  },
  sheetSubtitle: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 24,
  },
  vehicleWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginBottom: 10,
    minHeight: 88,
  },
  vehicleImage: {
    width: 168,
    height: 88,
  },
  waitTimerCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FDE047",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  waitTimerLabel: {
    color: "#854D0E",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  sheetBody: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.gray[100],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: "#ffffff",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.gray[900],
  },
  cardHint: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    lineHeight: 18,
    marginBottom: 4,
  },
});
