import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { CustomerWeatherContext, WeatherSeverity } from "@/services/weather.service";

const BRAND = GatiMitraColors.splashMint;
const BRAND_DARK = "#0D9488";
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";

type Props = {
  visible: boolean;
  weather: CustomerWeatherContext | null | undefined;
  onClose: () => void;
};

function weatherEmoji(severity: WeatherSeverity): string {
  switch (severity) {
    case "EXTREME_WEATHER":
    case "HEAVY_RAIN":
      return "🌧";
    case "MODERATE_RAIN":
    case "LIGHT_RAIN":
      return "🌦";
    default:
      return "🌤";
  }
}

function heroGradient(severity: WeatherSeverity): [string, string, string] {
  switch (severity) {
    case "EXTREME_WEATHER":
    case "HEAVY_RAIN":
      return ["#1E3A5F", "#334155", "#475569"];
    case "MODERATE_RAIN":
    case "LIGHT_RAIN":
      return ["#0E7490", "#14B8A6", "#2DD4BF"];
    default:
      return ["#0D9488", "#14B8A6", "#5EEAD4"];
  }
}

function statusLabel(weather: CustomerWeatherContext): string {
  if (weather.chipLabel) {
    return weather.chipLabel.replace(/^[^\p{L}\p{N}]+/u, "").trim() || weather.weatherCondition;
  }
  if (weather.severity === "CLEAR") return "Clear Weather";
  return weather.weatherCondition;
}

export function WeatherDetailsSheet({ visible, weather, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!weather) return null;

  const temp =
    weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°` : "—°";
  const emoji = weatherEmoji(weather.severity);
  const gradient = heroGradient(weather.severity);

  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    bg: string;
  }> = [];

  if (weather.temperatureC != null) {
    metrics.push({
      key: "temp",
      label: "Temperature",
      value: `${Math.round(weather.temperatureC)}°C`,
      icon: "thermometer-outline",
      tint: "#EA580C",
      bg: "#FFF7ED",
    });
  }
  if (weather.humidityPct != null) {
    metrics.push({
      key: "humidity",
      label: "Humidity",
      value: `${Math.round(weather.humidityPct)}%`,
      icon: "water-outline",
      tint: "#2563EB",
      bg: "#EFF6FF",
    });
  }
  if (weather.windSpeedKmh != null) {
    metrics.push({
      key: "wind",
      label: "Wind",
      value: `${Math.round(weather.windSpeedKmh)} km/h`,
      icon: "flag-outline",
      tint: "#7C3AED",
      bg: "#F5F3FF",
    });
  }
  if (weather.rainDetected) {
    metrics.push({
      key: "rain",
      label: "Rain",
      value: `${weather.rainIntensityMm.toFixed(1)} mm/h`,
      icon: "rainy-outline",
      tint: "#0891B2",
      bg: "#ECFEFF",
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetWrap}>
          <TouchableOpacity
            style={styles.floatingClose}
            onPress={onClose}
            hitSlop={10}
            activeOpacity={0.9}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <View style={styles.handle} />

            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroDecorA} />
              <View style={styles.heroDecorB} />
              <Text style={styles.heroEmoji}>{emoji}</Text>
              <Text style={styles.heroTemp}>{temp}</Text>
              <Text style={styles.heroCondition}>{weather.weatherCondition}</Text>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{statusLabel(weather)}</Text>
              </View>
              {weather.areaLabel ? (
                <Text style={styles.heroArea} numberOfLines={1}>
                  {weather.areaLabel}
                </Text>
              ) : null}
            </LinearGradient>

            {weather.bannerSubtitle ? (
              <Text style={styles.bannerSubtitle}>{weather.bannerSubtitle}</Text>
            ) : null}

            {metrics.length > 0 ? (
              <View style={styles.metricsGrid}>
                {metrics.map((m) => (
                  <View key={m.key} style={[styles.metricCard, { backgroundColor: m.bg }]}>
                    <View style={[styles.metricIconWrap, { backgroundColor: "#FFFFFF" }]}>
                      <Ionicons name={m.icon} size={18} color={m.tint} />
                    </View>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    <Text style={styles.metricValue}>{m.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {weather.etaDelayMinutes > 0 ? (
              <View style={styles.etaBox}>
                <View style={styles.etaHeader}>
                  <Ionicons name="time-outline" size={18} color={BRAND_DARK} />
                  <Text style={styles.etaTitle}>Delivery impact</Text>
                </View>
                <Text style={styles.etaValue}>
                  +{weather.etaDelayMinutes} mins to estimated arrival
                </Text>
                {weather.etaImpactLabel ? (
                  <Text style={styles.etaHint}>{weather.etaImpactLabel}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.clearBox}>
                <Ionicons name="checkmark-circle" size={20} color={BRAND} />
                <Text style={styles.clearHint}>
                  No weather-related delivery delays right now.
                </Text>
              </View>
            )}

            {weather.updatedAt ? (
              <Text style={styles.updatedAt}>
                Updated {new Date(weather.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: "100%",
    alignItems: "center",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  hero: {
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  heroDecorA: {
    position: "absolute",
    top: -24,
    right: -10,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroDecorB: {
    position: "absolute",
    bottom: -20,
    left: 12,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  heroTemp: {
    fontSize: 44,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  heroCondition: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  heroPill: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroArea: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.8)",
    marginTop: 8,
    maxWidth: "100%",
  },
  bannerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_GRAY,
    lineHeight: 20,
    marginBottom: 14,
    textAlign: "center",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: TITLE_DARK,
    marginTop: 4,
  },
  etaBox: {
    backgroundColor: "#F0FDF9",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#99F6E4",
    marginBottom: 8,
  },
  etaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  etaTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BRAND_DARK,
  },
  etaValue: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  etaHint: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 4,
    lineHeight: 17,
  },
  clearBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF9",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    marginBottom: 8,
  },
  clearHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
    lineHeight: 18,
  },
  updatedAt: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: 4,
  },
});
