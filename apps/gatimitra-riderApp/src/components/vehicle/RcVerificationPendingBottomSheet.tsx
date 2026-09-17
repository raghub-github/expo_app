import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { LORA_BOLD, LORA_REGULAR } from "@/src/theme/headerFonts";
import { colors } from "@/src/theme";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const TEAL = colors.primary[600];

type Props = {
  visible: boolean;
  onSkip?: () => void;
  onAcknowledge: () => void;
};

/** Shown while RC is MANUAL_REVIEW_PENDING — never the Cashfree vehicle-complete sheet. */
export function RcVerificationPendingBottomSheet({ visible, onSkip, onAcknowledge }: Props) {
  const { t } = useTranslation();

  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.55}>
      <View style={styles.container}>
        <View style={[rowLayout.rowStart, styles.header]}>
          <View style={[styles.iconWrap, rowLayout.noShrink]}>
            <Ionicons name="time-outline" size={26} color={TEAL} />
          </View>
          <View style={[styles.headerText, rowLayout.grow]}>
            <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
              {t("vehicle.rcGate.pendingTitle", "Document verification pending")}
            </Text>
            <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={4}>
              {t(
                "vehicle.rcGate.pendingSubtitle",
                "Your Registration Certificate is under review. You can complete vehicle details after our team approves it.",
              )}
            </Text>
          </View>
        </View>

        <Pressable onPress={onAcknowledge} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>{t("common.ok", "OK")}</Text>
        </Pressable>
        {onSkip ? (
          <Pressable onPress={onSkip} style={styles.skipBtn} accessibilityRole="button">
            <Text style={styles.skipText}>{t("vehicle.sheet.skip", "Skip for now")}</Text>
          </Pressable>
        ) : null}
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
    marginBottom: 20,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: LORA_BOLD,
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: LORA_REGULAR,
    color: "#64748B",
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  skipBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    fontFamily: LORA_REGULAR,
    color: "#64748B",
  },
});
