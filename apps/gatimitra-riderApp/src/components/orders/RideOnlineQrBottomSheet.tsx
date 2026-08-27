import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
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
  const { width: windowWidth } = useWindowDimensions();

  /** Large square QR — nearly full sheet width so passengers can scan easily. */
  const qrSize = useMemo(() => {
    const horizontalPad = 56;
    const target = Math.floor(windowWidth - horizontalPad);
    return Math.max(280, Math.min(target, 360));
  }, [windowWidth]);

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.88}
      minHeightRatio={0.62}
      showOuterHandle={false}
      showFloatingClose
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>
            {t("orders.ridePaymentWait.onlineSheetTitle", "Scan & pay online")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "orders.ridePaymentWait.onlineSheetSub",
              "Ask the passenger to scan this QR and pay {{amount}}.",
              { amount: amountLabel }
            )}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {loading && !qrImageUrl ? (
          <View style={[styles.centerWrap, { minHeight: qrSize + 40 }]}>
            <ActivityIndicator color={MINT_DARK} size="large" />
            <Text style={styles.loadingText}>
              {t("orders.ridePaymentWait.qrLoading", "Generating QR…")}
            </Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerWrap}>
            <Ionicons name="alert-circle-outline" size={36} color="#DC2626" />
            <Text style={styles.errorText}>{errorMessage}</Text>
            {onRetry ? (
              <Pressable style={styles.retryBtn} onPress={onRetry}>
                <Text style={styles.retryLabel}>
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
            <Text style={styles.waitText}>
              {t(
                "orders.ridePaymentWait.qrSub",
                "This confirms automatically once they pay."
              )}
            </Text>
          </>
        ) : null}

        <Pressable style={styles.cancelBtn} onPress={onDismiss}>
          <Text style={styles.cancelLabel}>
            {t("common.cancel", "Cancel")}
          </Text>
        </Pressable>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
    paddingRight: 8,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
    alignItems: "center",
    width: "100%",
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
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
});
