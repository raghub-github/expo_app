import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { LORA_BOLD, LORA_REGULAR } from "@/src/theme/headerFonts";
import { colors } from "@/src/theme";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

export type RcVehicleMismatchSheetProps = {
  visible: boolean;
  selectedLabel: string;
  rcLabel: string;
  suggestedLabel?: string | null;
  loading?: boolean;
  /** Restore Category+Type bound to the previously verified RC. */
  onContinueWithLastRcVehicle: () => void;
  /** Keep new selection and clear/invalidate the old RC for this selection. */
  onSubmitNewRc: () => void;
};

export function RcVehicleTypeMismatchBottomSheet({
  visible,
  selectedLabel,
  rcLabel,
  suggestedLabel,
  loading,
  onContinueWithLastRcVehicle,
  onSubmitNewRc,
}: RcVehicleMismatchSheetProps) {
  const { t } = useTranslation();

  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.68}>
      <View style={styles.container}>
        <View style={[rowLayout.rowStart, styles.header]}>
          <View style={[styles.iconWrap, rowLayout.noShrink]}>
            <Ionicons name="warning-outline" size={26} color="#B45309" />
          </View>
          <View style={[styles.headerText, rowLayout.grow]}>
            <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
              {t("onboarding.rcVehicleMismatch.title", "RC Vehicle Type Mismatch")}
            </Text>
            <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={8}>
              {t(
                "onboarding.rcVehicleMismatch.body",
                "The RC you previously submitted is registered for a different vehicle type. Please submit a new RC for your currently selected vehicle type.",
              )}
            </Text>
          </View>
        </View>

        <View style={styles.compareBox}>
          <Text style={styles.compareLine}>
            <Text style={styles.compareLabel}>Selected Vehicle: </Text>
            {selectedLabel}
          </Text>
          <Text style={styles.compareLine}>
            <Text style={styles.compareLabel}>Last Submitted RC: </Text>
            {suggestedLabel?.trim() ? suggestedLabel : rcLabel}
          </Text>
          {suggestedLabel?.trim() && suggestedLabel.trim() !== rcLabel.trim() ? (
            <Text style={[styles.compareLine, styles.hintLine]}>
              <Text style={styles.compareLabel}>RC class: </Text>
              {rcLabel}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={onSubmitNewRc}
          disabled={loading}
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>
            {t("onboarding.rcVehicleMismatch.submitNew", "Submit New RC")}
          </Text>
        </Pressable>
        <Pressable
          onPress={onContinueWithLastRcVehicle}
          disabled={loading}
          style={[styles.secondaryBtn, loading && styles.btnDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>
            {t(
              "onboarding.rcVehicleMismatch.continueLast",
              "Continue with Last Submitted RC & Vehicle Type",
            )}
          </Text>
        </Pressable>
      </View>
    </BlockingBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: "100%",
    paddingBottom: 8,
  },
  header: {
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 20,
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: LORA_REGULAR,
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
  },
  compareBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    gap: 8,
  },
  compareLine: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  compareLabel: {
    fontWeight: "600",
    color: "#111827",
  },
  hintLine: {
    color: "#6B7280",
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: colors.primary[600],
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.primary[600],
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    color: colors.primary[700],
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
