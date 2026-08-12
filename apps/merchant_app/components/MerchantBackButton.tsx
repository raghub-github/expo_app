import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

export const MERCHANT_HEADER_BACK_ICON_SIZE = 20;
export const MERCHANT_HEADER_BACK_HIT = 36;

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
  /** Extra style for the touch target (e.g. marginRight in inline headers). */
  style?: object;
};

/** Consistent back chevron for merchant headers and sub-screens. */
export function MerchantBackButton({
  onPress,
  accessibilityLabel = "Go back",
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, style, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name="chevron-back"
        size={MERCHANT_HEADER_BACK_ICON_SIZE}
        color={GatiMitraMerchant.textPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: MERCHANT_HEADER_BACK_HIT,
    height: MERCHANT_HEADER_BACK_HIT,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  pressed: { opacity: 0.72 },
});
