import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { CustomerWeatherContext } from "@/services/weather.service";
import { GatiCashHeaderPill } from "@/components/home/GatiCashHeaderPill";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
/** Same content width as header row (pin → action icons). */
const CONTENT_W = SCREEN_W - PAD * 2;

const TITLE_DARK = "#111827";
const TEXT_MUTED = "#6B7280";
const WEATHER_BORDER = "rgba(0, 0, 0, 0.035)";
const ICON_BORDER = "rgba(0, 0, 0, 0.04)";
const GREEN = GatiMitraColors.splashMint;
const GREEN_TEXT = "#15803D";

const WEATHER_SHADOW = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.035,
  shadowRadius: 4,
  elevation: 1,
};

type Props = {
  locationPrimary: string;
  locationSecondary: string;
  weather: CustomerWeatherContext | null | undefined;
  notificationBadgeCount?: number;
  onLocationPress: () => void;
  onNotificationPress: () => void;
  onWeatherPress: () => void;
};

function weatherEmoji(severity: CustomerWeatherContext["severity"]): string {
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

function shortWeatherLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "Cloudy";

  const condition = trimmed.replace(/\s+weather$/i, "").trim() || trimmed;
  const key = condition.toLowerCase();

  const SHORT: Record<string, string> = {
    clouds: "Cloudy",
    cloud: "Cloudy",
    clear: "Clear",
    rain: "Rainy",
    drizzle: "Drizzle",
    thunderstorm: "Stormy",
    snow: "Snowy",
    mist: "Misty",
    fog: "Foggy",
    haze: "Hazy",
    smoke: "Smoky",
    dust: "Dusty",
    wind: "Windy",
    squall: "Windy",
    tornado: "Stormy",
  };

  if (SHORT[key]) return SHORT[key];
  if (key.endsWith("s") && SHORT[key.slice(0, -1)]) return SHORT[key.slice(0, -1)]!;

  const first = condition.split(/\s+/)[0] ?? condition;
  if (first.length <= 8) return first;
  return `${first.slice(0, 7)}…`;
}

function weatherHeadline(weather: CustomerWeatherContext): { temp: string; label: string } {
  const temp = `${Math.round(weather.temperatureC!)}°`;
  if (weather.severity === "CLEAR") {
    const cond = weather.weatherCondition?.trim() || "Clear";
    const longLabel = cond.toLowerCase() === "clear" ? "Clear Weather" : `${cond} Weather`;
    return { temp, label: shortWeatherLabel(longLabel) };
  }
  const fromChip = weather.chipLabel?.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const longLabel = fromChip || weather.weatherCondition || "Weather update";
  return { temp, label: shortWeatherLabel(longLabel) };
}

function weatherPromo(weather: CustomerWeatherContext): string {
  if (weather.bannerSubtitle?.trim()) return weather.bannerSubtitle.trim();
  if (weather.severity === "CLEAR") return "Great day for delivery!";
  if (weather.etaDelayMinutes > 0) {
    return `Delivery may take ~${weather.etaDelayMinutes} min longer`;
  }
  return "Check weather details";
}

function hasLiveTemperature(weather: CustomerWeatherContext | null | undefined): weather is CustomerWeatherContext {
  return weather != null && weather.temperatureC != null && Number.isFinite(weather.temperatureC);
}

export function HomeLocationHeader({
  locationPrimary,
  locationSecondary,
  notificationBadgeCount,
  onLocationPress,
  onNotificationPress,
}: Pick<
  Props,
  | "locationPrimary"
  | "locationSecondary"
  | "notificationBadgeCount"
  | "onLocationPress"
  | "onNotificationPress"
>) {
  const showBadge = notificationBadgeCount != null && notificationBadgeCount > 0;

  return (
    <View style={styles.headerBlock}>
      <View style={[styles.topRow, { paddingTop: STATUS_BAR_TO_HEADER_GAP }]}>
        <TouchableOpacity style={styles.locationBlock} activeOpacity={0.82} onPress={onLocationPress}>
          <View style={styles.locationPinCircle}>
            <Ionicons name="location" size={17} color="#FFFFFF" />
          </View>

          <View style={styles.locationTextBlock}>
            <View style={styles.locationTitleRow}>
              <Text style={styles.locationPrimary} numberOfLines={1} ellipsizeMode="tail">
                {locationPrimary}
              </Text>
              <Ionicons name="chevron-down" size={15} color={TITLE_DARK} style={styles.locationChevron} />
            </View>
            <View style={styles.locationSecondaryRow}>
              <View style={styles.stateDot} />
              <Text style={styles.locationSecondary} numberOfLines={1} ellipsizeMode="tail">
                {locationSecondary}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerIcons}>
          <GatiCashHeaderPill />
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.75}
            onPress={onNotificationPress}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={18} color={TITLE_DARK} />
            {showBadge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationBadgeCount! > 9 ? "9+" : notificationBadgeCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function HomeWeatherBanner({
  weather,
  onWeatherPress,
  loading = false,
}: Pick<Props, "weather" | "onWeatherPress"> & { loading?: boolean }) {
  const showWeather = hasLiveTemperature(weather);
  const headline = showWeather ? weatherHeadline(weather) : null;
  const promo = showWeather ? weatherPromo(weather) : null;
  const severity = weather?.severity ?? "CLEAR";

  if (showWeather && headline && promo) {
    return (
      <View style={styles.weatherShell}>
        <View style={styles.weatherWrap}>
        <TouchableOpacity
          style={styles.weatherBanner}
          activeOpacity={0.88}
          onPress={onWeatherPress}
          accessibilityRole="button"
        >
          <View style={styles.weatherLeft}>
            <Text style={styles.weatherIcon}>{weatherEmoji(severity)}</Text>
            <Text style={styles.weatherTemp}>{headline.temp}</Text>
            <Text style={styles.weatherLabel} numberOfLines={1}>
              {headline.label}
            </Text>
          </View>

          <View style={styles.weatherDivider} />

          <View style={styles.weatherRight}>
            <Text style={styles.weatherPromo}>{promo}</Text>
            <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
          </View>
        </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!loading) return null;

  return (
    <View style={styles.weatherShell}>
      <View style={styles.weatherWrap}>
        <View style={[styles.weatherBanner, styles.weatherSkeleton]} accessibilityLabel="Loading weather">
          <View style={styles.weatherLeft}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonTemp} />
            <View style={styles.skeletonLabel} />
          </View>
          <View style={styles.weatherDivider} />
          <View style={styles.weatherRight}>
            <View style={styles.skeletonPromo} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function HomeScreenHeader({
  locationPrimary,
  locationSecondary,
  weather,
  notificationBadgeCount,
  onLocationPress,
  onNotificationPress,
  onWeatherPress,
}: Props) {
  return (
    <View style={styles.wrap}>
      <HomeLocationHeader
        locationPrimary={locationPrimary}
        locationSecondary={locationSecondary}
        notificationBadgeCount={notificationBadgeCount}
        onLocationPress={onLocationPress}
        onNotificationPress={onNotificationPress}
      />
      <HomeWeatherBanner weather={weather} onWeatherPress={onWeatherPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  headerBlock: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: PAD,
    paddingBottom: 8,
    zIndex: 10,
  },
  weatherShell: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  weatherWrap: {
    width: "100%",
    paddingHorizontal: PAD,
    paddingTop: 2,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  locationPinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: GREEN,
  },
  locationTextBlock: {
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  locationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    minWidth: 0,
  },
  locationPrimary: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_DARK,
    letterSpacing: -0.35,
  },
  locationChevron: {
    marginLeft: 3,
    flexShrink: 0,
  },
  locationSecondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    minWidth: 0,
  },
  stateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GREEN,
    marginRight: 5,
  },
  locationSecondary: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    color: GREEN_TEXT,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  weatherBanner: {
    alignSelf: "flex-start",
    maxWidth: CONTENT_W,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WEATHER_BORDER,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    ...WEATHER_SHADOW,
  },
  weatherLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  weatherIcon: {
    fontSize: 19,
    lineHeight: 22,
    marginRight: 5,
  },
  weatherTemp: {
    fontSize: 16,
    fontWeight: "800",
    color: TITLE_DARK,
    marginRight: 6,
    letterSpacing: -0.4,
    flexShrink: 0,
  },
  weatherLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TITLE_DARK,
    flexShrink: 0,
  },
  weatherDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
    flexShrink: 0,
  },
  weatherRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  weatherPromo: {
    fontSize: 11,
    fontWeight: "500",
    color: TITLE_DARK,
    marginRight: 4,
    flexShrink: 0,
  },
  weatherSkeleton: {
    opacity: 0.55,
  },
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    marginRight: 5,
  },
  skeletonTemp: {
    width: 28,
    height: 14,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    marginRight: 6,
  },
  skeletonLabel: {
    width: 44,
    height: 11,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
  },
  skeletonPromo: {
    width: 120,
    height: 11,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    marginRight: 4,
  },
});
