import { Pressable, Text, StyleSheet, View } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { CustomerWeatherContext, WeatherSeverity } from "@/services/weather.service";

const BRAND = GatiMitraColors.splashMint;

type Variant = "compact" | "pill" | "inline";

type Props = {
  weather: CustomerWeatherContext | null | undefined;
  onPress?: () => void;
  variant?: Variant;
};

function chipColors(severity: WeatherSeverity): { bg: string; border: string; text: string } {
  switch (severity) {
    case "EXTREME_WEATHER":
      return { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" };
    case "HEAVY_RAIN":
      return { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C" };
    case "MODERATE_RAIN":
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" };
    case "LIGHT_RAIN":
      return { bg: "#F0FDF9", border: "#99F6E4", text: BRAND };
    default:
      return { bg: "#F9FAFB", border: "#E5E7EB", text: "#6B7280" };
  }
}

export function WeatherStatusChip({ weather, onPress, variant = "compact" }: Props) {
  if (!weather?.showChip || !weather.chipLabel) return null;
  const colors = chipColors(weather.severity);

  const content = (
    <View
      style={[
        styles.chip,
        variant === "pill" && styles.chipPill,
        variant === "inline" && styles.chipInline,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          variant === "pill" && styles.chipTextPill,
          { color: colors.text },
        ]}
        numberOfLines={1}
      >
        {weather.chipLabel}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  chipPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 0,
  },
  chipInline: {
    marginTop: 0,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextPill: {
    fontSize: 11,
    fontWeight: "700",
  },
});
