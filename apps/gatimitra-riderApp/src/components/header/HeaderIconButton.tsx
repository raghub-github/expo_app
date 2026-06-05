import React from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

type HeaderIconButtonProps = {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
  style?: ViewStyle;
};

/** Bordered squircle button — matches reference header icon frame */
export function HeaderIconButton({
  onPress,
  children,
  accessibilityLabel,
  style,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.box, pressed && styles.boxPressed, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  boxPressed: {
    backgroundColor: "#F9FAFB",
    opacity: 0.92,
  },
});
