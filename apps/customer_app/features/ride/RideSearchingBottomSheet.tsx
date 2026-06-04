import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageSourcePropType,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  phase: "placing" | "searching" | "tip_boost" | "error";
  title: string;
  subtitle: string;
  countdownLabel?: string;
  progress: number;
  fare: number;
  rideImage: ImageSourcePropType;
  pickupLabel: string;
  tripKm?: number;
  placementError?: string | null;
  onTripDetails: () => void;
  onRetry?: () => void;
  onCancelRide?: () => void;
  showCancel: boolean;
  bottomInset?: number;
};

function truncatePickup(text: string, max = 28): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatEta(tripKm?: number): string {
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    const mins = Math.max(3, Math.round(tripKm * 2.2));
    const maxMins = mins + 2;
    return `${mins}-${maxMins} min`;
  }
  return "3-5 min";
}

function formatDistance(tripKm?: number): string {
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    return `${tripKm.toFixed(1)} km`;
  }
  return "—";
}

function TrustBadge({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.trustItem}>
      <View style={[styles.trustIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.trustLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function RideSearchingBottomSheet({
  phase,
  title,
  subtitle,
  countdownLabel,
  progress,
  fare,
  rideImage,
  pickupLabel,
  tripKm,
  placementError,
  onTripDetails,
  onRetry,
  onCancelRide,
  showCancel,
  bottomInset = 0,
}: Props) {
  const isError = phase === "error";

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 8) }]}>
      <View style={styles.handle} />

      <View style={styles.headerRow}>
        <View style={styles.searchIconOuter}>
          <View style={styles.searchIconRadar} pointerEvents="none">
            <View style={[styles.searchRadarDot, { top: 4, left: 8 }]} />
            <View style={[styles.searchRadarDot, { top: 2, right: 6 }]} />
            <View style={[styles.searchRadarDot, { bottom: 6, left: 14 }]} />
          </View>
          <View style={styles.searchIconBox}>
            <Ionicons name="search" size={22} color="#0D9488" />
          </View>
        </View>

        <View style={styles.headerTextCol}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {!isError && countdownLabel ? (
            <Text style={styles.countdown}>
              Searching for <Text style={styles.countdownBold}>{countdownLabel}</Text>
            </Text>
          ) : isError && placementError ? (
            <Text style={styles.errorText}>{placementError}</Text>
          ) : (
            <Text style={styles.countdown}>{subtitle}</Text>
          )}
        </View>

        {!isError ? (
          <TouchableOpacity style={styles.tripDetailsBtn} onPress={onTripDetails} activeOpacity={0.85}>
            <Text style={styles.tripDetailsText}>Trip Details</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!isError ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
          </View>
          <Text style={styles.waitHint}>Please wait while we match you with a nearby rider.</Text>
        </>
      ) : (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.9}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </TouchableOpacity>
      )}

      <View style={styles.tripCard}>
        <Image source={rideImage} style={styles.rideImage} resizeMode="contain" />

        <View style={styles.tripCardCenter}>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareAmount}>₹{Number.isFinite(fare) ? fare : "—"}</Text>
          <View style={styles.cashTag}>
            <Ionicons name="cash-outline" size={13} color="#059669" />
            <Text style={styles.cashTagText}>Cash</Text>
          </View>
        </View>

        <View style={styles.tripMetaCol}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={15} color="#64748B" />
            <View style={styles.metaTextCol}>
              <Text style={styles.metaLabel}>Estimated time</Text>
              <Text style={styles.metaValue}>{formatEta(tripKm)}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="navigate-outline" size={15} color="#64748B" />
            <View style={styles.metaTextCol}>
              <Text style={styles.metaLabel}>Distance</Text>
              <Text style={styles.metaValue}>{formatDistance(tripKm)}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color="#64748B" />
            <View style={styles.metaTextCol}>
              <Text style={styles.metaLabel}>Pickup</Text>
              <Text style={styles.metaValue} numberOfLines={2}>
                {truncatePickup(pickupLabel)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.trustRow}>
        <TrustBadge icon="shield-checkmark-outline" label="Verified riders" color="#059669" />
        <View style={styles.trustDivider} />
        <TrustBadge icon="radio-outline" label="Nearby search" color="#2563EB" />
        <View style={styles.trustDivider} />
        <TrustBadge icon="flash-outline" label="Best match" color="#2563EB" />
        <View style={styles.trustDivider} />
        <TrustBadge icon="people-outline" label="Safe & secure" color="#059669" />
      </View>

      <View style={styles.dashedDivider} />

      {showCancel ? (
        <TouchableOpacity style={styles.cancelRow} onPress={onCancelRide} activeOpacity={0.85}>
          <View style={styles.cancelIconCircle}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.cancelTextCol}>
            <Text style={styles.cancelTitle}>Cancel ride</Text>
            <Text style={styles.cancelSub}>You can cancel anytime</Text>
          </View>
        </TouchableOpacity>
      ) : null}
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
    marginTop: -20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    ...sheetShadow,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  searchIconOuter: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconRadar: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRadarDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#93C5FD",
    opacity: 0.7,
  },
  searchIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
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
    color: "#1E3A5F",
    lineHeight: 22,
    marginBottom: 4,
  },
  countdown: {
    fontSize: 13,
    color: "#64748B",
  },
  countdownBold: {
    fontWeight: "800",
    color: "#0F172A",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    lineHeight: 18,
  },
  tripDetailsBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    marginTop: 2,
  },
  tripDetailsText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  waitHint: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 14,
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
  tripCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0F9FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0F2FE",
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  rideImage: {
    width: 52,
    height: 52,
    marginTop: 4,
  },
  tripCardCenter: {
    minWidth: 72,
  },
  fareLabel: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 2,
  },
  fareAmount: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  cashTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cashTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  tripMetaCol: {
    flex: 1,
    gap: 8,
    paddingTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  metaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 10,
    color: "#94A3B8",
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    lineHeight: 16,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  trustItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  trustIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  trustLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    lineHeight: 12,
  },
  trustDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E2E8F0",
    marginTop: 4,
  },
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    marginBottom: 12,
  },
  cancelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 6,
  },
  cancelIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTextCol: {
    alignItems: "flex-start",
  },
  cancelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#DC2626",
  },
  cancelSub: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
});
