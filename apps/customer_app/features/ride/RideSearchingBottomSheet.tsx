import { useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Image, ImageSourcePropType, Platform, ScrollView } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { formatRideDistanceKm } from "@/lib/ride-route-snapshot";

type Props = {
  phase: "placing" | "searching" | "tip_boost" | "error";
  title: string;
  subtitle: string;
  elapsedLabel?: string;
  fare: number;
  rideImage: ImageSourcePropType | null;
  rideName: string;
  pickupLabel: string;
  dropLabel: string;
  tripKm?: number;
  pickupDistanceKm?: number | null;
  routeEtaMins?: number | null;
  nearbyRidersCount?: number;
  activeMitraSathiCount?: number;
  dispatchDeclinedCount?: number;
  showFastestTag?: boolean;
  placementError?: string | null;
  routeViaLabel?: string;
  onTripDetails?: () => void;
  onShareTrip?: () => void;
  shareTripEnabled?: boolean;
  onRetry?: () => void;
  onCancelRide?: () => void;
  showCancel: boolean;
  bottomInset?: number;
};

function truncateText(text: string, max = 34): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatKmValue(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km <= 0) return "—";
  return km < 10 ? km.toFixed(1) : String(Math.round(km * 10) / 10);
}

function formatEtaRange(tripKm?: number, routeEtaMins?: number | null): string {
  if (routeEtaMins != null && routeEtaMins > 0) {
    const max = routeEtaMins + 2;
    return `${routeEtaMins} – ${max} min`;
  }
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    const mins = Math.max(3, Math.round(tripKm * 2.2));
    return `${mins} – ${mins + 2} min`;
  }
  return "3 – 5 min";
}

const STRIPE_COUNT = 36;
const STRIPE_WIDTH = 7;

function AnimatedStripes() {
  const stripeOffset = useSharedValue(0);

  useEffect(() => {
    stripeOffset.value = withRepeat(
      withTiming(STRIPE_WIDTH * 2, { duration: 700, easing: Easing.linear }),
      -1,
      false
    );
  }, [stripeOffset]);

  const stripeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: "24deg" }, { translateX: stripeOffset.value }],
  }));

  return (
    <Animated.View style={[styles.stripeLayer, stripeAnimStyle]}>
      {Array.from({ length: STRIPE_COUNT }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.stripeSegment,
            index % 2 === 0 ? styles.stripeSegmentLight : styles.stripeSegmentDark,
          ]}
        />
      ))}
    </Animated.View>
  );
}

function SearchDispatchTimeline({
  activeMitraSathiCount,
  dispatchDeclinedCount,
}: {
  activeMitraSathiCount: number;
  dispatchDeclinedCount: number;
}) {
  const declined = Math.max(0, dispatchDeclinedCount);
  const total = Math.max(0, activeMitraSathiCount);
  const fillRatio =
    total > 0 ? Math.max(0, Math.min(1, declined / total)) : declined > 0 ? 1 : 0;
  const isFull = fillRatio >= 0.995;
  const hasActiveSupply = total > 0;

  return (
    <View style={styles.dispatchBlock}>
      <AppText style={styles.dispatchLabel} numberOfLines={2}>
        {!hasActiveSupply
          ? "Searching nearby GMitra Saathi…"
          : `${declined} of ${total} GMitra Saathi didn't accept your ride`}
      </AppText>

      <View style={styles.progressTrack}>
        {fillRatio > 0 ? (
          <View
            style={[
              styles.progressFillWrap,
              { flex: fillRatio },
              isFull ? styles.progressFillWrapFull : null,
            ]}
          >
            <LinearGradient
              colors={["#047857", "#059669", "#10B981"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.stripeMask}>
              <AnimatedStripes />
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 - fillRatio }} />
      </View>
    </View>
  );
}

export function RideSearchingBottomSheet({
  phase,
  title,
  subtitle,
  elapsedLabel,
  fare,
  rideImage,
  rideName,
  pickupLabel,
  dropLabel,
  tripKm,
  pickupDistanceKm,
  routeEtaMins,
  nearbyRidersCount = 0,
  activeMitraSathiCount,
  dispatchDeclinedCount = 0,
  showFastestTag = false,
  placementError,
  routeViaLabel = "Optimized",
  onTripDetails,
  onShareTrip,
  shareTripEnabled = true,
  onRetry,
  onCancelRide,
  showCancel,
  bottomInset = 0,
}: Props) {
  const isError = phase === "error";
  const rideKm = tripKm ?? null;
  const pickupKm = pickupDistanceKm ?? 0;
  const totalKm =
    rideKm != null && pickupKm > 0 ? Math.round((rideKm + pickupKm) * 10) / 10 : rideKm;
  const mitraSathiPool = activeMitraSathiCount ?? nearbyRidersCount;

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(8, bottomInset) }]}>
      <View style={styles.handle} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        <View style={styles.headerRow}>
          <View style={styles.searchIconOuter}>
            <View style={styles.searchIconBox}>
              <Ionicons name="search" size={20} color="#059669" />
            </View>
          </View>

          <View style={styles.headerTextCol}>
            <AppText style={styles.title} numberOfLines={2}>
              {isError ? title : "Finding your rider…"}
            </AppText>
            <AppText style={styles.subtitle} numberOfLines={2}>
              {isError && placementError ? placementError : subtitle}
            </AppText>
          </View>

          {!isError && elapsedLabel ? (
            <View style={styles.elapsedBadge}>
              <AppText style={styles.elapsedText}>{elapsedLabel}</AppText>
            </View>
          ) : null}
        </View>

        {isError ? (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.9}>
            <AppText style={styles.retryBtnText}>Go back</AppText>
          </TouchableOpacity>
        ) : (
          <>
            <SearchDispatchTimeline
              activeMitraSathiCount={mitraSathiPool}
              dispatchDeclinedCount={dispatchDeclinedCount}
            />

            <View style={styles.summaryCard}>
              {rideImage ? (
                <Image source={rideImage} style={styles.rideImage} resizeMode="contain" />
              ) : null}

              <View style={styles.summaryCenter}>
                <View style={styles.rideNameRow}>
                  <AppText style={styles.rideName}>{rideName}</AppText>
                  {showFastestTag ? (
                    <View style={styles.fastestTag}>
                      <AppText style={styles.fastestText}>FASTEST</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText style={styles.fareAmount}>₹{Number.isFinite(fare) ? fare : "—"}</AppText>
                <View style={styles.inclusiveTag}>
                  <AppText style={styles.inclusiveText}>Inclusive of all charges</AppText>
                </View>
              </View>

              <View style={styles.summaryMeta}>
                <View style={styles.metaLine}>
                  <AppText style={styles.metaKey}>Pickup distance:</AppText>
                  <AppText style={styles.metaVal}>{formatKmValue(pickupKm)} km</AppText>
                </View>
                <View style={styles.metaLine}>
                  <AppText style={styles.metaKey}>Ride distance:</AppText>
                  <AppText style={styles.metaVal}>{formatRideDistanceKm(rideKm) ?? "—"}</AppText>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaLine}>
                  <AppText style={styles.metaKey}>Estimated time:</AppText>
                  <AppText style={[styles.metaVal, styles.metaValGreen]}>
                    {formatEtaRange(rideKm ?? undefined, routeEtaMins)}
                  </AppText>
                </View>
                <View style={styles.metaLine}>
                  <AppText style={styles.metaKey}>Total distance:</AppText>
                  <AppText style={[styles.metaVal, styles.metaValBold]}>
                    {totalKm != null ? `${formatKmValue(totalKm)} km` : "—"}
                  </AppText>
                </View>
              </View>
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeLeftCol}>
                <View style={styles.routeStepper}>
                  <View style={styles.routeDotGreen} />
                  <View style={styles.routeStepLine} />
                  <View style={styles.routeDotRed} />
                </View>
                <View style={styles.routeAddrCol}>
                  <View style={styles.routeStopBlock}>
                    <AppText style={styles.routeStopLabel}>Pickup</AppText>
                    <AppText style={styles.routeStopAddr} numberOfLines={2}>
                      {truncateText(pickupLabel, 48)}
                    </AppText>
                  </View>
                  <View style={styles.routeStopBlock}>
                    <AppText style={styles.routeStopLabel}>Drop</AppText>
                    <AppText style={styles.routeStopAddr} numberOfLines={2}>
                      {truncateText(dropLabel, 48)}
                    </AppText>
                  </View>
                </View>
              </View>

              <View style={styles.routeDivider} />

              <View style={styles.routeMetricCol}>
                <Ionicons name="trail-sign-outline" size={18} color="#94A3B8" />
                <AppText style={styles.routeMetricLabel}>Route distance</AppText>
                <AppText style={styles.routeMetricValue}>
                  {rideKm != null ? `${formatKmValue(rideKm)} km` : "—"}
                </AppText>
              </View>

              <View style={styles.routeDivider} />

              <View style={styles.routeMetricCol}>
                <Ionicons name="git-network-outline" size={18} color="#94A3B8" />
                <AppText style={styles.routeMetricLabel}>Via</AppText>
                <AppText style={styles.routeMetricValue} numberOfLines={2}>
                  {routeViaLabel}
                </AppText>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, !shareTripEnabled && styles.actionBtnDisabled]}
                onPress={onShareTrip}
                activeOpacity={0.85}
                disabled={!shareTripEnabled || !onShareTrip}
              >
                <Ionicons name="share-social-outline" size={16} color="#111827" />
                <AppText style={styles.actionBtnText}>Share Trip</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onTripDetails}
                activeOpacity={0.85}
                disabled={!onTripDetails}
              >
                <Ionicons name="receipt-outline" size={16} color="#111827" />
                <AppText style={styles.actionBtnText}>Trip Details</AppText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {showCancel ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancelRide} activeOpacity={0.9}>
            <View style={styles.cancelIconCircle}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.cancelTextCol}>
              <AppText style={styles.cancelTitle}>Cancel Ride</AppText>
              <AppText style={styles.cancelSub}>Free cancellation before rider accepts</AppText>
            </View>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const sheetShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  android: { elevation: 14 },
  default: {},
});

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -18,
    ...sheetShadow,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 10,
    marginBottom: 12,
  },
  scroll: {},
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  searchIconOuter: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 22,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 17,
  },
  elapsedBadge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginTop: 2,
  },
  elapsedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  dispatchBlock: {
    marginBottom: 14,
    gap: 10,
  },
  dispatchLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B1F44",
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E8F5EE",
    overflow: "hidden",
    flexDirection: "row",
  },
  progressFillWrap: {
    height: "100%",
    overflow: "hidden",
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    minWidth: 10,
  },
  progressFillWrapFull: {
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  stripeMask: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  stripeLayer: {
    position: "absolute",
    top: -12,
    bottom: -12,
    left: -24,
    flexDirection: "row",
  },
  stripeSegment: {
    width: STRIPE_WIDTH,
    height: "160%",
  },
  stripeSegmentLight: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  stripeSegmentDark: {
    backgroundColor: "transparent",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  rideImage: {
    width: 56,
    height: 56,
    marginTop: 2,
  },
  summaryCenter: {
    minWidth: 88,
    flexShrink: 0,
  },
  rideNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  rideName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  fastestTag: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fastestText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#059669",
  },
  fareAmount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  inclusiveTag: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  inclusiveText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#2563EB",
  },
  summaryMeta: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  metaLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  metaKey: {
    fontSize: 10,
    color: "#94A3B8",
    flex: 1,
  },
  metaVal: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  metaValGreen: {
    color: "#059669",
  },
  metaValBold: {
    fontWeight: "800",
    color: "#0F172A",
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginVertical: 2,
  },
  routeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
  },
  routeLeftCol: {
    flex: 1.35,
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  routeStepper: {
    alignItems: "center",
    paddingTop: 14,
    width: 10,
  },
  routeStepLine: {
    width: 2,
    height: 22,
    backgroundColor: "#CBD5E1",
    marginVertical: 3,
  },
  routeAddrCol: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  routeStopBlock: {
    gap: 2,
  },
  routeStopLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
  },
  routeStopAddr: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 15,
  },
  routeDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
  },
  routeMetricCol: {
    width: 72,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingTop: 2,
  },
  routeMetricLabel: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "600",
    textAlign: "center",
  },
  routeMetricValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    lineHeight: 15,
  },
  routeDotGreen: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  routeDotRed: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  cancelIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTextCol: {
    flex: 1,
  },
  cancelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#DC2626",
  },
  cancelSub: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    marginBottom: 14,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
});
