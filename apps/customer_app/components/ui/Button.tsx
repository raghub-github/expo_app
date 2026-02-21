import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { cn } from "@/utils/cn";

type ButtonProps = {
  onPress: () => void;
  children: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Button({
  onPress,
  children,
  variant = "primary",
  loading,
  disabled,
  className,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className={cn(
        "py-3 rounded-xl items-center justify-center",
        variant === "primary" && "bg-primary-500",
        variant === "secondary" && "bg-gray-200 dark:bg-gray-700",
        variant === "outline" && "border-2 border-primary-500 bg-transparent",
        variant === "ghost" && "bg-transparent",
        isDisabled && "opacity-60",
        className
      )}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "outline" ? "#14b8a6" : "#6b7280"} />
      ) : (
        <Text
          className={cn(
            "font-semibold text-base",
            variant === "primary" && "text-white",
            variant === "secondary" && "text-gray-900 dark:text-white",
            variant === "outline" && "text-primary-500",
            variant === "ghost" && "text-gray-700 dark:text-gray-300"
          )}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
