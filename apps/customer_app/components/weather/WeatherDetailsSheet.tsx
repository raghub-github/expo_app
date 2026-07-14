import { memo, useMemo } from "react";
import { Modal, View, Pressable, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CustomerWeatherContext } from "@/services/weather.service";
import { buildWeatherPanelModel, type WeatherMetricCard, type WeatherPanelModel } from "@/lib/weatherPanelModel";
import { WeatherPanelAnimations } from "./WeatherPanelAnimations";
import { AppText } from "@/components/AppText";

const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";

type Props = {
  visible: boolean;
  weather: CustomerWeatherContext | null | undefined;
  onClose: () => void;
};

const BADGE_STYLES: Record<
  WeatherPanelModel["badgeVariant"],
  { bg: string; border: string; text: string }
> = {
  neutral: { bg: "rgba(255,255,255,0.22)", border: "rgba(255,255,255,0.35)", text: "#FFFFFF" },
  success: { bg: "rgba(16,185,129,0.28)", border: "rgba(167,243,208,0.5)", text: "#FFFFFF" },
  info: { bg: "rgba(56,189,248,0.28)", border: "rgba(186,230,253,0.5)", text: "#FFFFFF" },
  warning: { bg: "rgba(251,191,36,0.32)", border: "rgba(254,243,199,0.55)", text: "#FFFFFF" },
  danger: { bg: "rgba(239,68,68,0.35)", border: "rgba(254,202,202,0.55)", text: "#FFFFFF" },
};

const MetricCard = memo(function MetricCard({ metric }: { metric: WeatherMetricCard }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: metric.bg }]}>
      <View style={styles.metricIconWrap}>
        <Ionicons name={metric.icon as keyof typeof Ionicons.glyphMap} size={18} color={metric.tint} />
      </View>
      <AppText style={styles.metricLabel}>{metric.label}</AppText>
      <AppText style={styles.metricValue} numberOfLines={2}>
        {metric.value}
      </AppText>
    </View>
  );
});

const AdvisoryList = memo(function AdvisoryList({
  title,
  icon,
  items,
  tint,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: string[];
  tint: string;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.advisoryBox}>
      <View style={styles.advisoryHeader}>
        <Ionicons name={icon} size={17} color={tint} />
        <AppText style={styles.advisoryTitle}>{title}</AppText>
      </View>
      {items.map((line) => (
        <View key={line} style={styles.advisoryRow}>
          <View style={[styles.advisoryDot, { backgroundColor: tint }]} />
          <AppText style={styles.advisoryText}>{line}</AppText>
        </View>
      ))}
    </View>
  );
});

function WeatherDetailsSheetInner({ visible, weather, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const panel = useMemo(() => (weather ? buildWeatherPanelModel(weather) : null), [
    weather?.updatedAt,
    weather?.temperatureC,
    weather?.severity,
    weather?.rainDetected,
    weather?.rainIntensityMm,
    weather?.windSpeedKmh,
    weather?.weatherCondition,
    weather?.details?.weatherId,
    weather?.details?.cloudCoverPct,
    weather?.etaDelayMinutes,
  ]);

  if (!weather || !panel) return null;

  const temp =
    weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°` : "—°";
  const badgeStyle = BADGE_STYLES[panel.badgeVariant];
  const conditionLabel =
    weather.details?.weatherDescription?.replace(/\b\w/g, (c) => c.toUpperCase()) ??
    panel.title;

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

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.scrollContent}
            >
              <LinearGradient
                key={panel.cacheKey}
                colors={panel.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <WeatherPanelAnimations animation={panel.animation} />
                <View style={styles.heroDecorA} />
                <View style={styles.heroDecorB} />
                <AppText style={styles.heroEmoji}>{panel.heroIcon}</AppText>
                <AppText style={styles.heroTemp}>{temp}</AppText>
                <AppText style={styles.heroCondition}>{conditionLabel}</AppText>
                <View
                  style={[
                    styles.heroPill,
                    { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border },
                  ]}
                >
                  <AppText style={[styles.heroPillText, { color: badgeStyle.text }]}>
                    {panel.badgeLabel}
                  </AppText>
                </View>
                {weather.areaLabel ? (
                  <AppText style={styles.heroArea} numberOfLines={1}>
                    {weather.areaLabel}
                  </AppText>
                ) : null}
              </LinearGradient>

              <AppText style={styles.heroMessage}>{panel.heroMessage}</AppText>

              {panel.metrics.length > 0 ? (
                <View style={styles.metricsGrid}>
                  {panel.metrics.map((m) => (
                    <MetricCard key={m.key} metric={m} />
                  ))}
                </View>
              ) : null}

              <View
                style={[
                  styles.impactBox,
                  {
                    backgroundColor: panel.deliveryImpact.bg,
                    borderColor: panel.deliveryImpact.border,
                  },
                ]}
              >
                <View style={styles.impactHeader}>
                  <AppText style={styles.impactIcon}>{panel.deliveryImpact.icon}</AppText>
                  <AppText style={[styles.impactTitle, { color: panel.deliveryImpact.color }]}>
                    {panel.deliveryImpact.label}
                  </AppText>
                </View>
                {weather.etaDelayMinutes > 0 ? (
                  <AppText style={styles.impactDetail}>
                    Estimated +{weather.etaDelayMinutes} min delivery time
                  </AppText>
                ) : panel.deliveryImpact.level === "normal" ? (
                  <AppText style={styles.impactDetail}>No weather-related delivery delays right now.</AppText>
                ) : null}
              </View>

              <AdvisoryList
                title="Customer advisory"
                icon="bag-handle-outline"
                items={panel.customerAdvisory}
                tint="#2563EB"
              />

              {weather.updatedAt ? (
                <AppText style={styles.updatedAt}>
                  Updated{" "}
                  {new Date(weather.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </AppText>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const WeatherDetailsSheet = memo(WeatherDetailsSheetInner);

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
    maxHeight: "92%",
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
    maxHeight: "100%",
  },
  scrollContent: {
    paddingBottom: 8,
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
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 14,
    minHeight: 200,
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
    fontSize: 40,
    marginBottom: 6,
    zIndex: 2,
  },
  heroTemp: {
    fontSize: 48,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1,
    zIndex: 2,
  },
  heroCondition: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
    zIndex: 2,
  },
  heroPill: {
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    zIndex: 2,
  },
  heroPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  heroArea: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.8)",
    marginTop: 8,
    maxWidth: "100%",
    zIndex: 2,
  },
  heroMessage: {
    fontSize: 15,
    fontWeight: "600",
    color: TITLE_DARK,
    lineHeight: 22,
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
    backgroundColor: "#FFFFFF",
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
    fontSize: 17,
    fontWeight: "800",
    color: TITLE_DARK,
    marginTop: 4,
  },
  impactBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  impactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  impactIcon: {
    fontSize: 16,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  impactDetail: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginTop: 6,
    lineHeight: 18,
  },
  advisoryBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 10,
  },
  advisoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  advisoryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: TITLE_DARK,
  },
  advisoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
  },
  advisoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  advisoryText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_GRAY,
    lineHeight: 18,
  },
  updatedAt: {
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 4,
  },
});
