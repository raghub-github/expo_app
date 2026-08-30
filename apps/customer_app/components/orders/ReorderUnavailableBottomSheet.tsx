/**
 * Curved (wave-header) bottom sheet when reorder cannot restore order items.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  /** When set, show a primary "View menu" action. */
  onViewMenu?: (() => void) | null;
  onClose: () => void;
};

export function ReorderUnavailableBottomSheet({
  visible,
  title = "Unable to reorder",
  message = "Items from this order are unavailable. Try viewing the menu instead.",
  onViewMenu,
  onClose,
}: Props) {
  const hasMenu = typeof onViewMenu === "function";

  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.55} onClose={onClose}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="bag-handle-outline" size={30} color={colors.primary[700]} />
        </View>

        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.message}>{message}</AppText>

        {hasMenu ? (
          <View style={styles.btnRow}>
            <Pressable
              onPress={onViewMenu}
              style={({ pressed }) => [styles.halfPress, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="View menu"
            >
              <LinearGradient
                colors={[colors.primary[500], colors.primary[600]]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.primaryBtn}
              >
                <AppText style={styles.primaryText} numberOfLines={1}>
                  View menu
                </AppText>
                <Ionicons name="chevron-forward" size={15} color="#fff" />
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.halfSecondary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <AppText style={styles.secondaryText}>Got it</AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.fullSecondary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <AppText style={styles.secondaryText}>OK</AppText>
          </Pressable>
        )}
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 8,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  btnRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  halfPress: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  halfSecondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    backgroundColor: "#fff",
  },
  fullSecondary: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    backgroundColor: "#fff",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  pressed: {
    opacity: 0.88,
  },
});
