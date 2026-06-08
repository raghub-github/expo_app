import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  /** When true, sheet is expanded — tap to collapse. */
  expanded: boolean;
  onPress: () => void;
};

/** Reference-style sheet toggle: centered grab bar + chevron at top. */
export function NavBottomSheetChevron({ expanded, onPress }: Props) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
        hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse order details" : "Expand order details"}
      >
        <View style={styles.handle} />
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-up"}
          size={22}
          color="#6B7280"
          style={styles.chevronIcon}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
  },
  pressable: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  pressablePressed: {
    opacity: 0.72,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 2,
  },
  chevronIcon: {
    alignSelf: "center",
  },
});
