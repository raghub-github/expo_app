import { Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CustomerWeatherContext } from "@/services/weather.service";

const RAIN_BLUE = "#3B82F6";
const BORDER = "#E3EEF8";

type Props = {
  weather: CustomerWeatherContext | null | undefined;
  onPress?: () => void;
};

function cleanCopy(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*/u, "")
    .replace(/\s+in\s+—\s*$/i, "")
    .trim();
}

function displayArea(weather: CustomerWeatherContext): string {
  const raw =
    weather.areaLabel?.trim() ||
    weather.city?.trim() ||
    weather.zone?.trim() ||
    "your area";
  return raw.replace(/^🌦\s*/i, "").replace(/—/g, "").trim() || "your area";
}

function shouldShow(weather: CustomerWeatherContext | null | undefined): weather is CustomerWeatherContext {
  if (!weather) return false;
  if (!weather.rainDetected) return false;
  return weather.showBanner === true;
}

export function LocationWeatherBanner({ weather, onPress }: Props) {
  if (!shouldShow(weather)) return null;

  const area = displayArea(weather);
  let title = cleanCopy(weather.bannerTitle);
  if (!title || title.endsWith("in") || title.includes("—")) {
    if (weather.severity === "LIGHT_RAIN") title = `Light rain in ${area}`;
    else if (weather.severity === "MODERATE_RAIN") title = `Rain in ${area}`;
    else if (weather.severity === "HEAVY_RAIN") title = `Heavy rain in ${area}`;
    else if (weather.severity === "EXTREME_WEATHER") title = `Severe weather in ${area}`;
  }
  const subtitle =
    cleanCopy(weather.bannerSubtitle) ||
    (weather.severity === "LIGHT_RAIN"
      ? "Delivery may take a little longer than usual"
      : weather.severity === "MODERATE_RAIN"
        ? "Rain may slightly increase delivery times"
        : weather.severity === "HEAVY_RAIN"
          ? "Deliveries may take longer than usual"
          : "");
  const temp =
    weather.temperatureC != null && Number.isFinite(weather.temperatureC)
      ? `${Math.round(weather.temperatureC)}°`
      : null;

  const body = (
    <LinearGradient
      colors={["#EFF6FC", "#E8F2FA"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.banner}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="rainy" size={30} color={RAIN_BLUE} />
      </View>
      <View style={styles.textCol}>
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {temp ? (
        <View style={styles.tempPill}>
          <Text style={styles.tempText}>{temp}</Text>
          <Ionicons name="rainy-outline" size={13} color={RAIN_BLUE} />
        </View>
      ) : null}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.wrap}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.wrap}>{body}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconWrap: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 16,
  },
  tempPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  tempText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
