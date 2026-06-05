import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RidePickupOtpEntry } from "@/src/components/orders/RidePickupOtpEntry";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  proofImageUri: string;
  loading?: boolean;
  error?: string | null;
  resetKey?: number;
  customerName?: string | null;
  bottomOffset?: number;
  onDismiss: () => void;
  onSubmit: (otp: string) => void;
};

export function FoodDeliveryConfirmBottomSheet({
  visible,
  proofImageUri,
  loading = false,
  error,
  resetKey = 0,
  customerName,
  bottomOffset = 0,
  onDismiss,
  onSubmit,
}: Props) {
  const { t } = useTranslation();

  const displayName =
    customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");

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
        colors={["#ECFDF5", "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <LinearGradient
            colors={[colors.success[600], colors.success[400]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconBadge}
          >
            <Ionicons name="shield-checkmark" size={22} color="#ffffff" />
          </LinearGradient>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              {t("orders.activeFood.deliveryOtpSheetTitle", "Verify delivery OTP")}
            </Text>
            <Text style={styles.subtitle}>
              {t(
                "orders.activeFood.deliveryOtpSheetSubtitle",
                "Photo captured. Ask {{name}} for the Delivery OTP from their GatiMitra app. Photo saves after OTP is verified.",
                { name: displayName }
              )}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.scrollContent}
      >
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

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={18} color={colors.error[600]} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <RidePickupOtpEntry
          loading={loading}
          resetKey={resetKey}
          mode="delivery"
          autoSubmit
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
  headerCopy: { flex: 1, minWidth: 0 },
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
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    marginHorizontal: 20,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
  },
  photoBox: {
    marginHorizontal: 20,
    height: 160,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.success[300],
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    marginBottom: 12,
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
