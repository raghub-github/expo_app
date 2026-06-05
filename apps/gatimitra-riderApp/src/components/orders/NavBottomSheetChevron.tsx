import React from "react";
import { Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type Props = {
  /** When true, sheet is expanded — tap to collapse. */
  expanded: boolean;
  onPress: () => void;
};

export function NavBottomSheetChevron({ expanded, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Collapse order details" : "Expand order details"}
    >
      <Ionicons
        name={expanded ? "chevron-down" : "chevron-up"}
        size={20}
        color={colors.gray[700]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 44,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  pillPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});
