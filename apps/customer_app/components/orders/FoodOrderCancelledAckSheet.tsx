/**
 * Post food-order cancel acknowledgement — curved wave header bottom sheet.
 */

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  onDismiss: () => void;
};

export function FoodOrderCancelledAckSheet({
  visible,
  title = "Order cancelled",
  message,
  onDismiss,
}: Props) {
  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.42}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <AppText style={styles.iconGlyph}>✕</AppText>
        </View>
        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.message}>{message}</AppText>
        <TouchableOpacity
          style={styles.cta}
          onPress={onDismiss}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="OK"
        >
          <AppText style={styles.ctaText}>OK</AppText>
        </TouchableOpacity>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  iconGlyph: {
    fontSize: 22,
    fontWeight: "800",
    color: "#DC2626",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
  },
  cta: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
