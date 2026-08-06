/**
 * Parcel book (inner) screen — map + vehicle sheet after pickup & drop are set.
 * Vehicles from parcel category assignments; fares from geo parcel_customer_pricing slabs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { RideBookMap } from "@/components/maps/RideBookMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { RideRouteMapPillOverlay } from "@/features/ride/RideRouteMapPillOverlay";
import {
  rideMapFitPadding,
  rideMapFitMaxZoom,
  endpointsBoundsFitPoints,
  routeBoundsFitPoints,
  RIDE_BOOK_SHEET_HEIGHT_RATIO,
  type InwardBias,
} from "@/features/ride/ride-map-pill-layout";
import { useRideRouteSnapshot } from "@/hooks/useRideRouteSnapshot";
import { haversineKm } from "@/lib/billSummary";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { RideServiceUnavailableSheet } from "@/features/ride/RideServiceUnavailableSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import { CX } from "@/lib/appAssetKeys";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { useParcelBookingStore } from "./parcelBookingStore";
import { ParcelReceiverDetailsBottomSheet } from "./ParcelReceiverDetailsBottomSheet";
import { ParcelPaymentModeSheet, type ParcelPaymentMode } from "./ParcelPaymentModeSheet";
import { ParcelOffersSheet } from "./ParcelOffersSheet";
import {
  FALLBACK_PARCEL_CATEGORY_CODES,
  parcelCategoryBookMeta,
  type ParcelVehicleCategoryCode,
} from "./parcelGuidelinesConfig";
import { fetchParcelBookVehicleCodes } from "./parcelVehicleAssignments";
import { parcelVehicleTotalEtaMins } from "./parcelVehicleEta";
import { getParcelFareQuoteBatch } from "@/services/parcelQuote.service";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import { useFeaturedOffersParcel } from "@/hooks/useFeaturedOffersParcel";
import { mapFeaturedOffersToRideBookOffers } from "@/lib/ride-offers";

const HERO_MINT = GatiMitraColors.mintSoft;

type ParcelVehicleOption = {
  id: ParcelVehicleCategoryCode;
  name: string;
  imageKey: "bike" | "auto" | "van";
  weightLabel: string;
  blurb: string;
  capacityRow: string;
};

function truncateAddress(text: string, max = 22): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function optionsFromCodes(codes: ParcelVehicleCategoryCode[]): ParcelVehicleOption[] {
  return codes.map((id) => {
    const meta = parcelCategoryBookMeta(id);
    return { id, ...meta };
  });
}

export function ParcelBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<CustomerMapRef | null>(null);
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const markVisitedInnerPage = useParcelBookingStore((s) => s.markVisitedInnerPage);
  const setReceiver = useParcelBookingStore((s) => s.setReceiver);
  const receiver = useParcelBookingStore((s) => s.receiver);
  const pickup = useParcelBookingStore((s) => s.pickup);
  const drop = useParcelBookingStore((s) => s.drop);

  const [vehicleCodes, setVehicleCodes] = useState<ParcelVehicleCategoryCode[]>(
    () => [...FALLBACK_PARCEL_CATEGORY_CODES]
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<ParcelVehicleCategoryCode | null>(
    null
  );
  const [fareByVehicle, setFareByVehicle] = useState<Record<string, number>>({});
  const [faresLoading, setFaresLoading] = useState(false);
  const [faresSettled, setFaresSettled] = useState(false);
  const [serviceUnavailableVisible, setServiceUnavailableVisible] = useState(false);
  const [receiverSheetOpen, setReceiverSheetOpen] = useState(false);
  const [payAt, setPayAt] = useState<"pickup" | "drop">("pickup");
  const [paymentMode, setPaymentMode] = useState<ParcelPaymentMode>("cash");
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [offersSheetOpen, setOffersSheetOpen] = useState(false);
  const bookAfterReceiverRef = useRef(false);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(
    Math.round(Dimensions.get("window").height * RIDE_BOOK_SHEET_HEIGHT_RATIO)
  );
  const [mapSyncToken, setMapSyncToken] = useState(0);
  const [mapFrameTick, setMapFrameTick] = useState(0);

  const vehicleCodesKey = vehicleCodes.join(",");

  const allVehicles = useMemo(() => optionsFromCodes(vehicleCodes), [vehicleCodes]);

  const displayVehicles = useMemo(() => {
    if (!faresSettled || faresLoading) return allVehicles;
    return allVehicles.filter((v) => (fareByVehicle[v.id] ?? 0) > 0);
  }, [allVehicles, fareByVehicle, faresLoading, faresSettled]);

  const selectedVehicle =
    displayVehicles.find((v) => v.id === selectedVehicleId) ?? displayVehicles[0] ?? null;

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HERO_MINT, "dark");
      markVisitedInnerPage();
    }, [setStatusBarBackground, markVisitedInnerPage])
  );

  useEffect(() => {
    if (!pickup || !drop) {
      router.replace("/home/service/parcels" as never);
    }
  }, [pickup, drop, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const codes = await fetchParcelBookVehicleCodes();
      if (cancelled) return;
      const nextKey = codes.join(",");
      setVehicleCodes((prev) => (prev.join(",") === nextKey ? prev : codes));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickupPoint = useMemo(
    () =>
      pickup
        ? { latitude: pickup.latitude, longitude: pickup.longitude }
        : null,
    [pickup]
  );
  const dropPoint = useMemo(
    () => (drop ? { latitude: drop.latitude, longitude: drop.longitude } : null),
    [drop]
  );

  const { routeCoordinates, routeEtaMins, tripKm: routeTripKm, loading: routeLoading } =
    useRideRouteSnapshot({
      pickup: pickupPoint,
      drop: dropPoint,
      enabled: !!(pickupPoint && dropPoint),
    });

  const tripKm = useMemo(() => {
    if (routeTripKm != null && Number.isFinite(routeTripKm) && routeTripKm > 0) {
      return routeTripKm;
    }
    if (!pickupPoint || !dropPoint) return null;
    return haversineKm(
      pickupPoint.latitude,
      pickupPoint.longitude,
      dropPoint.latitude,
      dropPoint.longitude
    );
  }, [routeTripKm, pickupPoint, dropPoint]);

  const fareTripKm = useMemo(() => {
    if (tripKm == null || !(tripKm > 0)) return null;
    return Math.round(tripKm * 10) / 10;
  }, [tripKm]);

  const { data: availability } = useNearbyRideAvailability(
    pickupPoint?.latitude ?? null,
    pickupPoint?.longitude ?? null,
    tripKm
  );
  const nearbyRiders = availability?.riders ?? [];

  const { data: parcelOffersData } = useFeaturedOffersParcel(
    {
      lat: pickupPoint?.latitude,
      lng: pickupPoint?.longitude,
    },
    !!pickupPoint
  );
  const parcelBookOffers = useMemo(
    () => mapFeaturedOffersToRideBookOffers(parcelOffersData?.offers ?? []),
    [parcelOffersData?.offers]
  );

  const etaByVehicle = useMemo(() => {
    const next: Record<string, number> = {};
    for (const v of allVehicles) {
      next[v.id] = parcelVehicleTotalEtaMins({
        category: v.id,
        routeEtaMins,
        tripKm,
        riders: nearbyRiders,
      });
    }
    return next;
  }, [allVehicles, routeEtaMins, tripKm, nearbyRiders]);

  const selectedEtaMins = selectedVehicle
    ? etaByVehicle[selectedVehicle.id] ?? null
    : null;

  useEffect(() => {
    if (!pickupPoint || fareTripKm == null || vehicleCodes.length === 0) {
      return;
    }
    const ac = new AbortController();
    setFaresLoading(true);
    setFaresSettled(false);
    void (async () => {
      const result = await getParcelFareQuoteBatch({
        pickupLat: pickupPoint.latitude,
        pickupLng: pickupPoint.longitude,
        tripKm: fareTripKm,
        vehicleTypes: vehicleCodes,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!result.ok) {
        setFareByVehicle({});
        setFaresLoading(false);
        setFaresSettled(true);
        return;
      }
      const next: Record<string, number> = {};
      for (const [code, q] of Object.entries(result.quotes)) {
        next[code] = Math.round(q.finalFare);
      }
      setFareByVehicle(next);
      setFaresLoading(false);
      setFaresSettled(true);
    })();
    return () => ac.abort();
  }, [pickupPoint?.latitude, pickupPoint?.longitude, fareTripKm, vehicleCodesKey]);

  const noVehiclesAvailable = useMemo(
    () =>
      faresSettled &&
      !faresLoading &&
      !routeLoading &&
      !!pickupPoint &&
      displayVehicles.length === 0,
    [faresSettled, faresLoading, routeLoading, pickupPoint, displayVehicles.length]
  );

  const unavailableMessage = useMemo(() => {
    if (fareTripKm != null && fareTripKm > 0) {
      return "Oops! No parcel vehicles are available for this route right now. The trip may be too long for nearby vehicles, or no captains are online. Try a different pickup or drop.";
    }
    return "Oops! No parcel vehicles available near your pickup location. Please select a different pickup or try again shortly.";
  }, [fareTripKm]);

  useEffect(() => {
    setServiceUnavailableVisible(noVehiclesAvailable);
  }, [noVehiclesAvailable]);

  useEffect(() => {
    if (displayVehicles.length === 0) return;
    if (selectedVehicleId && displayVehicles.some((v) => v.id === selectedVehicleId)) return;
    setSelectedVehicleId(displayVehicles[0]!.id);
  }, [displayVehicles, selectedVehicleId]);

  const pickupLabel = truncateAddress(pickup?.primary || pickup?.fullAddress || "Pickup");
  const dropLabel = truncateAddress(drop?.primary || drop?.fullAddress || "Drop");

  const mapCenter = useMemo(() => {
    if (pickupPoint && dropPoint) {
      return {
        latitude: (pickupPoint.latitude + dropPoint.latitude) / 2,
        longitude: (pickupPoint.longitude + dropPoint.longitude) / 2,
      };
    }
    if (pickupPoint) return pickupPoint;
    return { latitude: 28.6139, longitude: 77.209 };
  }, [pickupPoint, dropPoint]);

  const fitMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !pickupPoint || !dropPoint) return;
    const padding = rideMapFitPadding({ topInset: insets.top });
    const pts =
      routeCoordinates.length > 1
        ? routeBoundsFitPoints(routeCoordinates, [pickupPoint, dropPoint])
        : endpointsBoundsFitPoints([pickupPoint, dropPoint]);
    map.fitToCoordinates(pts, {
      edgePadding: padding,
      animated: true,
      maxZoom: rideMapFitMaxZoom(tripKm),
    });
    setMapSyncToken((t) => t + 1);
  }, [pickupPoint, dropPoint, routeCoordinates, insets.top, tripKm]);

  useEffect(() => {
    const t = setTimeout(fitMap, 280);
    return () => clearTimeout(t);
  }, [fitMap]);

  const pillBias: { pickup: InwardBias; drop: InwardBias } = {
    pickup: "right",
    drop: "left",
  };

  const openSearch = (field: "pickup" | "drop") => {
    router.push({
      pathname: "/home/service/parcel-location",
      params: { field },
    } as never);
  };

  const goToParcelSearching = useCallback(() => {
    if (!selectedVehicle) return;
    const fare = fareByVehicle[selectedVehicle.id];
    if (!(fare != null && fare > 0)) return;
    router.push({
      pathname: "/home/service/parcel-searching",
      params: {
        vehicleId: selectedVehicle.id,
        vehicleName: selectedVehicle.name,
        imageKey: selectedVehicle.imageKey,
        fare: String(fare),
        ...(tripKm != null ? { tripKm: String(Math.round(tripKm * 100) / 100) } : {}),
        ...(selectedEtaMins != null ? { routeEtaMins: String(selectedEtaMins) } : {}),
        payAt,
        paymentMethod: paymentMode,
      },
    } as never);
  }, [
    selectedVehicle,
    fareByVehicle,
    tripKm,
    selectedEtaMins,
    payAt,
    paymentMode,
    router,
  ]);

  const effectiveBottomSheetHeight = bottomSheetHeight;
  const selectedFare = selectedVehicle ? fareByVehicle[selectedVehicle.id] : undefined;
  const showBookSheet = !serviceUnavailableVisible;

  if (!pickup || !drop) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor={HERO_MINT} />
      <View style={styles.mapWrap}>
        <RideBookMap
          ref={mapRef}
          center={mapCenter}
          routeCoordinates={routeCoordinates}
          showRoadPolyline={routeCoordinates.length > 1}
          stopCoords={[]}
          nearbyRiders={nearbyRiders}
          style={StyleSheet.absoluteFill}
          onMapReady={fitMap}
          onRegionChange={() => setMapFrameTick((n) => n + 1)}
          onRegionChangeComplete={() => setMapSyncToken((t) => t + 1)}
        />

        <RideRouteMapPillOverlay
          mapRef={mapRef}
          pickupPoint={pickupPoint}
          dropPoint={dropPoint}
          pickupLabel={pickupLabel}
          dropLabel={dropLabel}
          pickupBias={pillBias.pickup}
          dropBias={pillBias.drop}
          syncToken={mapSyncToken}
          mapFrameTick={mapFrameTick}
          editable={false}
          onEditPickup={() => openSearch("pickup")}
          onEditDrop={() => openSearch("drop")}
        />

        {routeLoading ? (
          <View
            style={[
              styles.routeLoadingPill,
              { bottom: effectiveBottomSheetHeight + 16 },
            ]}
          >
            <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
            <AppText style={styles.routeLoadingText}>Calculating route…</AppText>
          </View>
        ) : null}

        <View style={styles.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.locateFab, { bottom: effectiveBottomSheetHeight + 16 }]}
            onPress={fitMap}
            activeOpacity={0.88}
          >
            <Ionicons name="locate" size={22} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {showBookSheet ? (
        <View
          style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - bottomSheetHeight) > 2) {
              setBottomSheetHeight(h);
            }
          }}
        >
          <View style={styles.sheetHandle} />

          {receiver ? (
            <TouchableOpacity
              style={styles.receiverRow}
              onPress={() => {
                bookAfterReceiverRef.current = false;
                setReceiverSheetOpen(true);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.receiverIcon}>
                <Ionicons name="person" size={16} color={GatiMitraColors.deepMintStart} />
              </View>
              <View style={styles.receiverBody}>
                <AppText style={styles.receiverName} numberOfLines={1}>
                  {receiver.name}
                </AppText>
                <AppText style={styles.receiverMobile} numberOfLines={1}>
                  +91 {receiver.mobile}
                </AppText>
              </View>
              <AppText style={styles.receiverEdit}>Edit</AppText>
            </TouchableOpacity>
          ) : null}

          <View style={styles.vehicleList}>
            {displayVehicles.map((vehicle) => {
              const selected = vehicle.id === selectedVehicle?.id;
              const img =
                vehicle.imageKey === "van" ? null : resolveRideImage(vehicle.imageKey);
              const fare = fareByVehicle[vehicle.id];
              return (
                <TouchableOpacity
                  key={vehicle.id}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  activeOpacity={0.88}
                  onPress={() => setSelectedVehicleId(vehicle.id)}
                >
                  {vehicle.imageKey === "van" ? (
                    <AppAssetImage
                      assetKey={CX.home.serviceParcel}
                      style={styles.optionImg}
                      contentFit="contain"
                    />
                  ) : img ? (
                    <Image source={img} style={styles.optionImg} resizeMode="contain" />
                  ) : (
                    <View style={styles.optionImgFallback}>
                      <Ionicons
                        name="bicycle"
                        size={28}
                        color={GatiMitraColors.deepMintStart}
                      />
                    </View>
                  )}
                  <View style={styles.optionBody}>
                    <View style={styles.optionTopRow}>
                      <View style={styles.optionTextCol}>
                        <AppText style={styles.optionTitle}>{vehicle.name}</AppText>
                        <AppText style={styles.optionSub} numberOfLines={2}>
                          {vehicle.blurb}
                        </AppText>
                      </View>
                      {faresLoading && fare == null ? (
                        <ActivityIndicator size="small" color={GatiMitraColors.deepMintStart} />
                      ) : fare != null && fare > 0 ? (
                        <AppText style={styles.optionFare}>₹{fare}</AppText>
                      ) : (
                        <AppText style={styles.optionFareMuted}>—</AppText>
                      )}
                    </View>
                    <View style={styles.capacityRow}>
                      <Ionicons name="cube-outline" size={14} color="#64748B" />
                      <AppText style={styles.capacityText} numberOfLines={1}>
                        {vehicle.capacityRow}
                      </AppText>
                      <AppText style={styles.capacityEta} numberOfLines={1}>
                        · {etaByVehicle[vehicle.id] ?? "—"} mins
                      </AppText>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.payOffersRow}>
            <TouchableOpacity
              style={styles.payOffersHalf}
              activeOpacity={0.85}
              onPress={() => setPaymentSheetOpen(true)}
            >
              <Ionicons
                name={paymentMode === "online" ? "card-outline" : "wallet-outline"}
                size={18}
                color="#111827"
              />
              <AppText style={styles.payOffersText}>
                {paymentMode === "online" ? "Online" : "Cash"}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
            <View style={styles.payOffersDivider} />
            <TouchableOpacity
              style={styles.payOffersHalf}
              activeOpacity={0.85}
              onPress={() => setOffersSheetOpen(true)}
            >
              <Ionicons name="pricetag-outline" size={18} color="#111827" />
              <AppText style={styles.payOffersText}>
                Offers{parcelBookOffers.length > 0 ? ` (${parcelBookOffers.length})` : ""}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {paymentMode === "cash" ? (
          <View style={styles.payAtRow}>
            <AppText style={styles.payAtLabel}>PAY AT</AppText>
            <View style={styles.payAtToggle}>
              <TouchableOpacity
                style={[styles.payAtOpt, payAt === "pickup" && styles.payAtOptOn]}
                onPress={() => setPayAt("pickup")}
                activeOpacity={0.85}
              >
                <AppText
                  style={[styles.payAtOptText, payAt === "pickup" && styles.payAtOptTextOn]}
                >
                  Pickup
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.payAtOpt, payAt === "drop" && styles.payAtOptOn]}
                onPress={() => setPayAt("drop")}
                activeOpacity={0.85}
              >
                <AppText
                  style={[styles.payAtOptText, payAt === "drop" && styles.payAtOptTextOn]}
                >
                  Drop
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.bookBtn,
              (!selectedVehicle || !(selectedFare != null && selectedFare > 0)) &&
                styles.bookBtnDisabled,
            ]}
            activeOpacity={0.9}
            disabled={!selectedVehicle || !(selectedFare != null && selectedFare > 0)}
            onPress={() => {
              if (!receiver) {
                bookAfterReceiverRef.current = true;
                setReceiverSheetOpen(true);
                return;
              }
              goToParcelSearching();
            }}
          >
            <AppText style={styles.bookBtnText}>
              Book Parcel on {selectedVehicle?.name ?? "…"}
            </AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      <RideServiceUnavailableSheet
        visible={serviceUnavailableVisible}
        message={unavailableMessage}
        onOkay={() => {
          setServiceUnavailableVisible(false);
          router.back();
        }}
      />

      <ParcelPaymentModeSheet
        visible={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        selected={paymentMode}
        onSelect={setPaymentMode}
      />

      <ParcelOffersSheet
        visible={offersSheetOpen}
        onClose={() => setOffersSheetOpen(false)}
        offers={parcelBookOffers}
      />

      <ParcelReceiverDetailsBottomSheet
        visible={receiverSheetOpen}
        onClose={() => {
          bookAfterReceiverRef.current = false;
          setReceiverSheetOpen(false);
        }}
        vehicleName={selectedVehicle?.name ?? "Parcel"}
        initialName={receiver?.name ?? drop?.contactName ?? ""}
        initialMobile={receiver?.mobile ?? drop?.contactMobile ?? ""}
        onConfirm={({ name, mobile }) => {
          setReceiver({ name, mobile });
          setReceiverSheetOpen(false);
          if (bookAfterReceiverRef.current) {
            bookAfterReceiverRef.current = false;
            requestAnimationFrame(() => goToParcelSearching());
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  mapWrap: {
    flex: 1,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  locateFab: {
    position: "absolute",
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  routeLoadingPill: {
    position: "absolute",
    alignSelf: "center",
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 10,
    elevation: 2,
  },
  routeLoadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  bottomSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 4,
  },
  vehicleList: {
    gap: 10,
  },
  receiverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: GatiMitraColors.mintHighlight,
  },
  receiverIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  receiverBody: {
    flex: 1,
    minWidth: 0,
  },
  receiverName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  receiverMobile: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  receiverEdit: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
  },
  optionCardSelected: {
    borderColor: "#0F172A",
  },
  optionImg: {
    width: 56,
    height: 56,
    marginTop: 2,
  },
  optionImgFallback: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  optionBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  optionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  optionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  optionSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  capacityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  capacityText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  capacityEta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  optionFare: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  optionFareMuted: {
    fontSize: 18,
    fontWeight: "700",
    color: "#94A3B8",
  },
  payOffersRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    paddingVertical: 10,
  },
  payOffersHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  payOffersDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E2E8F0",
  },
  payOffersText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  payAtRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payAtLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#64748B",
  },
  payAtToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 3,
  },
  payAtOpt: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payAtOptOn: {
    backgroundColor: "#1E3A5F",
  },
  payAtOptText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  payAtOptTextOn: {
    color: "#fff",
  },
  bookBtn: {
    backgroundColor: GatiMitraColors.deepMintStart,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  bookBtnDisabled: {
    opacity: 0.45,
  },
  bookBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
