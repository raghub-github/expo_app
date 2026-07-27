import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  /** When true, sheet is expanded — tap to collapse. */
  expanded: boolean;
  onPress: () => void;
};

/** Center grab-bar ("—") toggles expand / collapse. */
export function NavBottomSheetChevron({ expanded, onPress }: Props) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
        hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? "Collapse order details" : "Expand order details"}
      >
        <View style={styles.handle} />
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
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 36,
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
  },
});
