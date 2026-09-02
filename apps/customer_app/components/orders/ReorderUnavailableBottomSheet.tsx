/**
 * Curved (wave-header) bottom sheet when reorder cannot restore order items.
 */

import { View, Pressable, StyleSheet, Platform, Text } from "react-native";
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

const BTN_H = 52;
const BTN_GAP = 10;

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
        <View style={styles.headerBlock}>
          <View style={styles.iconWrap}>
            <Ionicons name="bag-handle-outline" size={30} color={colors.primary[700]} />
          </View>

          <AppText style={styles.title}>{title}</AppText>
          <AppText style={styles.message}>{message}</AppText>
        </View>

        {hasMenu ? (
          <View style={styles.btnRow}>
            <View style={styles.btnSlot}>
              <Pressable
                onPress={onViewMenu}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="View menu"
              >
                <LinearGradient
                  colors={[colors.primary[500], colors.primary[600]]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.primaryInner} pointerEvents="none">
                  <Text style={styles.primaryText} numberOfLines={1}>
                    View menu
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </View>
              </Pressable>
            </View>

            <View style={styles.btnSlot}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.secondaryPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Got it"
              >
                <Text style={styles.secondaryText} numberOfLines={1}>
                  Got it
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.fullBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text style={styles.secondaryText}>OK</Text>
          </Pressable>
        )}
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "stretch",
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBlock: {
    alignItems: "center",
    width: "100%",
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
    flexDirection: "row",
    alignSelf: "stretch",
    width: "100%",
    marginHorizontal: -BTN_GAP / 2,
  },
  btnSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: BTN_GAP / 2,
  },
  primaryBtn: {
    height: BTN_H,
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: colors.primary[700],
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  primaryInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    flexShrink: 1,
  },
  secondaryBtn: {
    height: BTN_H,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary[500],
    backgroundColor: "#fff",
    paddingHorizontal: 10,
  },
  secondaryPressed: {
    backgroundColor: colors.primary[50],
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[700],
    textAlign: "center",
  },
  fullBtn: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: BTN_H,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.primary[500],
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.9,
  },
});
