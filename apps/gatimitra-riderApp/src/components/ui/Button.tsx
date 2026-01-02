import React from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet, type PressableProps } from "react-native";
import { cn } from "@/src/utils/cn";
import { colors } from "@/src/theme/colors";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const variantStyles = {
    primary: "bg-primary-500 active:bg-primary-600",
    secondary: "bg-secondary-500 active:bg-secondary-600",
    outline: "border-2 border-primary-500 bg-transparent active:bg-primary-50",
    ghost: "bg-transparent active:bg-gray-100",
  };

  const textVariantStyles = {
    primary: "text-white",
    secondary: "text-white",
    outline: "text-primary-600",
    ghost: "text-primary-600",
  };

  const sizeStyles = {
    sm: "px-3 py-2",
    md: "px-4 py-3",
    lg: "px-6 py-4",
  };

  const textSizeStyles = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  // Fallback inline styles in case className/Tailwind doesn't work
  const getVariantStyle = () => {
    switch (variant) {
      case "primary":
        return { backgroundColor: colors.primary[500] };
      case "secondary":
        return { backgroundColor: "#0ea5e9" };
      case "outline":
        return { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.primary[500] };
      case "ghost":
        return { backgroundColor: "transparent" };
      default:
        return { backgroundColor: colors.primary[500] };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case "primary":
      case "secondary":
        return "#ffffff";
      case "outline":
      case "ghost":
        return colors.primary[600];
      default:
        return "#ffffff";
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case "sm":
        return { paddingHorizontal: 12, paddingVertical: 8 };
      case "md":
        return { paddingHorizontal: 16, paddingVertical: 12 };
      case "lg":
        return { paddingHorizontal: 24, paddingVertical: 16 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 12 };
    }
  };

  const getTextSize = () => {
    switch (size) {
      case "sm":
        return { fontSize: 14 };
      case "md":
        return { fontSize: 16 };
      case "lg":
        return { fontSize: 18 };
      default:
        return { fontSize: 16 };
    }
  };

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        "rounded-xl items-center justify-center flex-row",
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && "opacity-50",
        className
      )}
      style={[
        styles.pressable,
        getVariantStyle(),
        getSizeStyle(),
        { borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" },
        isDisabled && { opacity: 0.5 }
      ]}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={variant === "primary" || variant === "secondary" ? "#fff" : undefined} style={styles.loader} />}
      <Text
        className={cn(
          "font-semibold",
          textVariantStyles[variant],
          textSizeStyles[size],
          loading && "ml-2"
        )}
        style={[
          { fontWeight: "600", color: getTextColor() },
          getTextSize(),
          loading && { marginLeft: 8 }
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44, // iOS touch target
  },
  loader: {
    marginRight: 8,
  },
});



