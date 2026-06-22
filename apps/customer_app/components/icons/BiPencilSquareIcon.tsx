/**
 * Bootstrap Icons `bi-pencil-square` equivalent for React Native.
 * Uses MaterialCommunityIcons `square-edit-outline` (pencil on square — visible on Android/iOS).
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { StyleProp, TextStyle } from "react-native";

type BiPencilSquareIconProps = {
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function BiPencilSquareIcon({
  size = 16,
  color = "#111827",
  style,
}: BiPencilSquareIconProps) {
  return (
    <MaterialCommunityIcons
      name="square-edit-outline"
      size={size}
      color={color}
      style={style}
    />
  );
}
