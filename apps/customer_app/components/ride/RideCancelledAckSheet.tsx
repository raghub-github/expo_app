/**
 * Post-cancel acknowledgement — curved header bottom sheet.
 * Closes on "Got it" or auto-hides after 2 seconds.
 */

import { useEffect, useRef } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { RIDE_CUSTOMER_CANCELLED_TOAST } from "@/lib/ride-search-toast-copy";

const AUTO_HIDE_MS = 2_000;

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  onDismiss: () => void;
};

export function RideCancelledAckSheet({
  visible,
  title = RIDE_CUSTOMER_CANCELLED_TOAST.title,
  message = RIDE_CUSTOMER_CANCELLED_TOAST.message,
  onDismiss,
}: Props) {
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      dismissedRef.current = false;
      return;
    }
    dismissedRef.current = false;
    const t = setTimeout(() => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      onDismiss();
    }, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  const handleGotIt = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

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
          onPress={handleGotIt}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <AppText style={styles.ctaText}>Got it</AppText>
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
