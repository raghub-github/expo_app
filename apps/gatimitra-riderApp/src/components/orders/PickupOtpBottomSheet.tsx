import React from "react";
import { useTranslation } from "react-i18next";
import { OtpVerifySheetModal } from "@gatimitra/otp-verify-ui";
import { riderOtpVerifyTheme } from "@/src/theme/otpVerifyTheme";

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

function PickupOtpBottomSheetInner({
  visible,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  otpContext = "customer",
  purpose = "pickup",
  onDismiss,
  onSubmit,
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

  const subtitle = isFood
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
      : isRidePickup
        ? t("orders.activeRide.verifyRideStartSubtitle", "Ask the passenger for the 4-digit OTP")
        : t(
            "orders.activeRide.otpSubtitle",
            "Ask the customer for their 4-digit code to start the ride."
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
      theme={riderOtpVerifyTheme}
    />
  );
}

export const PickupOtpBottomSheet = React.memo(PickupOtpBottomSheetInner);
