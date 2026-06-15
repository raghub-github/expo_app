import React from "react";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { OrderOtpVerifySheetContent } from "@/src/components/orders/OrderOtpVerifySheetContent";
import { colors } from "@/src/theme";

const PICKUP_SHEET_GRADIENT: [string, string] = ["#EFF6FF", "#FFFFFF"];
const PICKUP_BADGE_GRADIENT: [string, string] = [
  colors.secondary[600],
  colors.secondary[400],
];

type Props = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  customerName?: string | null;
  orderIdLabel?: string | null;
  otpContext?: "customer" | "merchant";
  purpose?: "pickup" | "drop";
  waitTimerLabel?: string | null;
  rideType?: string | null;
  bottomOffset?: number;
  onDismiss: () => void;
  onSubmit: (otp: string) => void;
  onClearError?: () => void;
};

export function PickupOtpBottomSheet({
  visible,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  orderIdLabel: _orderIdLabel,
  otpContext = "customer",
  purpose = "pickup",
  waitTimerLabel: _waitTimerLabel,
  rideType: _rideType,
  bottomOffset = 0,
  onDismiss,
  onSubmit,
  onClearError,
}: Props) {
  const { t } = useTranslation();
  const isFood = otpContext === "merchant";
  const isDropOtp = purpose === "drop";
  const isRidePickup = !isFood && !isDropOtp;

  const displayName =
    customerName?.trim() ||
    (isFood
      ? t("orders.activeFood.merchantFallback", "the restaurant")
      : t("orders.activeRide.customerFallback", "Customer"));

  const title = isFood
    ? t("orders.activeFood.verifyPickupTitle", "Verify Pickup")
    : isDropOtp
      ? t("orders.activeRide.dropOtpSheetTitle", "Enter drop OTP")
      : isRidePickup
        ? t("orders.activeRide.verifyRideStartTitle", "Verify Ride Start")
        : t("orders.activeRide.otpTitle", "Enter customer pickup OTP");

  const subtitle = isFood
    ? t(
        "orders.activeFood.verifyPickupSubtitle",
        "Ask {{name}} for the 4-digit OTP",
        { name: displayName }
      )
    : isDropOtp
      ? t(
          "orders.activeRide.dropOtpSheetSubtitle",
          "Ask {{name}} for the 4-digit drop OTP shown in their app to complete the ride.",
          { name: displayName }
        )
      : isRidePickup
        ? t(
            "orders.activeRide.verifyRideStartSubtitle",
            "Ask the passenger for the 4-digit OTP"
          )
        : t(
            "orders.activeRide.otpSubtitle",
            "Ask the customer for their 4-digit code to start the ride."
          );

  const compactSubtitle = isFood
    ? t(
        "orders.activeFood.verifyPickupCompact",
        "Enter the 4-digit pickup OTP from {{name}}.",
        { name: displayName }
      )
    : isDropOtp
      ? t(
          "orders.activeRide.dropOtpSheetCompact",
          "Enter drop OTP from {{name}}.",
          { name: displayName }
        )
      : t(
          "orders.activeRide.otpSheetCompact",
          "Enter the 4-digit pickup code from the customer."
        );

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.82}
      showOuterHandle={false}
      bottomOffset={bottomOffset}
      compactBottomInset
      fitContent
      embedded
      keyboardAware
    >
      <OrderOtpVerifySheetContent
        title={title}
        subtitle={subtitle}
        compactSubtitle={compactSubtitle}
        iconName="shield-checkmark"
        headerGradient={PICKUP_SHEET_GRADIENT}
        badgeGradient={PICKUP_BADGE_GRADIENT}
        error={error}
        loading={loading}
        resetKey={resetKey}
        otpMode={isFood ? "food" : "ride"}
        inputMode="system"
        autoFocus
        onSubmit={onSubmit}
        onClearError={onClearError}
      />
    </DismissibleBottomSheetShell>
  );
}
