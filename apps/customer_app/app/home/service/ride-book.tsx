/**
 * Ride book screen – Rapido-style map + bottom sheet, all service options, mint CTA.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { RideBookMap } from "@/components/maps/RideBookMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { GatiMitraColors } from "@/constants/gatimitra";
import { resolvePlaceDisplayName } from "@/services/location.service";
import { RideServiceUnavailableSheet } from "@/features/ride/RideServiceUnavailableSheet";
import { haversineKm } from "@/lib/billSummary";
import { parseRideStopsParam } from "@/lib/ride-serviceability";
import type { LatLng } from "@/services/directions.service";
import { RideRouteMapPillOverlay } from "@/features/ride/RideRouteMapPillOverlay";
import {
  rideMapFitPadding,
  rideMapFitMaxZoom,
  endpointsBoundsFitPoints,
  routeBoundsFitPoints,
  RIDE_BOOK_SHEET_HEIGHT_RATIO,
  type InwardBias,
} from "@/features/ride/ride-map-pill-layout";
import { useRideConfirmPickupStore } from "@/store/rideConfirmPickupStore";
import { resolveRideImage, resolveSelectedRideMapMarkerImageKey } from "@/features/ride/rideOptionAssets";
import { filterRideCatalogOptions } from "@/lib/ride-catalog-display";
import { useNearbyRideAvailability } from "@/hooks/useNearbyRideAvailability";
import type { RideAvailabilityOption } from "@/services/rideAvailability.service";
import { estimateRideFare } from "@/features/ride/rideOptions";
import { getRideFareQuote, type RideFareQuote } from "@/services/rideQuote.service";
import { useLocationStore } from "@/store/locationStore";
import { pickupGeoHintsFromAddress } from "@/lib/ride-geo-hints";
import { RidePreBookTipSheet } from "@/features/ride/RidePreBookTipSheet";
import { RideOffersSheet } from "@/features/ride/RideOffersSheet";
import { RideVehicleFareDetailsSheet } from "@/features/ride/RideVehicleFareDetailsSheet";
import { RideBookAvailabilityToast } from "@/features/ride/RideBookAvailabilityToast";
import { RIDE_BIKE_UNAVAILABLE_TOAST } from "@/lib/ride-search-toast-copy";
import { mapFeaturedOffersToRideBookOffers } from "@/lib/ride-offers";
import { useFeaturedOffersRide } from "@/hooks/useFeaturedOffersRide";
import { shouldShowPreBookTipSheet } from "@/lib/ride-tip-amounts";
import { applyBikeLiteFareRule, sortRideOptionsBikeLiteSecond } from "@/lib/ride-customer-fare";
import { formatRideDistanceKm, logRideRouteDebug } from "@/lib/ride-route-snapshot";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { useRideRouteSnapshot } from "@/hooks/useRideRouteSnapshot";
import { rideRouteParamsFromSnapshot } from "@/services/rideRoute.service";
import { rideFareDistanceNavParams } from "@/lib/ride-fare-distance";

const ENTRY_SURGE_MESSAGE = "Fares are higher due to increased demand";
const PRICING_BANNER_MS = 2500;
const BIKE_FAMILY_IDS = new Set(["bike", "bike-lite"]);

type PricingBanner = {
  text: string;
  variant?: "line" | "inline";
};

const DEFAULT_REGION = {
  latitude: 24.7969,
  longitude: 84.9914,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const SELECTED_BORDER = "#0F172A";
const EMPTY_RIDE_OPTIONS: RideAvailabilityOption[] = [];

type ConfirmedPickupOverride = {
  primary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

function truncateAddress(text: string, max = 24): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatDropTime(etaMins: number): string {
  const d = new Date(Date.now() + etaMins * 60_000);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function estimateFare(baseFare: number, tripKm: number | null): number {
  return estimateRideFare(baseFare, tripKm);
}

function formatPickupKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

function RideOptionCardSkeleton() {
  return (
    <View style={styles.rideCard} pointerEvents="none">
      <GMSkeleton style={styles.rideImageSkeleton} />
      <View style={styles.rideInfo}>
        <GMSkeleton style={styles.skelLineTitle} />
        <GMSkeleton style={styles.skelLineSub} />
        <GMSkeleton style={styles.skelLineMeta} />
        <GMSkeleton style={styles.skelLineMetaShort} />
      </View>
      <GMSkeleton style={styles.fareSkeleton} />
    </View>
  );
}

function RideOptionCard({
  option,
  selected,
  tripKm,
  pickupDistanceKm,
  routeEtaMins,
  quotedFare,
  compareFare,
  quoteLoading,
  showSurgeHint,
  fareDetailsEnabled = false,
  onSelect,
  onImagePress,
}: {
  option: RideAvailabilityOption;
  selected: boolean;
  tripKm: number | null;
  pickupDistanceKm: number | null;
  routeEtaMins: number | null;
  quotedFare?: number | null;
  compareFare?: number | null;
  quoteLoading?: boolean;
  showSurgeHint?: boolean;
  fareDetailsEnabled?: boolean;
  onSelect: () => void;
  onImagePress: () => void;
}) {
  const fareReady = quotedFare != null && quotedFare > 0;
  const farePending =
    quoteLoading || (tripKm != null && tripKm > 0 && !fareReady);
  const price = fareReady ? Math.round(quotedFare!) : null;
  const travelMins = routeEtaMins ?? Math.round((tripKm ?? 3) * 2);
  const awayMins = option.nearestRiderEtaMins ?? option.etaMins;
  const etaMins = awayMins + travelMins;
  const dropLabel = formatDropTime(etaMins);
  const pickupKmLabel = formatPickupKm(pickupDistanceKm ?? option.nearestRiderKm);
  const rideKmLabel = formatRideDistanceKm(tripKm);

  return (
    <TouchableOpacity
      style={[styles.rideCard, selected && styles.rideCardSelected]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      {fareDetailsEnabled ? (
        <TouchableOpacity onPress={onImagePress} activeOpacity={0.75} hitSlop={6}>
          <Image source={resolveRideImage(option.imageKey)} style={styles.rideImage} resizeMode="contain" />
        </TouchableOpacity>
      ) : (
        <Image source={resolveRideImage(option.imageKey)} style={styles.rideImage} resizeMode="contain" />
      )}
      <View style={styles.rideInfo}>
        <View style={styles.rideNameRow}>
          <Text style={styles.rideName}>{option.name}</Text>
          {selected && option.capacity != null ? (
            <View style={styles.capacityWrap}>
              <Ionicons name="person" size={11} color="#6B7280" />
              <Text style={styles.capacityText}>{option.capacity}</Text>
            </View>
          ) : null}
          {option.tag === "FASTEST" ? (
            <View style={styles.fastestTag}>
              <Text style={styles.fastestText}>FASTEST</Text>
            </View>
          ) : null}
          {option.tag === "SAVE" ? (
            <View style={styles.saveTag}>
              <Text style={styles.saveText}>%</Text>
            </View>
          ) : null}
        </View>
        {option.subtitle ? <Text style={styles.rideSubtitle}>{option.subtitle}</Text> : null}
        <Text style={styles.rideTiming}>
          {pickupKmLabel ? `Pickup: ${pickupKmLabel} km` : `${awayMins} mins away`}
          {rideKmLabel ? ` • Ride: ${rideKmLabel}` : ""}
          {routeEtaMins != null ? ` • ETA: ${etaMins} min` : ""}
        </Text>
        <Text style={styles.rideDropTiming}>Drop {dropLabel}</Text>
      </View>
      <View style={styles.ridePriceWrap}>
        {farePending ? (
          <GMSkeleton style={styles.fareSkeletonInline} />
        ) : (
          <View style={styles.priceCol}>
            {compareFare != null && compareFare > 0 && price != null && compareFare > price ? (
              <Text style={styles.ridePriceStrike}>₹{Math.round(compareFare)}</Text>
            ) : null}
            <View style={styles.priceRow}>
              {showSurgeHint && selected ? (
                <Ionicons name="caret-up" size={14} color="#DC2626" style={styles.surgeCaret} />
              ) : null}
              <Text style={styles.ridePrice}>{price != null ? `₹${price}` : "—"}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function RideBookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{
    pickup?: string;
    drop?: string;
    pickupLabel?: string;
    dropLabel?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropLat?: string;
    dropLng?: string;
    stops?: string;
    bookedForSelf?: string;
    passengerName?: string;
    passengerPhone?: string;
  }>();

  const [serviceUnavailableVisible, setServiceUnavailableVisible] = useState(false);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [offersSheetVisible, setOffersSheetVisible] = useState(false);
  const [fareDetailsOptionId, setFareDetailsOptionId] = useState<string | null>(null);
  const [bikeUnavailableToastVisible, setBikeUnavailableToastVisible] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const mapRef = useRef<CustomerMapRef>(null);
  const userAdjustedMapRef = useRef(false);
  const lastAutoFitKeyRef = useRef("");
  const [mapSyncToken, setMapSyncToken] = useState(0);
  const [mapFrameTick, setMapFrameTick] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const mapFrameRafRef = useRef<number | null>(null);
  const [fareQuotes, setFareQuotes] = useState<Record<string, number>>({});
  const [fareQuoteMeta, setFareQuoteMeta] = useState<Record<string, RideFareQuote>>({});
  const [fareQuotesLoading, setFareQuotesLoading] = useState(false);
  const [pricingBanner, setPricingBanner] = useState<PricingBanner | null>(null);
  const fareQuoteRequestRef = useRef(0);
  const fareQuoteKeyRef = useRef<string | null>(null);
  const pricingBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entrySurgeBannerShownRef = useRef(false);
  const entrySurgeRouteKeyRef = useRef<string | null>(null);
  const bikeUnavailableToastRouteKeyRef = useRef<string | null>(null);
  const bikeUnavailableToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locationAddress = useLocationStore((s) => s.address);
  const locationCoords = useLocationStore((s) => s.coords);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const pickupPincode = useMemo(
    () => pickupGeoHintsFromAddress(locationAddress).pickupPincode,
    [locationAddress]
  );
  const pickupState = useMemo(
    () => pickupGeoHintsFromAddress(locationAddress).pickupState,
    [locationAddress]
  );
  const pickupGeoHints = useMemo(
    () => ({
      ...(pickupPincode ? { pickupPincode } : {}),
      ...(pickupState ? { pickupState } : {}),
    }),
    [pickupPincode, pickupState]
  );

  const bumpMapOverlay = useCallback(() => {
    setMapSyncToken((v) => v + 1);
  }, []);

  const syncMapOverlayDuringPan = useCallback(() => {
    if (mapFrameRafRef.current != null) return;
    mapFrameRafRef.current = requestAnimationFrame(() => {
      mapFrameRafRef.current = null;
      setMapFrameTick((v) => v + 1);
    });
  }, []);

  useEffect(
    () => () => {
      if (mapFrameRafRef.current != null) {
        cancelAnimationFrame(mapFrameRafRef.current);
      }
    },
    []
  );

  const consumePendingConfirmPickup = useRideConfirmPickupStore((s) => s.consumePendingResult);
  const [confirmedPickup, setConfirmedPickup] = useState<ConfirmedPickupOverride | null>(null);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
      if (locationHydrated) {
        void queryClient.invalidateQueries({ queryKey: ["featured-offers-ride"] });
      }
      const nextPickup = consumePendingConfirmPickup();
      if (!nextPickup) return;
      setConfirmedPickup({
        primary: nextPickup.primary,
        fullAddress: nextPickup.fullAddress,
        latitude: nextPickup.latitude,
        longitude: nextPickup.longitude,
      });
    }, [consumePendingConfirmPickup, locationHydrated, queryClient])
  );

  const pickupLabel = truncateAddress(
    resolvePlaceDisplayName({
      primary: params.pickupLabel ?? confirmedPickup?.primary ?? params.pickup,
      fullAddress: confirmedPickup?.fullAddress ?? params.pickup,
    })
  );
  const dropLabel = truncateAddress(
    resolvePlaceDisplayName({
      primary: params.dropLabel ?? params.drop,
      fullAddress: params.drop,
    })
  );

  const pickupLat =
    confirmedPickup?.latitude ??
    (params.pickupLat != null ? Number(params.pickupLat) : null);
  const pickupLng =
    confirmedPickup?.longitude ??
    (params.pickupLng != null ? Number(params.pickupLng) : null);
  const dropLat = params.dropLat != null ? Number(params.dropLat) : null;
  const dropLng = params.dropLng != null ? Number(params.dropLng) : null;

  const stopCoords = useMemo(() => parseRideStopsParam(params.stops), [params.stops]);

  const pickupPoint = useMemo(
    () =>
      pickupLat != null && pickupLng != null
        ? { latitude: pickupLat, longitude: pickupLng }
        : null,
    [pickupLat, pickupLng]
  );

  const rideOfferLocationParams = useMemo(
    () => ({
      pincode: pickupPincode || locationAddress?.pincode?.trim() || undefined,
      state: pickupState || locationAddress?.state?.trim() || undefined,
      city: locationAddress?.city?.trim() || undefined,
      lat: pickupLat ?? locationCoords?.latitude ?? undefined,
      lng: pickupLng ?? locationCoords?.longitude ?? undefined,
    }),
    [
      pickupPincode,
      pickupState,
      locationAddress?.pincode,
      locationAddress?.state,
      locationAddress?.city,
      pickupLat,
      pickupLng,
      locationCoords?.latitude,
      locationCoords?.longitude,
    ]
  );

  const { data: rideOffersData } = useFeaturedOffersRide(
    rideOfferLocationParams,
    locationHydrated
  );
  const rideBookOffers = useMemo(
    () => mapFeaturedOffersToRideBookOffers(rideOffersData?.offers ?? []),
    [rideOffersData?.offers]
  );

  const dropPoint = useMemo(
    () =>
      dropLat != null && dropLng != null ? { latitude: dropLat, longitude: dropLng } : null,
    [dropLat, dropLng]
  );

  const {
    snapshot: rideRouteSnapshot,
    tripKm,
    routeEtaMins,
    routeCoordinates,
    loading: routeLoading,
  } = useRideRouteSnapshot({
    pickup: pickupPoint,
    drop: dropPoint,
    stops: stopCoords,
    enabled: isFocused,
  });

  const fareTripKm = useMemo(() => {
    if (tripKm == null || !Number.isFinite(tripKm) || tripKm <= 0) return null;
    return Math.round(tripKm * 10) / 10;
  }, [tripKm]);

  const {
    data: availability,
    isLoading: availabilityLoading,
    isError: availabilityError,
  } = useNearbyRideAvailability(pickupLat, pickupLng, tripKm, pickupGeoHints);

  const availableOptions = useMemo(
    () => filterRideCatalogOptions(availability?.options ?? EMPTY_RIDE_OPTIONS),
    [availability?.options]
  );

  const displayFareQuotes = useMemo(() => applyBikeLiteFareRule(fareQuotes), [fareQuotes]);

  const sortedOptions = useMemo(
    () => sortRideOptionsBikeLiteSecond(availableOptions, displayFareQuotes),
    [availableOptions, displayFareQuotes]
  );
  const availableOptionIdsKey = useMemo(
    () => availableOptions.map((o) => o.id).join("\u0000"),
    [availableOptions]
  );
  const allNearbyRiders = availability?.riders ?? [];

  const selectedRide =
    sortedOptions.find((r) => r.id === selectedRideId) ?? sortedOptions[0] ?? null;
  const riderMarkerImageKey = resolveSelectedRideMapMarkerImageKey(
    selectedRide?.id,
    selectedRide?.imageKey
  );
  const fareDetailsOption = useMemo(
    () => sortedOptions.find((o) => o.id === fareDetailsOptionId) ?? null,
    [sortedOptions, fareDetailsOptionId]
  );
  const fareDetailsQuote = fareDetailsOptionId ? fareQuoteMeta[fareDetailsOptionId] : undefined;
  const fareDetailsDisplayFare =
    fareDetailsOptionId != null ? displayFareQuotes[fareDetailsOptionId] ?? null : null;

  const bikeUnavailableOnRoute = useMemo(() => {
    if (availabilityLoading || routeLoading || availabilityError) return false;
    if (fareTripKm == null || fareTripKm <= 0) return false;
    if (availableOptions.length === 0) return false;
    return !availableOptions.some((o) => o.id === "bike");
  }, [
    availabilityLoading,
    routeLoading,
    availabilityError,
    fareTripKm,
    availableOptions,
  ]);

  const showPricingBanner = useCallback((banner: PricingBanner) => {
    if (pricingBannerTimerRef.current) clearTimeout(pricingBannerTimerRef.current);
    setPricingBanner(banner);
    pricingBannerTimerRef.current = setTimeout(() => {
      setPricingBanner(null);
      pricingBannerTimerRef.current = null;
    }, PRICING_BANNER_MS);
  }, []);

  const selectRideOption = useCallback(
    (id: string) => {
      if (id === selectedRideId) return;
      const prevId = selectedRideId;

      if (
        prevId &&
        BIKE_FAMILY_IDS.has(prevId) &&
        BIKE_FAMILY_IDS.has(id) &&
        prevId !== id
      ) {
        if (prevId === "bike" && id === "bike-lite") {
          const bikeFare = displayFareQuotes.bike;
          const liteFare = displayFareQuotes["bike-lite"];
          if (bikeFare != null && liteFare != null && bikeFare > liteFare) {
            showPricingBanner({
              text: `Saving ₹${Math.round(bikeFare - liteFare)} with Bike Lite`,
              variant: "inline",
            });
          }
        } else if (prevId === "bike-lite" && id === "bike") {
          showPricingBanner({ text: ENTRY_SURGE_MESSAGE, variant: "inline" });
        }
      }

      setSelectedRideId(id);
    },
    [selectedRideId, displayFareQuotes, showPricingBanner]
  );

  useEffect(() => {
    const routeKey = [pickupLat, pickupLng, dropLat, dropLng, params.stops ?? ""].join("\u0000");
    if (entrySurgeRouteKeyRef.current !== routeKey) {
      entrySurgeRouteKeyRef.current = routeKey;
      entrySurgeBannerShownRef.current = false;
    }
    if (entrySurgeBannerShownRef.current) return;
    if (routeLoading || tripKm == null || tripKm <= 0 || sortedOptions.length === 0) return;
    if (!sortedOptions.some((o) => o.id === "bike")) return;

    entrySurgeBannerShownRef.current = true;
    showPricingBanner({ text: ENTRY_SURGE_MESSAGE, variant: "line" });
  }, [
    routeLoading,
    tripKm,
    sortedOptions,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    params.stops,
    showPricingBanner,
  ]);

  useEffect(
    () => () => {
      if (pricingBannerTimerRef.current) clearTimeout(pricingBannerTimerRef.current);
      if (bikeUnavailableToastTimerRef.current) clearTimeout(bikeUnavailableToastTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const routeKey = [
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      fareTripKm ?? "",
      availableOptionIdsKey,
    ].join("\u0000");

    if (!bikeUnavailableOnRoute) {
      setBikeUnavailableToastVisible(false);
      return;
    }

    if (bikeUnavailableToastRouteKeyRef.current === routeKey) return;
    bikeUnavailableToastRouteKeyRef.current = routeKey;
    setBikeUnavailableToastVisible(true);

    if (bikeUnavailableToastTimerRef.current) {
      clearTimeout(bikeUnavailableToastTimerRef.current);
    }
    bikeUnavailableToastTimerRef.current = setTimeout(() => {
      setBikeUnavailableToastVisible(false);
      bikeUnavailableToastTimerRef.current = null;
    }, 5000);
  }, [
    bikeUnavailableOnRoute,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    fareTripKm,
    availableOptionIdsKey,
  ]);

  const nearbyRiders = useMemo(() => {
    if (!selectedRide?.vehicleTypes?.length) return allNearbyRiders;
    const allowed = new Set(selectedRide.vehicleTypes);
    return allNearbyRiders.filter((rider) => {
      const types = rider.vehicleTypes?.length ? rider.vehicleTypes : [rider.vehicleType];
      if (!types.some((type) => allowed.has(type))) return false;
      if (selectedRide.id === "cab-economy") return rider.acType === "Non-AC";
      if (selectedRide.id === "cab-premium") return rider.acType === "AC";
      return true;
    });
  }, [allNearbyRiders, selectedRide]);

  const hasDrop = dropLat != null && dropLng != null;
  const routeSettled = !hasDrop || !routeLoading;

  const noVehiclesAvailable = useMemo(
    () =>
      !availabilityLoading &&
      !availabilityError &&
      routeSettled &&
      pickupLat != null &&
      pickupLng != null &&
      availableOptions.length === 0,
    [
      availabilityLoading,
      availabilityError,
      routeSettled,
      pickupLat,
      pickupLng,
      availableOptions.length,
    ]
  );

  const unavailableMessage = useMemo(() => {
    if (tripKm != null && tripKm > 0) {
      return "Oops! No rides are available for this route right now. The trip may be too long for nearby vehicles, or no captains are online. Try a different pickup or drop.";
    }
    return "Oops! No riders available near your pickup location. Please select a different pickup or try again shortly.";
  }, [tripKm]);

  useEffect(() => {
    setServiceUnavailableVisible(noVehiclesAvailable);
  }, [noVehiclesAvailable]);

  useEffect(() => {
    if (sortedOptions.length === 0) return;
    const firstId = sortedOptions[0]!.id;
    if (selectedRideId === firstId) return;
    if (!selectedRideId || !sortedOptions.some((o) => o.id === selectedRideId)) {
      setSelectedRideId(firstId);
    }
  }, [availableOptionIdsKey, selectedRideId, sortedOptions]);

  useEffect(() => {
    if (!isFocused) return;
    if (
      pickupLat == null ||
      pickupLng == null ||
      dropLat == null ||
      dropLng == null ||
      fareTripKm == null ||
      availableOptions.length === 0
    ) {
      fareQuoteKeyRef.current = null;
      setFareQuotes({});
      setFareQuoteMeta({});
      setFareQuotesLoading(false);
      return;
    }

    const quoteKey = [
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      fareTripKm,
      availableOptionIdsKey,
      pickupPincode ?? "",
      pickupState ?? "",
    ].join("\u0000");

    if (quoteKey === fareQuoteKeyRef.current) return;
    fareQuoteKeyRef.current = quoteKey;

    const requestId = ++fareQuoteRequestRef.current;
    setFareQuotes({});
    setFareQuoteMeta({});
    setFareQuotesLoading(true);
    logRideRouteDebug("fare_quote_request", {
      tripKm: fareTripKm,
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      vehicleCount: availableOptions.length,
    });
    const options = availableOptions;
    void (async () => {
      const entries = await Promise.all(
        options.map(async (option) => {
          const result = await getRideFareQuote({
            pickupLat,
            pickupLng,
            dropLat,
            dropLng,
            tripKm: fareTripKm,
            catalogCode: option.id,
            pickupPincode,
            pickupState,
          });
          if (!result.ok || !result.quote.eligible || result.quote.finalFare <= 0) return null;
          return [option.id, result.quote] as const;
        })
      );
      if (requestId !== fareQuoteRequestRef.current) return;
      const next: Record<string, number> = {};
      const nextMeta: Record<string, RideFareQuote> = {};
      for (const entry of entries) {
        if (!entry) continue;
        nextMeta[entry[0]] = entry[1];
        next[entry[0]] = Math.round(entry[1].finalFare);
      }
      setFareQuoteMeta(nextMeta);
      setFareQuotes(applyBikeLiteFareRule(next));
      setFareQuotesLoading(false);
    })();
  }, [
    isFocused,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    fareTripKm,
    availableOptionIdsKey,
    pickupPincode,
    pickupState,
    availableOptions.length,
  ]);

  const mapFitPoints = useMemo(() => {
    const endpoints: LatLng[] = [];
    if (pickupPoint) endpoints.push(pickupPoint);
    stopCoords.forEach((s) => endpoints.push(s));
    if (dropPoint) endpoints.push(dropPoint);
    if (endpoints.length < 2) return endpoints;
    if (routeCoordinates.length >= 2) {
      return routeBoundsFitPoints(routeCoordinates, endpoints);
    }
    return endpointsBoundsFitPoints(endpoints);
  }, [pickupPoint, dropPoint, stopCoords, routeCoordinates]);

  const endpointSpanKm = useMemo(() => {
    if (!pickupPoint || !dropPoint) return null;
    return haversineKm(pickupPoint, dropPoint);
  }, [pickupPoint, dropPoint]);

  /** Nearest supply at pickup — selected vehicle icon (Rapido-style, max 6). */
  const mapNearbyRiders = useMemo(
    () =>
      [...nearbyRiders]
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 4),
    [nearbyRiders]
  );

  const showRoadPolyline = routeCoordinates.length >= 2;

  const pillBias = useMemo((): { pickup: InwardBias; drop: InwardBias } => {
    if (!pickupPoint || !dropPoint) {
      return { pickup: "none", drop: "none" };
    }
    const pickupIsLeft = pickupPoint.longitude <= dropPoint.longitude;
    return {
      pickup: pickupIsLeft ? "left" : "right",
      drop: pickupIsLeft ? "right" : "left",
    };
  }, [pickupPoint, dropPoint]);

  const effectiveBottomSheetHeight = useMemo(() => {
    if (bottomSheetHeight > 0) return bottomSheetHeight;
    return Math.round(Dimensions.get("window").height * RIDE_BOOK_SHEET_HEIGHT_RATIO);
  }, [bottomSheetHeight]);

  const mapEdgePadding = useMemo(
    () =>
      rideMapFitPadding({
        topInset: insets.top,
      }),
    [insets.top]
  );

  const mapFitMaxZoom = useMemo(
    () => rideMapFitMaxZoom(tripKm ?? endpointSpanKm),
    [tripKm, endpointSpanKm]
  );

  const autoFitKey = useMemo(
    () =>
      [
        pickupLat,
        pickupLng,
        dropLat,
        dropLng,
        routeCoordinates.length,
        stopCoords.length,
      ].join("|"),
    [pickupLat, pickupLng, dropLat, dropLng, routeCoordinates.length, stopCoords.length]
  );

  const handleUserMapGesture = useCallback(() => {
    userAdjustedMapRef.current = true;
  }, []);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    bumpMapOverlay();
  }, [bumpMapOverlay]);

  useEffect(() => {
    if (!mapReady) return;
    if (mapFitPoints.length < 2) return;

    const locationChanged = autoFitKey !== lastAutoFitKeyRef.current;
    if (userAdjustedMapRef.current && !locationChanged) return;

    if (locationChanged) {
      userAdjustedMapRef.current = false;
      lastAutoFitKeyRef.current = autoFitKey;
    }

    const runFit = () => {
      if (userAdjustedMapRef.current) return;
      mapRef.current?.fitToCoordinates(mapFitPoints, {
        edgePadding: mapEdgePadding,
        animated: true,
        maxZoom: mapFitMaxZoom,
      });
    };

    runFit();
    const t1 = setTimeout(runFit, routeLoading ? 600 : 200);
    const t2 = setTimeout(() => {
      if (userAdjustedMapRef.current) return;
      runFit();
      bumpMapOverlay();
    }, routeLoading ? 1400 : 550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    mapReady,
    routeLoading,
    mapFitPoints,
    mapEdgePadding,
    mapFitMaxZoom,
    bumpMapOverlay,
    autoFitKey,
  ]);

  const effectivePickupAddress =
    confirmedPickup?.fullAddress ?? String(params.pickup ?? "");

  const goEditLocations = useCallback(
    (focusField: "pickup" | "drop" | "add-stop") => {
      const restoreParams: Record<string, string> = {
        restore: "true",
        focusField,
      };
      if (effectivePickupAddress) restoreParams.pickup = effectivePickupAddress;
      if (params.drop) restoreParams.drop = String(params.drop);
      if (pickupLabel) restoreParams.pickupLabel = pickupLabel;
      if (dropLabel) restoreParams.dropLabel = dropLabel;
      if (pickupLat != null) restoreParams.pickupLat = String(pickupLat);
      if (pickupLng != null) restoreParams.pickupLng = String(pickupLng);
      if (params.dropLat) restoreParams.dropLat = String(params.dropLat);
      if (params.dropLng) restoreParams.dropLng = String(params.dropLng);
      if (params.stops) restoreParams.stops = String(params.stops);
      router.push({ pathname: "/home/service/ride-pickup", params: restoreParams });
    },
    [effectivePickupAddress, params, pickupLat, pickupLng, pickupLabel, dropLabel, router]
  );

  const navigateToConfirmPickup = useCallback(
    (customerTipAmount = 0) => {
      if (!selectedRide || !selectedRideId) return;
      const quoted = displayFareQuotes[selectedRideId];
      if (tripKm != null && tripKm > 0 && (quoted == null || quoted <= 0)) return;
      const baseFare =
        quoted != null && quoted > 0 ? quoted : estimateFare(selectedRide.baseFare, tripKm);
      const navParams: Record<string, string> = {
        pickup: effectivePickupAddress,
        drop: String(params.drop ?? ""),
        pickupLabel,
        dropLabel,
        selectedRideId,
        selectedRideName: selectedRide.name,
        selectedRideImageKey: selectedRide.imageKey,
      };
      if (pickupLat != null) navParams.pickupLat = String(pickupLat);
      if (pickupLng != null) navParams.pickupLng = String(pickupLng);
      if (params.dropLat) navParams.dropLat = String(params.dropLat);
      if (params.dropLng) navParams.dropLng = String(params.dropLng);
      if (params.stops) navParams.stops = String(params.stops);
      if (params.bookedForSelf) navParams.bookedForSelf = String(params.bookedForSelf);
      if (params.passengerName) navParams.passengerName = String(params.passengerName);
      if (params.passengerPhone) navParams.passengerPhone = String(params.passengerPhone);
      navParams.estimatedFare = String(baseFare);
      if (pickupGeoHints.pickupPincode) navParams.pickupPincode = pickupGeoHints.pickupPincode;
      if (pickupGeoHints.pickupState) navParams.pickupState = pickupGeoHints.pickupState;
      if (customerTipAmount > 0) navParams.customerTipAmount = String(customerTipAmount);
      if (rideRouteSnapshot) {
        Object.assign(navParams, rideRouteParamsFromSnapshot(rideRouteSnapshot));
      } else if (tripKm != null && tripKm > 0) {
        Object.assign(navParams, rideFareDistanceNavParams(tripKm));
      }
      setTipSheetVisible(false);
      router.push({ pathname: "/home/service/ride-confirm-pickup", params: navParams });
    },
    [
      effectivePickupAddress,
      params,
      pickupLat,
      pickupLng,
      selectedRideId,
      selectedRide,
      tripKm,
      rideRouteSnapshot,
      fareQuotes,
      displayFareQuotes,
      pickupGeoHints,
      pickupLabel,
      dropLabel,
      router,
    ]
  );

  const selectedQuotedFare =
    selectedRideId != null ? displayFareQuotes[selectedRideId] : undefined;
  const faresLoadingForOptions = useMemo(() => {
    if (routeLoading || tripKm == null || tripKm <= 0) return true;
    if (fareQuotesLoading) return true;
    if (sortedOptions.length === 0) return false;
    return sortedOptions.some((o) => !(displayFareQuotes[o.id] > 0));
  }, [routeLoading, tripKm, fareQuotesLoading, sortedOptions, displayFareQuotes]);
  const canBookSelectedRide =
    !!selectedRide &&
    !faresLoadingForOptions &&
    (tripKm == null || tripKm <= 0 || (selectedQuotedFare != null && selectedQuotedFare > 0));

  const handleBookPress = useCallback(() => {
    if (!selectedRide) return;
    if (shouldShowPreBookTipSheet(tripKm)) {
      setTipSheetVisible(true);
      return;
    }
    navigateToConfirmPickup(0);
  }, [selectedRide, tripKm, navigateToConfirmPickup]);

  const mapCenter = useMemo(
    () =>
      pickupPoint ??
      dropPoint ?? {
        latitude: DEFAULT_REGION.latitude,
        longitude: DEFAULT_REGION.longitude,
      },
    [pickupPoint, dropPoint]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mapSection}>
        <RideBookMap
          ref={mapRef}
          center={mapCenter}
          routeCoordinates={routeCoordinates}
          showRoadPolyline={showRoadPolyline}
          stopCoords={stopCoords}
          nearbyRiders={mapNearbyRiders}
          riderMarkerImageKey={riderMarkerImageKey}
          style={StyleSheet.absoluteFill}
          onMapReady={handleMapReady}
          onRegionChange={syncMapOverlayDuringPan}
          onRegionChangeComplete={bumpMapOverlay}
          onUserMapGesture={handleUserMapGesture}
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
          onEditPickup={() => goEditLocations("pickup")}
          onEditDrop={() => goEditLocations("drop")}
        />

        {routeLoading ? (
          <View
            style={[
              styles.routeLoadingPill,
              { bottom: effectiveBottomSheetHeight > 0 ? effectiveBottomSheetHeight + 16 : 24 },
            ]}
          >
            <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
            <Text style={styles.routeLoadingText}>Calculating route…</Text>
          </View>
        ) : null}

        <View style={styles.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.backFab, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.mapFabCol}>
            <TouchableOpacity
              style={styles.mapFab}
              onPress={() => goEditLocations("add-stop")}
              activeOpacity={0.88}
            >
              <Ionicons name="add" size={18} color="#111827" />
              <Text style={styles.mapFabText}>Add stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locateFab} activeOpacity={0.88}>
              <Ionicons name="locate" size={22} color="#2563EB" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {!serviceUnavailableVisible ? (
        <View
          style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom - 18, 0) }]}
          onLayout={(event) => {
            const h = event.nativeEvent.layout.height;
            if (h > 0) setBottomSheetHeight(h);
          }}
        >
          <View style={styles.sheetHandle} />
          {pricingBanner ? (
            <View
              style={
                pricingBanner.variant === "inline"
                  ? styles.pricingBannerInline
                  : styles.pricingBannerLine
              }
            >
              <Text
                style={
                  pricingBanner.variant === "inline"
                    ? styles.pricingBannerInlineText
                    : styles.pricingBannerLineText
                }
              >
                {pricingBanner.text}
              </Text>
            </View>
          ) : null}
          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {availabilityLoading && availableOptions.length === 0 ? (
              <View style={styles.optionsLoading}>
                <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
                <Text style={styles.optionsLoadingText}>Finding nearby riders…</Text>
              </View>
            ) : faresLoadingForOptions ? (
              sortedOptions.map((option) => (
                <RideOptionCardSkeleton key={option.id} />
              ))
            ) : (
              sortedOptions.map((option) => (
                <RideOptionCard
                  key={option.id}
                  option={option}
                  selected={selectedRideId === option.id}
                  tripKm={tripKm}
                  pickupDistanceKm={option.nearestRiderKm ?? null}
                  routeEtaMins={routeEtaMins}
                  quotedFare={displayFareQuotes[option.id]}
                  compareFare={
                    option.id === "bike-lite" ? displayFareQuotes.bike : undefined
                  }
                  quoteLoading={fareQuotesLoading || routeLoading}
                  showSurgeHint={option.id === "bike" && selectedRideId === "bike"}
                  fareDetailsEnabled={BIKE_FAMILY_IDS.has(option.id)}
                  onSelect={() => selectRideOption(option.id)}
                  onImagePress={() => {
                    if (BIKE_FAMILY_IDS.has(option.id)) {
                      setFareDetailsOptionId(option.id);
                    }
                  }}
                />
              ))
            )}
          </ScrollView>

          <RideBookAvailabilityToast
            visible={bikeUnavailableToastVisible}
            message={RIDE_BIKE_UNAVAILABLE_TOAST}
          />

          <View style={styles.payOffersRow}>
            <View style={styles.payOffersHalf}>
              <Ionicons name="card-outline" size={18} color="#111827" />
              <Text style={styles.payOffersText}>Online</Text>
            </View>
            <View style={styles.payOffersDivider} />
            <TouchableOpacity
              style={styles.payOffersHalf}
              activeOpacity={0.85}
              onPress={() => setOffersSheetVisible(true)}
            >
              <Ionicons name="pricetag-outline" size={18} color="#111827" />
              <Text style={styles.payOffersText}>
                Offers{rideBookOffers.length > 0 ? ` (${rideBookOffers.length})` : ""}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.bookBtn, (!selectedRide || !canBookSelectedRide) && styles.bookBtnDisabled]}
            activeOpacity={0.9}
            onPress={handleBookPress}
            disabled={!selectedRide || !canBookSelectedRide}
          >
            <Text style={styles.bookBtnText}>
              {faresLoadingForOptions
                ? "Calculating fare…"
                : selectedRide
                  ? `Book ${selectedRide.name}`
                  : "Book ride"}
            </Text>
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

      <RideOffersSheet
        visible={offersSheetVisible}
        onClose={() => setOffersSheetVisible(false)}
        offers={rideBookOffers}
      />

      <RideVehicleFareDetailsSheet
        visible={fareDetailsOption != null && BIKE_FAMILY_IDS.has(fareDetailsOption.id)}
        onClose={() => setFareDetailsOptionId(null)}
        vehicleName={fareDetailsOption?.name ?? "Ride"}
        imageKey={fareDetailsOption?.imageKey ?? "bike"}
        fare={fareDetailsDisplayFare}
        rateCardSummary={fareDetailsQuote?.rateCardSummary}
        waitingChargeNote={fareDetailsQuote?.waitingChargeNote}
        loading={fareQuotesLoading || routeLoading}
      />

      <RidePreBookTipSheet
        visible={tipSheetVisible && !!selectedRide}
        baseFare={
          selectedRide && displayFareQuotes[selectedRide.id] > 0
            ? displayFareQuotes[selectedRide.id]
            : 0
        }
        rideName={selectedRide?.name ?? "Ride"}
        pickupLabel={pickupLabel}
        dropLabel={dropLabel}
        onConfirm={navigateToConfirmPickup}
        onClose={() => setTipSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapSection: {
    flex: 1,
    minHeight: 300,
    overflow: "hidden",
  },
  routeLoadingPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  routeLoadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 12,
    pointerEvents: "box-none",
    zIndex: 10,
  },
  backFab: {
    position: "absolute",
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  stopPinOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#6366F1",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  stopPinText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  mapFabCol: {
    position: "absolute",
    right: 12,
    bottom: 20,
    alignItems: "flex-end",
    gap: 10,
  },
  mapFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  mapFabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  locateFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  bottomSheet: {
    position: "relative",
    overflow: "visible",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  optionsScroll: {
    flexGrow: 0,
    maxHeight: Dimensions.get("window").height * 0.3,
  },
  optionsContent: {
    paddingBottom: 4,
  },
  pricingBannerLine: {
    paddingVertical: 5,
    paddingHorizontal: 16,
    marginBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
    borderBottomColor: "#ECECEC",
  },
  pricingBannerLineText: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    color: "#15803D",
    letterSpacing: 0,
  },
  pricingBannerInline: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ECFDF5",
  },
  pricingBannerInlineText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#047857",
  },
  optionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
  },
  optionsLoadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  rideCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#FFFFFF",
  },
  rideCardSelected: {
    borderColor: SELECTED_BORDER,
  },
  rideImage: {
    width: 56,
    height: 56,
    marginRight: 12,
  },
  rideImageSkeleton: {
    width: 56,
    height: 56,
    marginRight: 12,
    borderRadius: 10,
  },
  skelLineTitle: {
    width: "48%",
    height: 14,
    marginBottom: 8,
  },
  skelLineSub: {
    width: "62%",
    height: 11,
    marginBottom: 6,
  },
  skelLineMeta: {
    width: "78%",
    height: 10,
    marginBottom: 5,
  },
  skelLineMetaShort: {
    width: "42%",
    height: 10,
  },
  fareSkeleton: {
    width: 52,
    height: 22,
    borderRadius: 8,
  },
  fareSkeletonInline: {
    width: 52,
    height: 22,
    borderRadius: 8,
  },
  rideInfo: {
    flex: 1,
    minWidth: 0,
  },
  rideNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  rideName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  capacityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  capacityText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  fastestTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fastestText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#15803D",
    letterSpacing: 0.3,
  },
  saveTag: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  rideSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
  },
  rideTiming: {
    fontSize: 12,
    color: "#6B7280",
  },
  rideDropTiming: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  ridePriceWrap: {
    marginLeft: 8,
    minWidth: 52,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  priceCol: {
    alignItems: "flex-end",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  surgeCaret: {
    marginRight: 2,
  },
  ridePriceStrike: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  ridePrice: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  payOffersRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
    marginBottom: 6,
  },
  payOffersHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  payOffersDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: "#D1D5DB",
  },
  payOffersText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  bookBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 12,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 0,
  },
  bookBtnDisabled: {
    opacity: 0.5,
  },
  bookBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
