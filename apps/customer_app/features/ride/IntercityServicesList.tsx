import { useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { ALL_SERVICES, RideServiceTileIcon, type ServiceId } from "./AllServicesGrid";
import {
  getIntercityRideOptions,
  INTERCITY_MIN_DISTANCE_KM,
  isIntercityRouteKm,
} from "@/lib/intercity-rides";
import { getRideFareQuoteBatch } from "@/services/rideQuote.service";
import { resolveRideQuotePayableAmount } from "@/lib/ride-quote-display";

type Props = {
  tripKm: number | null;
  pickupLat?: string | null;
  pickupLng?: string | null;
  dropLat?: string | null;
  dropLng?: string | null;
  servicesDisabled?: boolean;
  onSelectService: (id: ServiceId) => void;
  onChangeRoute: () => void;
};

export function IntercityServicesList({
  tripKm,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  servicesDisabled = false,
  onSelectService,
  onChangeRoute,
}: Props) {
  const routeReady = tripKm != null && tripKm > 0;
  const intercityEligible = isIntercityRouteKm(tripKm);
  const baseOptions = useMemo(() => getIntercityRideOptions(tripKm), [tripKm]);

  const [fareById, setFareById] = useState<Record<string, number>>({});
  const [faresLoading, setFaresLoading] = useState(false);

  const plat = Number(pickupLat);
  const plng = Number(pickupLng);
  const dlat = Number(dropLat);
  const dlng = Number(dropLng);
  const coordsReady =
    intercityEligible &&
    tripKm != null &&
    [plat, plng, dlat, dlng].every(Number.isFinite);

  useEffect(() => {
    if (!coordsReady || tripKm == null) {
      setFareById({});
      setFaresLoading(false);
      return;
    }

    const catalogCodes = baseOptions.map((o) => o.id);
    if (catalogCodes.length === 0) return;

    const abort = new AbortController();
    setFaresLoading(true);
    setFareById({});

    void (async () => {
      const result = await getRideFareQuoteBatch({
        pickupLat: plat,
        pickupLng: plng,
        dropLat: dlat,
        dropLng: dlng,
        tripKm,
        catalogCodes,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!result.ok) {
        setFaresLoading(false);
        return;
      }
      const next: Record<string, number> = {};
      for (const [code, quote] of Object.entries(result.quotes)) {
        const payable = resolveRideQuotePayableAmount(quote);
        if (payable > 0) next[code] = payable;
      }
      setFareById(next);
      setFaresLoading(false);
    })();

    return () => abort.abort();
  }, [coordsReady, tripKm, plat, plng, dlat, dlng, baseOptions]);

  if (!routeReady) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="map-outline" size={40} color={GatiMitraColors.textSecondary} />
        <AppText style={styles.emptyTitle}>Select your route</AppText>
        <AppText style={styles.emptySub}>
          Choose pickup and drop locations to see inter city cab options.
        </AppText>
        <TouchableOpacity style={styles.routeBtn} onPress={onChangeRoute} activeOpacity={0.85}>
          <AppText style={styles.routeBtnText}>Select locations</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <View style={styles.headTextCol}>
          <AppText style={styles.title}>Inter city rides</AppText>
          <AppText style={styles.subtitle}>
            {intercityEligible
              ? `${tripKm!.toFixed(1)} km trip · Cab options for longer routes`
              : `Trip under ${INTERCITY_MIN_DISTANCE_KM} km — use All services for nearby rides`}
          </AppText>
        </View>
        <TouchableOpacity style={styles.changeRouteBtn} onPress={onChangeRoute} activeOpacity={0.85}>
          <AppText style={styles.changeRouteText}>Change</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {baseOptions.map((row) => {
          const service = ALL_SERVICES.find((s) => s.id === row.id);
          const disabled = servicesDisabled || row.disabled;
          const estFare = fareById[row.id] ?? null;
          const showSpinner = intercityEligible && !disabled && faresLoading && estFare == null;
          const showFare = estFare != null && estFare > 0;

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
                  <RideServiceTileIcon assetKey={service.assetKey} iconPx={48} />
                ) : null}
              </View>
              <View style={styles.info}>
                <AppText style={[styles.label, disabled && styles.labelDisabled]}>{row.label}</AppText>
                <AppText style={styles.rowSub} numberOfLines={2}>
                  {row.subtitle}
                </AppText>
              </View>
              <View style={styles.fareCol}>
                {showFare ? (
                  <AppText style={[styles.fare, disabled && styles.labelDisabled]}>₹{estFare}</AppText>
                ) : showSpinner ? (
                  <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
                ) : disabled ? (
                  <AppText style={styles.soonBadge}>—</AppText>
                ) : (
                  <AppText style={styles.soonBadge}>—</AppText>
                )}
                {!disabled ? (
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                ) : null}
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
  },
  changeRouteBtn: {
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  changeRouteText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.primaryMint,
  },
  list: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  rowDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  info: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 2,
  },
  labelDisabled: {
    color: GatiMitraColors.textSecondary,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
  },
  fareCol: { alignItems: "flex-end", gap: 4, minWidth: 56 },
  fare: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  soonBadge: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  routeBtn: {
    marginTop: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  routeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
