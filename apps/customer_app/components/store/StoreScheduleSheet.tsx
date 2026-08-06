/**
 * Schedule-for-later is disabled for now — curved coming-soon sheet.
 */

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { StoreTheme } from "@/constants/storeTheme";

export type StoreScheduleSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Kept for call-site compatibility; not shown while scheduling is disabled. */
  storeName?: string;
  /** No-op while scheduling is disabled. */
  onConfirm?: (slotLabel: string) => void;
};

export function StoreScheduleSheet({ visible, onClose }: StoreScheduleSheetProps) {
  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.42}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={28} color={StoreTheme.accentMintDark} />
        </View>
        <AppText style={styles.title}>Scheduled order system coming soon</AppText>
        <AppText style={styles.message}>
          For now, you can place a regular order.
        </AppText>
        <TouchableOpacity
          style={styles.cta}
          onPress={onClose}
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
    backgroundColor: StoreTheme.accentMintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
  },
  cta: {
    alignSelf: "stretch",
    backgroundColor: StoreTheme.accentMint,
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
