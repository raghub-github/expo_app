import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  /** Avatar diameter the badge sits on. */
  avatarSize?: number;
  /** Badge diameter. */
  size?: number;
  onPress: () => void;
  accessibilityLabel: string;
};

/**
 * Mint camera badge on the bottom-right of a circular avatar.
 * Absolute styles live on a plain View (not Pressable) so css-interop
 * cannot strip position and drop the icon into document flow.
 */
export function ProfileAvatarCameraBadge({
  avatarSize = 76,
  size = 26,
  onPress,
  accessibilityLabel,
}: Props) {
  // Sit on the circle edge, nudged slightly right/down like the reference.
  const left = avatarSize - size + 4;
  const top = avatarSize - size + 2;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        {
          left,
          top,
          width: size,
          height: size,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Ionicons name="camera" size={Math.round(size * 0.46)} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    zIndex: 30,
  },
  btn: {
    backgroundColor: "#14B8A6",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
