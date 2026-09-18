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
  onReupload: () => void;
};

/** Shown when RC is MANUAL_REJECTED or NAME_MISMATCH — reupload, not vehicle complete. */
export function RcVerificationRejectedBottomSheet({ visible, onSkip, onReupload }: Props) {
  const { t } = useTranslation();

  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.58}>
      <View style={styles.container}>
        <View style={[rowLayout.rowStart, styles.header]}>
          <View style={[styles.iconWrap, rowLayout.noShrink]}>
            <Ionicons name="alert-circle-outline" size={26} color="#DC2626" />
          </View>
          <View style={[styles.headerText, rowLayout.grow]}>
            <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
              {t("vehicle.rcGate.rejectedTitle", "Registration Certificate rejected")}
            </Text>
            <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={5}>
              {t(
                "vehicle.rcGate.rejectedSubtitle",
                "Please re-upload a clear photo of your RC. Vehicle details unlock after the new document is approved.",
              )}
            </Text>
          </View>
        </View>

        <Pressable onPress={onReupload} style={styles.primaryBtn} accessibilityRole="button">
          <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>
            {t("vehicle.rcGate.reuploadCta", "Re-upload Registration Certificate")}
          </Text>
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
    backgroundColor: "#FEF2F2",
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
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
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
