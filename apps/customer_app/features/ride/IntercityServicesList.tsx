import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { ALL_SERVICES, type ServiceId } from "./AllServicesGrid";
import {
  getIntercityRideOptions,
  INTERCITY_MIN_DISTANCE_KM,
  isIntercityRouteKm,
} from "@/lib/intercity-rides";

type Props = {
  tripKm: number | null;
  servicesDisabled?: boolean;
  onSelectService: (id: ServiceId) => void;
  onChangeRoute: () => void;
};

export function IntercityServicesList({
  tripKm,
  servicesDisabled = false,
  onSelectService,
  onChangeRoute,
}: Props) {
  const routeReady = tripKm != null && tripKm > 0;
  const intercityEligible = isIntercityRouteKm(tripKm);
  const options = getIntercityRideOptions(tripKm);

  if (!routeReady) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="map-outline" size={40} color={GatiMitraColors.textSecondary} />
        <Text style={styles.emptyTitle}>Select your route</Text>
        <Text style={styles.emptySub}>
          Choose pickup and drop locations to see inter city cab options.
        </Text>
        <TouchableOpacity style={styles.routeBtn} onPress={onChangeRoute} activeOpacity={0.85}>
          <Text style={styles.routeBtnText}>Select locations</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <View style={styles.headTextCol}>
          <Text style={styles.title}>Inter city rides</Text>
          <Text style={styles.subtitle}>
            {intercityEligible
              ? `${tripKm!.toFixed(1)} km trip · Cab options for longer routes`
              : `Trip under ${INTERCITY_MIN_DISTANCE_KM} km — use All services for nearby rides`}
          </Text>
        </View>
        <TouchableOpacity style={styles.changeRouteBtn} onPress={onChangeRoute} activeOpacity={0.85}>
          <Text style={styles.changeRouteText}>Change</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {options.map((row) => {
          const service = ALL_SERVICES.find((s) => s.id === row.id);
          const disabled = servicesDisabled || row.disabled;
          return (
            <TouchableOpacity
              key={row.id}
              style={[styles.row, disabled && styles.rowDisabled]}
              onPress={() => {
                if (disabled) return;
                onSelectService(row.id);
              }}
              disabled={disabled}
              activeOpacity={disabled ? 1 : 0.85}
            >
              <View style={styles.iconWrap}>
                {service ? (
                  <Image source={service.image} style={styles.icon} resizeMode="contain" />
                ) : null}
              </View>
              <View style={styles.info}>
                <Text style={[styles.label, disabled && styles.labelDisabled]}>{row.label}</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  {row.subtitle}
                </Text>
              </View>
              <View style={styles.fareCol}>
                {row.estFare != null && row.estFare > 0 ? (
                  <Text style={[styles.fare, disabled && styles.labelDisabled]}>₹{row.estFare}</Text>
                ) : (
                  <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
                )}
                {!disabled ? (
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                ) : (
                  <Text style={styles.soonBadge}>N/A</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: 18 },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  headTextCol: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
  },
  changeRouteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
  },
  changeRouteText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  list: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 12,
  },
  rowDisabled: { opacity: 0.55 },
  iconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 52, height: 52 },
  info: { flex: 1, minWidth: 0 },
  label: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  labelDisabled: { color: GatiMitraColors.textSecondary },
  rowSub: { marginTop: 2, fontSize: 12, color: GatiMitraColors.textSecondary },
  fareCol: { alignItems: "flex-end", gap: 4 },
  fare: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  soonBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  routeBtn: {
    marginTop: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  routeBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
