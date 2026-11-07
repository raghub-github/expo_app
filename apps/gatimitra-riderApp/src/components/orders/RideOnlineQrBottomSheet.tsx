import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText } from "@/src/theme/responsiveText";
import { colors } from "@/src/theme";

const MINT_DARK = colors.primary[700];

/**
 * Mild crop: trim Razorpay logos / side rails without eating finder patterns
 * or the quiet zone (aggressive crop made UPI apps fail to scan).
 */
const RAZORPAY_TEMPLATE_CROP_SCALE = 1.48;
/** White quiet-zone around the matrix so scanners can lock. */
const QR_QUIET_ZONE = 18;

type Props = {
  visible: boolean;
  onDismiss: () => void;
  amountLabel: string;
  qrImageUrl?: string | null;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Brief success flash before the parent closes the sheet. */
  paymentSuccess?: boolean;
};

export function RideOnlineQrBottomSheet({
  visible,
  onDismiss,
  amountLabel,
  qrImageUrl,
  loading = false,
  errorMessage,
  onRetry,
  paymentSuccess = false,
}: Props) {
  const { t } = useTranslation();
  const { width: windowWidth, height, isShortHeight } = useResponsiveLayout();

  /** Slightly inset so the full matrix + quiet zone stay on-screen and scannable. */
  const qrSize = useMemo(() => {
    const horizontalPad = 56;
    const target = Math.floor(windowWidth - horizontalPad);
    const maxByHeight = Math.floor(height * (isShortHeight ? 0.36 : 0.4));
    return Math.max(220, Math.min(target, maxByHeight, 320));
  }, [windowWidth, height, isShortHeight]);

  const innerSize = qrSize - QR_QUIET_ZONE * 2;
  const croppedImageSize = Math.round(innerSize * RAZORPAY_TEMPLATE_CROP_SCALE);
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.86 : 0.8));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={isShortHeight ? 0.9 : 0.86}
      minHeightRatio={isShortHeight ? 0.5 : 0.6}
      showOuterHandle={false}
      showFloatingClose
    >
      <ResponsiveSheetBody
        maxHeight={bodyMaxH}
        contentContainerStyle={styles.bodyContent}
      >
        <View style={styles.headerTextCol}>
          <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
            {paymentSuccess
              ? t(
                  "orders.ridePaymentWait.paymentSuccessTitle",
                  "Payment Received Successfully"
                )
              : t("orders.ridePaymentWait.onlineSheetTitle", "Scan & pay online")}
          </Text>
          {!paymentSuccess ? (
            <Text
              style={[styles.subtitle, flexShrinkText]}
              numberOfLines={isShortHeight ? 3 : 4}
            >
              {t(
                "orders.ridePaymentWait.onlineSheetSub",
                "Ask the passenger to scan this QR and pay {{amount}}.",
                { amount: amountLabel }
              )}
            </Text>
          ) : null}
        </View>

        <View style={styles.body}>
          {paymentSuccess ? (
            <View style={[styles.centerWrap, { minHeight: Math.min(qrSize, 200) }]}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={64} color={MINT_DARK} />
              </View>
              <Text style={[styles.successText, flexShrinkText]} numberOfLines={3}>
                {t(
                  "orders.ridePaymentWait.paymentSuccessSub",
                  "Fare collected. Continuing…"
                )}
              </Text>
            </View>
          ) : loading && !qrImageUrl ? (
            <View style={[styles.centerWrap, { minHeight: Math.min(qrSize, 180) }]}>
              <ActivityIndicator color={MINT_DARK} size="large" />
              <Text style={styles.loadingText}>
                {t("orders.ridePaymentWait.qrLoading", "Generating QR…")}
              </Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centerWrap}>
              <Ionicons name="alert-circle-outline" size={36} color="#DC2626" />
              <Text style={[styles.errorText, flexShrinkText]} numberOfLines={5}>
                {errorMessage}
              </Text>
              {onRetry ? (
                <Pressable style={styles.retryBtn} onPress={onRetry}>
                  <Text style={styles.retryLabel} numberOfLines={1}>
                    {t("common.retry", "Retry")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : qrImageUrl ? (
            <>
              <View style={[styles.qrFrame, { width: qrSize, height: qrSize }]}>
                <View
                  style={[
                    styles.qrClip,
                    {
                      width: innerSize,
                      height: innerSize,
                      margin: QR_QUIET_ZONE,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: qrImageUrl }}
                    style={{
                      width: croppedImageSize,
                      height: croppedImageSize,
                      marginLeft: (innerSize - croppedImageSize) / 2,
                      marginTop: (innerSize - croppedImageSize) / 2,
                    }}
                    resizeMode="cover"
                    accessibilityLabel="Payment QR code"
                  />
                </View>
              </View>
              <Text style={[styles.hintText, flexShrinkText]} numberOfLines={2}>
                {t(
                  "orders.ridePaymentWait.autoConfirmHint",
                  "Confirms automatically after the UPI payment succeeds."
                )}
              </Text>
            </>
          ) : null}
        </View>
      </ResponsiveSheetBody>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  bodyContent: {
    paddingTop: 18,
    paddingBottom: 20,
    alignItems: "stretch",
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
    maxWidth: "100%",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1C",
  },
  subtitle: {
    fontSize: 14,
    color: "#5F6368",
    lineHeight: 20,
    fontWeight: "500",
  },
  body: {
    gap: 14,
    alignItems: "center",
    width: "100%",
    maxWidth: "100%",
  },
  centerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 12,
    width: "100%",
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "600",
    paddingHorizontal: 8,
    maxWidth: "100%",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: MINT_DARK,
  },
  retryLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  qrFrame: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    maxWidth: "100%",
  },
  qrClip: {
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  hintText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 17,
    fontWeight: "500",
    maxWidth: "100%",
    paddingHorizontal: 12,
  },
  successIconWrap: {
    marginBottom: 4,
  },
  successText: {
    fontSize: 15,
    color: "#374151",
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 21,
  },
});
