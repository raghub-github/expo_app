import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "@/src/theme/colors";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Optional extra style (replaces former NativeWind className). */
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const variantStyle = (() => {
    switch (variant) {
      case "secondary":
        return { backgroundColor: "#0ea5e9" };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 2,
          borderColor: colors.primary[500],
        };
      case "ghost":
        return { backgroundColor: "transparent" };
      case "primary":
      default:
        return { backgroundColor: colors.primary[500] };
    }
  })();

  const textColor =
    variant === "primary" || variant === "secondary"
      ? "#ffffff"
      : colors.primary[600];

  const sizeStyle = (() => {
    switch (size) {
      case "sm":
        return { paddingHorizontal: 12, paddingVertical: 8 };
      case "lg":
        return { paddingHorizontal: 24, paddingVertical: 16 };
      case "md":
      default:
        return { paddingHorizontal: 16, paddingVertical: 12 };
    }
  })();

  const textSize = (() => {
    switch (size) {
      case "sm":
        return 14;
      case "lg":
        return 18;
      case "md":
      default:
        return 16;
    }
  })();

  return (
    <Pressable
      disabled={isDisabled}
      style={[
        styles.pressable,
        variantStyle,
        sizeStyle,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "secondary" ? "#fff" : colors.primary[600]}
          style={styles.loader}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          { color: textColor, fontSize: textSize },
          loading ? styles.labelLoading : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  disabled: {
    opacity: 0.5,
  },
  loader: {
    marginRight: 8,
  },
  label: {
    fontWeight: "600",
    flexShrink: 1,
  },
  labelLoading: {
    marginLeft: 8,
  },
});
