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

type Props = {
  visible: boolean;
  onDismiss: () => void;
  amountLabel: string;
  qrImageUrl?: string | null;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

export function RideOnlineQrBottomSheet({
  visible,
  onDismiss,
  amountLabel,
  qrImageUrl,
  loading = false,
  errorMessage,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const { width: windowWidth, height, isShortHeight } = useResponsiveLayout();

  /** Large square QR — nearly full sheet width so passengers can scan easily. */
  const qrSize = useMemo(() => {
    const horizontalPad = 56;
    const target = Math.floor(windowWidth - horizontalPad);
    const capped = Math.max(220, Math.min(target, isShortHeight ? 280 : 360));
    return capped;
  }, [windowWidth, isShortHeight]);

  const bodyMaxH = Math.round(height * (isShortHeight ? 0.78 : 0.72));

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={isShortHeight ? 0.92 : 0.88}
      minHeightRatio={isShortHeight ? 0.5 : 0.62}
      showOuterHandle={false}
      showFloatingClose
    >
      <ResponsiveSheetBody
        maxHeight={bodyMaxH}
        contentContainerStyle={styles.bodyContent}
        footerStyle={styles.footerSlot}
        footer={
          <Pressable style={styles.cancelBtn} onPress={onDismiss}>
            <Text style={styles.cancelLabel} numberOfLines={1}>
              {t("common.cancel", "Cancel")}
            </Text>
          </Pressable>
        }
      >
        <View style={styles.headerTextCol}>
          <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
            {t("orders.ridePaymentWait.onlineSheetTitle", "Scan & pay online")}
          </Text>
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
        </View>

        <View style={styles.body}>
          {loading && !qrImageUrl ? (
            <View style={[styles.centerWrap, { minHeight: Math.min(qrSize, 200) }]}>
              <ActivityIndicator color={MINT_DARK} size="large" />
              <Text style={styles.loadingText}>
                {t("orders.ridePaymentWait.qrLoading", "Generating QR…")}
              </Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centerWrap}>
              <Ionicons name="alert-circle-outline" size={36} color="#DC2626" />
              <Text style={[styles.errorText, flexShrinkText]} numberOfLines={4}>
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
              <View style={[styles.qrWrap, { width: qrSize + 24, height: qrSize + 24 }]}>
                <Image
                  source={{ uri: qrImageUrl }}
                  style={[styles.qrImage, { width: qrSize, height: qrSize }]}
                  resizeMode="contain"
                  accessibilityLabel="Payment QR code"
                />
              </View>
              <Text style={[styles.waitText, flexShrinkText]} numberOfLines={3}>
                {t(
                  "orders.ridePaymentWait.qrSub",
                  "This confirms automatically once they pay."
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
    alignItems: "stretch",
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingBottom: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
    maxWidth: "100%",
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
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
    gap: 16,
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
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  qrImage: {
    aspectRatio: 1,
  },
  waitText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "600",
    maxWidth: "100%",
  },
  cancelBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  cancelLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
});
