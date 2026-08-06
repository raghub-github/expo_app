/**
 * Pickup / Drop page – Rapido-style location inputs, optional stops (max 2), map actions.
 * Pickup defaults to user's current address; drop field is auto-focused on entry.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, InteractionManager, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { BookingRiderSheet } from "@/features/ride/BookingRiderSheet";
import { BookingForSomeoneElseSheet, FAR_PICKUP_THRESHOLD_KM } from "@/features/ride/BookingForSomeoneElseSheet";
import { ContactListSheet } from "@/features/ride/ContactListSheet";
import { ContactsPermissionModal } from "@/components/ContactsPermissionModal";
import { haversineKm } from "@/lib/billSummary";
import {
  useRideMapPickerStore,
  type RideMapPickerResult,
} from "@/store/rideMapPickerStore";
import {
  searchPlacesEnriched,
  geocodeAddressToCoord,
  resolvePlaceDisplayName,
  resolveMapboxEnrichedPlace,
  isPincodeSearchMode,
  MAPBOX_SEARCH_DEBOUNCE_MS,
  type EnrichedPlaceResult,
  type MapboxSearchSessionContext,
} from "@/services/location.service";
import { addressService } from "@/services/address.service";
import { LocationSearchResultRow } from "@/components/location/LocationSearchResultRow";
import { LocationSearchSkeleton } from "@/components/location/LocationSearchSkeleton";
import { LocationSearchEmptyState } from "@/components/location/LocationSearchEmptyState";
import {
  extractPickupCityHint,
  localSuggestionsToEnriched,
  mergeRideSearchResults,
  recentItemsToEnrichedResults,
  RIDE_SEARCH_DEBOUNCE_MS,
  RIDE_SEARCH_MIN_CHARS,
} from "@/features/ride/ride-location-search";
import { finalizeRapidoSuggestions } from "@/lib/location-search-ranking";

const SEARCH_DEBOUNCE_MS = MAPBOX_SEARCH_DEBOUNCE_MS;
const MAX_STOPS = 2;

function AddressNotFoundIllustration() {
  return (
    <View style={emptyIllustrationStyles.wrap}>
      <View style={emptyIllustrationStyles.doc}>
        <View style={emptyIllustrationStyles.docLine} />
        <View style={[emptyIllustrationStyles.docLine, emptyIllustrationStyles.docLineShort]} />
        <View style={[emptyIllustrationStyles.docLine, emptyIllustrationStyles.docLineShorter]} />
      </View>
      <View style={emptyIllustrationStyles.search}>
        <View style={emptyIllustrationStyles.lens}>
          <View style={emptyIllustrationStyles.faceEyes}>
            <View style={emptyIllustrationStyles.faceEye} />
            <View style={emptyIllustrationStyles.faceEye} />
          </View>
          <View style={emptyIllustrationStyles.faceMouth} />
        </View>
        <View style={emptyIllustrationStyles.handle} />
      </View>
    </View>
  );
}

const emptyIllustrationStyles = StyleSheet.create({
  wrap: {
    width: 120,
    height: 108,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  doc: {
    position: "absolute",
    left: 8,
    top: 6,
    width: 72,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    borderWidth: 2,
    borderColor: "#DDD6FE",
    paddingTop: 18,
    paddingHorizontal: 12,
    gap: 8,
  },
  docLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C4B5FD",
    width: "100%",
  },
  docLineShort: { width: "78%" },
  docLineShorter: { width: "55%" },
  search: {
    position: "absolute",
    right: 4,
    bottom: 0,
    alignItems: "center",
  },
  lens: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F5F3FF",
    borderWidth: 3,
    borderColor: "#A78BFA",
    alignItems: "center",
    justifyContent: "center",
  },
  faceEyes: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  faceEye: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#7C3AED",
  },
  faceMouth: {
    width: 14,
    height: 7,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: "#7C3AED",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -1,
  },
  handle: {
    width: 14,
    height: 22,
    backgroundColor: "#A78BFA",
    borderRadius: 4,
    transform: [{ rotate: "45deg" }],
    marginTop: -10,
    marginRight: -8,
  },
});

type RideStop = {
  id: string;
  text: string;
  coords: { latitude: number; longitude: number } | null;
};

type ActiveField = "pickup" | "drop" | `stop-${number}`;

function resolvePickupAddress(address: { primary?: string; fullAddress?: string } | null): string {
  return address?.fullAddress ?? address?.primary ?? "";
}

/** Reject NaN/Infinity, out-of-range, and the null-island (0,0) sentinel before using coordinates. */
function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function isUsingDevicePickup(
  pickupText: string,
  address: { primary?: string; fullAddress?: string } | null
): boolean {
  const resolved = resolvePickupAddress(address);
  if (!resolved) return false;
  return pickupText.trim() === resolved || pickupText.trim() === (address?.primary ?? "");
}

type RouteBookRestoreParams = {
  restore?: string;
  focusField?: string;
  bookingMode?: string;
  returnTo?: string;
  pickup?: string;
  drop?: string;
  pickupLabel?: string;
  dropLabel?: string;
  pickupLat?: string;
  pickupLng?: string;
  dropLat?: string;
  dropLng?: string;
  stops?: string;
};

function parseRestoreStops(stopsJson?: string): RideStop[] {
  if (!stopsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(stopsJson) as Array<{
      address?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((stop, index) => ({
      id: `stop-restore-${index}`,
      text: stop.address?.trim() ?? "",
      coords:
        stop.latitude != null &&
        stop.longitude != null &&
        Number.isFinite(stop.latitude) &&
        Number.isFinite(stop.longitude)
          ? { latitude: stop.latitude, longitude: stop.longitude }
          : null,
    }));
  } catch {
    return [];
  }
}

function isRouteBookRestore(params: RouteBookRestoreParams): boolean {
  return params.restore === "true";
}

function sessionContextForField(field: ActiveField): MapboxSearchSessionContext {
  if (field === "pickup") return "ride-pickup";
  if (field === "drop") return "ride-drop";
  return "ride-stop";
}

export default function RidePickupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<RouteBookRestoreParams>();
  const restoringFromBook = isRouteBookRestore(routeParams);
  const { address, coords } = useLocationStore();
  const addRecentLocation = useRecentLocationStore((s) => s.addRecentLocation);
  const setLastRidePickup = useRecentLocationStore((s) => s.setLastRidePickup);
  const setLastRideDrop = useRecentLocationStore((s) => s.setLastRideDrop);
  const getRecentLocationKeys = useRecentLocationStore((s) => s.getRecentLocationKeys);
  const hydrateRecentLocations = useRecentLocationStore((s) => s.hydrate);
  const recentLocationItems = useRecentLocationStore((s) => s.items);
  const hydrateFavorites = useFavoriteLocationsStore((s) => s.hydrate);
  const isFavorite = useFavoriteLocationsStore((s) => s.isFavorite);
  const toggleFavorite = useFavoriteLocationsStore((s) => s.toggleFavorite);
  const hasCoords = coords?.latitude != null && coords?.longitude != null;

  const dropInputRef = useRef<TextInput>(null);
  const pickupInputRef = useRef<TextInput>(null);
  const stopInputRefs = useRef<Record<string, TextInput | null>>({});
  const userEditedPickupRef = useRef(restoringFromBook);
  const pickupCityGeocodeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Monotonic token for location selections. Each pickup/drop/stop tap bumps it;
   * an async reverse-resolve only commits if its token is still current. This kills
   * the "coords from one place, text from another" race when the user taps results
   * rapidly or a slower network response lands after a newer selection.
   */
  const selectSeqRef = useRef(0);
  const navigatingToBookRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  /** Stop any pending/in-flight suggestion fetch so a stale result can't clobber a fresh selection. */
  const cancelInFlightSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    searchAbortRef.current?.abort();
  }, []);

  const [pickupText, setPickupText] = useState(() =>
    restoringFromBook && routeParams.pickup?.trim()
      ? routeParams.pickup.trim()
      : resolvePickupAddress(address)
  );
  const [dropText, setDropText] = useState(() =>
    restoringFromBook && routeParams.drop?.trim() ? routeParams.drop.trim() : ""
  );
  const [stops, setStops] = useState<RideStop[]>(() =>
    restoringFromBook ? parseRestoreStops(routeParams.stops) : []
  );
  const [someoneElseSheetVisible, setSomeoneElseSheetVisible] = useState(false);
  const [riderSheetVisible, setRiderSheetVisible] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("myself");
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestPhone, setGuestPhone] = useState<string | null>(null);
  const [farPickupPromptShown, setFarPickupPromptShown] = useState(false);
  const [farPickupAcknowledged, setFarPickupAcknowledged] = useState(false);
  const [pickupDistanceFromBookerKm, setPickupDistanceFromBookerKm] = useState<number | null>(null);
  const [contactsPermissionModalVisible, setContactsPermissionModalVisible] = useState(false);
  const [contactListVisible, setContactListVisible] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState<EnrichedPlaceResult[]>([]);
  const [dropSuggestions, setDropSuggestions] = useState<EnrichedPlaceResult[]>([]);
  const [stopSuggestions, setStopSuggestions] = useState<EnrichedPlaceResult[]>([]);
  const [pickupSuggestionsLoading, setPickupSuggestionsLoading] = useState(false);
  const [dropSuggestionsLoading, setDropSuggestionsLoading] = useState(false);
  const [stopSuggestionsLoading, setStopSuggestionsLoading] = useState(false);
  const [pickupCityCoords, setPickupCityCoords] = useState<{ longitude: number; latitude: number } | null>(null);
  const [activeField, setActiveField] = useState<ActiveField>("drop");
  const activeFieldRef = useRef<ActiveField>("drop");

  useEffect(() => {
    activeFieldRef.current = activeField;
  }, [activeField]);
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number } | null>(
    () => {
      if (restoringFromBook && routeParams.pickupLat && routeParams.pickupLng) {
        const lat = Number(routeParams.pickupLat);
        const lng = Number(routeParams.pickupLng);
        if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
      }
      if (hasCoords && isValidLatLng(coords!.latitude, coords!.longitude)) {
        return { latitude: coords!.latitude!, longitude: coords!.longitude! };
      }
      return null;
    }
  );
  const [dropCoords, setDropCoords] = useState<{ latitude: number; longitude: number } | null>(() => {
    if (restoringFromBook && routeParams.dropLat && routeParams.dropLng) {
      const lat = Number(routeParams.dropLat);
      const lng = Number(routeParams.dropLng);
      if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
    }
    return null;
  });
  const [pickupPlaceLabel, setPickupPlaceLabel] = useState(() => {
    if (restoringFromBook && routeParams.pickupLabel?.trim()) {
      return resolvePlaceDisplayName({
        primary: routeParams.pickupLabel,
        fullAddress: routeParams.pickup,
      });
    }
    return resolvePlaceDisplayName({
      primary: address?.primary,
      fullAddress: address?.fullAddress,
    });
  });
  const [dropPlaceLabel, setDropPlaceLabel] = useState(() =>
    restoringFromBook && routeParams.dropLabel?.trim() ? routeParams.dropLabel.trim() : ""
  );
  const [activeStopQuery, setActiveStopQuery] = useState("");

  const applyDefaultPickup = useCallback(() => {
    if (userEditedPickupRef.current) return;
    const label = resolvePickupAddress(address);
    if (label) {
      setPickupText((prev) => (prev === label ? prev : label));
    }
    if (hasCoords) {
      const lat = coords!.latitude!;
      const lng = coords!.longitude!;
      setPickupCoords((prev) =>
        prev?.latitude === lat && prev?.longitude === lng ? prev : { latitude: lat, longitude: lng }
      );
    }
  }, [address?.primary, address?.fullAddress, hasCoords, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    hydrateRecentLocations();
    void hydrateFavorites();
  }, [hydrateRecentLocations, hydrateFavorites]);

  useEffect(() => {
    if (restoringFromBook) return;
    applyDefaultPickup();
  }, [applyDefaultPickup, restoringFromBook]);

  const applyDefaultPickupRef = useRef(applyDefaultPickup);
  applyDefaultPickupRef.current = applyDefaultPickup;

  const lastRestoreKeyRef = useRef("");
  const routeParamsRef = useRef(routeParams);
  routeParamsRef.current = routeParams;
  const didAutoFocusOnVisitRef = useRef(false);

  const applyRouteBookRestore = useCallback(() => {
    const params = routeParamsRef.current;
    if (!isRouteBookRestore(params)) return false;

    if (params.pickup?.trim()) {
      setPickupText(params.pickup.trim());
      userEditedPickupRef.current = true;
    }
    if (params.pickupLat && params.pickupLng) {
      setPickupCoords({
        latitude: Number(params.pickupLat),
        longitude: Number(params.pickupLng),
      });
    }
    if (params.drop?.trim()) {
      setDropText(params.drop.trim());
    }
    if (params.dropLat && params.dropLng) {
      setDropCoords({
        latitude: Number(params.dropLat),
        longitude: Number(params.dropLng),
      });
    }

    const restoredStops = parseRestoreStops(params.stops);
    setStops(restoredStops);

    const focusField = params.focusField;

    if (focusField === "add-stop") {
      if (restoredStops.length < MAX_STOPS) {
        const newId = `stop-${Date.now()}`;
        const newIndex = restoredStops.length;
        setStops([...restoredStops, { id: newId, text: "", coords: null }]);
        setActiveField(`stop-${newIndex}`);
        setActiveStopQuery("");
        setTimeout(() => stopInputRefs.current[newId]?.focus(), 150);
      } else {
        setActiveField("drop");
      }
      return true;
    }

    if (focusField === "pickup") {
      setActiveField("pickup");
      setTimeout(() => pickupInputRef.current?.focus(), 150);
      return true;
    }

    if (focusField === "drop") {
      setActiveField("drop");
      setTimeout(() => dropInputRef.current?.focus(), 150);
      return true;
    }

    // Default restore: if pickup empty but drop set, focus pickup for editing.
    if (!params.pickup?.trim() && params.drop?.trim()) {
      setActiveField("pickup");
      setTimeout(() => pickupInputRef.current?.focus(), 150);
    } else {
      setActiveField("drop");
      setTimeout(() => dropInputRef.current?.focus(), 150);
    }
    return true;
  }, []);

  const applyRouteBookRestoreRef = useRef(applyRouteBookRestore);
  applyRouteBookRestoreRef.current = applyRouteBookRestore;

  const consumeRideMapPickerResult = useRideMapPickerStore((s) => s.consumePendingResult);

  const handlePickupChange = (text: string) => {
    userEditedPickupRef.current = true;
    setPickupText(text);
  };

  const clearPickup = () => {
    userEditedPickupRef.current = true;
    selectSeqRef.current++; // invalidate any in-flight resolve so it can't refill the field
    cancelInFlightSearch();
    setPickupText("");
    setPickupCoords(null);
    setPickupPlaceLabel("");
    setTimeout(() => pickupInputRef.current?.focus(), 0);
  };

  const clearDrop = () => {
    selectSeqRef.current++;
    cancelInFlightSearch();
    setDropText("");
    setDropCoords(null);
    setDropPlaceLabel("");
    setTimeout(() => dropInputRef.current?.focus(), 0);
  };

  const displayRiderLabel = selectedRiderId === "myself" ? "For me" : guestName ? guestName : "Add a guest";
  const headerTitle =
    activeField === "drop" || activeField.startsWith("stop-") ? "Drop" : "Pickup";
  const canAddMoreStops = stops.length < MAX_STOPS;

  const handleAddGuest = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      setContactsPermissionModalVisible(true);
      return;
    }
    setRiderSheetVisible(false);
    setContactListVisible(true);
  };

  const handleSelectContact = (name: string, phone?: string) => {
    setGuestName(name);
    setGuestPhone(phone ?? null);
    setSelectedRiderId("guest");
  };

  const isPickupFarFromUser = useCallback(
    (pickupLat: number, pickupLng: number) => {
      if (selectedRiderId !== "myself") return false;
      if (coords?.latitude == null || coords?.longitude == null) return false;
      const km = haversineKm(coords.latitude, coords.longitude, pickupLat, pickupLng);
      return km >= FAR_PICKUP_THRESHOLD_KM;
    },
    [coords?.latitude, coords?.longitude, selectedRiderId]
  );

  const navigateToRideBook = useCallback(
    async (
      dropLabel: string,
      dropCoord?: { latitude: number; longitude: number },
      dropLabelPrimary?: string
    ) => {
      if (navigatingToBookRef.current) return;

      if (!isValidLatLng(dropCoord?.latitude, dropCoord?.longitude)) {
        Alert.alert(
          "Drop location required",
          "Select drop from search or map so we can save exact coordinates."
        );
        return;
      }

      let resolvedPickup: { latitude: number; longitude: number } | null = isValidLatLng(
        pickupCoords?.latitude,
        pickupCoords?.longitude
      )
        ? pickupCoords
        : isValidLatLng(coords?.latitude, coords?.longitude)
          ? { latitude: coords!.latitude!, longitude: coords!.longitude! }
          : null;

      if (!resolvedPickup) {
        const pickupAddr = pickupText.trim() || resolvePickupAddress(address);
        if (pickupAddr) {
          try {
            const geocoded = await geocodeAddressToCoord(pickupAddr);
            if (isValidLatLng(geocoded?.latitude, geocoded?.longitude)) {
              resolvedPickup = { latitude: geocoded!.latitude, longitude: geocoded!.longitude };
              setPickupCoords(resolvedPickup);
            }
          } catch {
            // best-effort — alert below if still missing
          }
        }
      }

      if (!resolvedPickup) {
        Alert.alert(
          "Pickup location required",
          "Select pickup from search or map so we can save exact coordinates."
        );
        return;
      }

      const stopsMissingCoords = stops.filter((s) => s.text.trim() && !s.coords);
      if (stopsMissingCoords.length > 0) {
        Alert.alert(
          "Stop location required",
          "Select each stop from search or map before continuing."
        );
        return;
      }

      const pickup = pickupText.trim() || resolvePickupAddress(address);
      const params: Record<string, string> = { pickup, drop: dropLabel };
      params.pickupLabel = resolvePlaceDisplayName({
        primary: pickupPlaceLabel.trim() || address?.primary,
        fullAddress: pickup,
      });
      params.dropLabel =
        dropLabelPrimary?.trim() ||
        dropPlaceLabel.trim() ||
        resolvePlaceDisplayName({ primary: dropLabel, fullAddress: dropLabel });
      params.pickupLat = String(resolvedPickup.latitude);
      params.pickupLng = String(resolvedPickup.longitude);
      params.dropLat = String(dropCoord.latitude);
      params.dropLng = String(dropCoord.longitude);
      const filledStops = stops
        .filter((s) => s.text.trim() && s.coords)
        .map((s, index) => ({
          sequence: index + 1,
          address: s.text.trim(),
          latitude: s.coords!.latitude,
          longitude: s.coords!.longitude,
        }));
      if (filledStops.length > 0) {
        params.stops = JSON.stringify(filledStops);
      }
      params.bookedForSelf = selectedRiderId === "myself" ? "true" : "false";
      if (guestName) params.passengerName = guestName;
      if (guestPhone) params.passengerPhone = guestPhone;
      if (farPickupPromptShown) params.farPickupPromptShown = "true";
      if (farPickupAcknowledged) params.farPickupAcknowledged = "true";
      if (pickupDistanceFromBookerKm != null) {
        params.pickupDistanceFromBookerKm = String(pickupDistanceFromBookerKm);
      }

      const isIntercityReturn =
        routeParams.bookingMode === "intercity" && routeParams.returnTo === "ride";

      navigatingToBookRef.current = true;
      Keyboard.dismiss();

      const go = () => {
        try {
          if (isIntercityReturn) {
            router.replace({
              pathname: "/home/service/ride",
              params: { ...params, tab: "intercity" },
            });
          } else {
            router.replace({ pathname: "/home/service/ride-book", params });
          }
        } catch {
          navigatingToBookRef.current = false;
          Alert.alert("Could not open ride options", "Please try again.");
        }
      };

      InteractionManager.runAfterInteractions(go);
    },
    [
      pickupText,
      pickupCoords,
      pickupPlaceLabel,
      dropPlaceLabel,
      stops,
      address,
      coords?.latitude,
      coords?.longitude,
      selectedRiderId,
      guestName,
      guestPhone,
      farPickupPromptShown,
      farPickupAcknowledged,
      pickupDistanceFromBookerKm,
      routeParams.bookingMode,
      routeParams.returnTo,
      router,
    ]
  );

  const applyMapPickerResult = useCallback(
    (result: RideMapPickerResult) => {
      addRecentLocation({
        latitude: result.latitude,
        longitude: result.longitude,
        primary: result.primary,
        fullAddress: result.fullAddress,
      });

      if (result.field === "pickup") {
        userEditedPickupRef.current = true;
        setPickupPlaceLabel(result.primary?.trim() || "");
        setPickupText(result.fullAddress);
        setPickupCoords({ latitude: result.latitude, longitude: result.longitude });
        if (isPickupFarFromUser(result.latitude, result.longitude) && coords) {
          const km = haversineKm(
            coords.latitude,
            coords.longitude,
            result.latitude,
            result.longitude
          );
          setPickupDistanceFromBookerKm(km);
          setFarPickupPromptShown(true);
          setFarPickupAcknowledged(false);
          setSomeoneElseSheetVisible(true);
        }
        setActiveField("drop");
        setTimeout(() => dropInputRef.current?.focus(), 150);
        return;
      }

      if (result.field === "drop") {
        setDropPlaceLabel(result.primary?.trim() || "");
        setDropText(result.fullAddress);
        setDropCoords({ latitude: result.latitude, longitude: result.longitude });
        if (stops.length === 0) {
          void navigateToRideBook(
            result.fullAddress,
            { latitude: result.latitude, longitude: result.longitude },
            result.primary
          );
        }
        return;
      }

      if (result.field === "stop" && result.stopIndex != null) {
        setStops((prev) =>
          prev.map((s, i) =>
            i === result.stopIndex
              ? {
                  ...s,
                  text: result.fullAddress,
                  coords: { latitude: result.latitude, longitude: result.longitude },
                }
              : s
          )
        );
        setActiveField("drop");
        setActiveStopQuery("");
        setTimeout(() => dropInputRef.current?.focus(), 150);
      }
    },
    [addRecentLocation, isPickupFarFromUser, coords, navigateToRideBook, stops.length]
  );

  const applyMapPickerResultRef = useRef(applyMapPickerResult);
  applyMapPickerResultRef.current = applyMapPickerResult;

  const openMapPicker = useCallback(() => {
    const isStop = activeField.startsWith("stop-");
    const field = isStop ? "stop" : activeField === "pickup" ? "pickup" : "drop";
    const stopIndex = isStop ? Number(activeField.replace("stop-", "")) : undefined;

    const fallbackLat = coords?.latitude ?? pickupCoords?.latitude ?? 20.5937;
    const fallbackLng = coords?.longitude ?? pickupCoords?.longitude ?? 78.9629;

    let lat = fallbackLat;
    let lng = fallbackLng;
    let primary = "";
    let fullAddress = "";

    if (field === "pickup") {
      if (pickupCoords) {
        lat = pickupCoords.latitude;
        lng = pickupCoords.longitude;
      }
      primary = address?.primary ?? "Your location";
      fullAddress = pickupText || resolvePickupAddress(address);
    } else if (field === "drop") {
      if (dropCoords) {
        lat = dropCoords.latitude;
        lng = dropCoords.longitude;
      } else if (pickupCoords) {
        lat = pickupCoords.latitude;
        lng = pickupCoords.longitude;
      }
      fullAddress = dropText;
    } else if (field === "stop" && stopIndex != null) {
      const stop = stops[stopIndex];
      if (stop?.coords) {
        lat = stop.coords.latitude;
        lng = stop.coords.longitude;
      } else if (pickupCoords) {
        lat = pickupCoords.latitude;
        lng = pickupCoords.longitude;
      }
      fullAddress = stop?.text ?? "";
    }

    router.push({
      pathname: "/home/service/ride-map",
      params: {
        field,
        latitude: String(lat),
        longitude: String(lng),
        ...(primary ? { primary } : {}),
        ...(fullAddress ? { fullAddress } : {}),
        ...(stopIndex != null && !Number.isNaN(stopIndex) ? { stopIndex: String(stopIndex) } : {}),
      },
    });
  }, [
    activeField,
    coords?.latitude,
    coords?.longitude,
    pickupCoords,
    dropCoords,
    stops,
    pickupText,
    dropText,
    address,
    router,
  ]);

  useFocusEffect(
    useCallback(() => {
      const params = routeParamsRef.current;
      const mapResult = consumeRideMapPickerResult();
      if (mapResult) {
        applyMapPickerResultRef.current(mapResult);
        return;
      }

      if (isRouteBookRestore(params)) {
        const restoreKey = [
          params.pickup,
          params.drop,
          params.pickupLat,
          params.pickupLng,
          params.dropLat,
          params.dropLng,
          params.stops,
          params.focusField,
        ].join("|");

        if (lastRestoreKeyRef.current !== restoreKey) {
          lastRestoreKeyRef.current = restoreKey;
          didAutoFocusOnVisitRef.current = true;
          applyRouteBookRestoreRef.current();
        }
        return;
      }

      lastRestoreKeyRef.current = "";

      if (!didAutoFocusOnVisitRef.current) {
        didAutoFocusOnVisitRef.current = true;
        applyDefaultPickupRef.current();
        setActiveField("drop");
        activeFieldRef.current = "drop";
        const timer = setTimeout(() => {
          if (activeFieldRef.current === "drop") {
            dropInputRef.current?.focus();
          }
        }, 350);
        return () => clearTimeout(timer);
      }

      return undefined;
    }, [consumeRideMapPickerResult])
  );

  useFocusEffect(
    useCallback(() => {
      navigatingToBookRef.current = false;
      return () => {
        didAutoFocusOnVisitRef.current = false;
        lastRestoreKeyRef.current = "";
      };
    }, [])
  );

  const handlePickupSelect = useCallback(
    async (loc: EnrichedPlaceResult) => {
      const seq = ++selectSeqRef.current;
      cancelInFlightSearch();
      userEditedPickupRef.current = true;

      // Optimistic: the tapped result is the single source of truth. Reflect it in the
      // field immediately (before the network reverse-resolve) so the UI never shows a
      // stale/other address, then move focus to drop.
      const tappedLabel = loc.primary?.trim() || "";
      const tappedText = loc.fullAddress?.trim() || loc.primary?.trim() || "";
      setPickupPlaceLabel(tappedLabel);
      if (tappedText) setPickupText(tappedText);
      if (isValidLatLng(loc.latitude, loc.longitude)) {
        setPickupCoords({ latitude: loc.latitude, longitude: loc.longitude });
      }
      setActiveField("drop");

      const resolved = await resolveMapboxEnrichedPlace(loc, "ride-pickup");
      if (seq !== selectSeqRef.current) return; // superseded by a newer selection

      const finalCoords = isValidLatLng(resolved.latitude, resolved.longitude)
        ? { latitude: resolved.latitude, longitude: resolved.longitude }
        : isValidLatLng(loc.latitude, loc.longitude)
          ? { latitude: loc.latitude, longitude: loc.longitude }
          : null;
      const finalText = resolved.fullAddress?.trim() || tappedText;
      const finalLabel = resolved.primary?.trim() || tappedLabel;

      if (finalCoords) {
        setLastRidePickup({ ...finalCoords, primary: finalLabel, fullAddress: finalText });
        addRecentLocation({ ...finalCoords, primary: finalLabel, fullAddress: finalText, kind: "pickup" });
        setPickupCoords(finalCoords);
      }
      setPickupPlaceLabel(finalLabel);
      setPickupText(finalText);

      if (finalCoords && isPickupFarFromUser(finalCoords.latitude, finalCoords.longitude)) {
        const km = haversineKm(coords!.latitude!, coords!.longitude!, finalCoords.latitude, finalCoords.longitude);
        setPickupDistanceFromBookerKm(km);
        setFarPickupPromptShown(true);
        setFarPickupAcknowledged(false);
        setSomeoneElseSheetVisible(true);
      }
      setTimeout(() => {
        if (seq === selectSeqRef.current) dropInputRef.current?.focus();
      }, 100);
    },
    [addRecentLocation, setLastRidePickup, isPickupFarFromUser, coords?.latitude, coords?.longitude, cancelInFlightSearch]
  );

  const handleDropSelect = useCallback(
    async (loc: EnrichedPlaceResult) => {
      const seq = ++selectSeqRef.current;
      cancelInFlightSearch();

      try {
        // Optimistic single-source-of-truth update (see handlePickupSelect).
        const tappedLabel = loc.primary?.trim() || "";
        const tappedText = loc.fullAddress?.trim() || loc.primary?.trim() || "";
        setDropPlaceLabel(tappedLabel);
        if (tappedText) setDropText(tappedText);
        if (isValidLatLng(loc.latitude, loc.longitude)) {
          setDropCoords({ latitude: loc.latitude, longitude: loc.longitude });
        }

        const resolved = await resolveMapboxEnrichedPlace(loc, "ride-drop");
        if (seq !== selectSeqRef.current) return; // superseded by a newer selection

        const finalCoords = isValidLatLng(resolved.latitude, resolved.longitude)
          ? { latitude: resolved.latitude, longitude: resolved.longitude }
          : isValidLatLng(loc.latitude, loc.longitude)
            ? { latitude: loc.latitude, longitude: loc.longitude }
            : null;
        const finalText = resolved.fullAddress?.trim() || tappedText;
        const finalLabel = resolved.primary?.trim() || tappedLabel;

        if (finalCoords) {
          setLastRideDrop({ ...finalCoords, primary: finalLabel, fullAddress: finalText });
          addRecentLocation({
            ...finalCoords,
            primary: finalLabel,
            fullAddress: finalText,
            kind: "drop",
          });
          setDropCoords(finalCoords);
        }
        setDropPlaceLabel(finalLabel);
        setDropText(finalText);

        if (stops.length === 0 && finalCoords) {
          await navigateToRideBook(finalText, finalCoords, finalLabel);
        }
      } catch {
        Alert.alert(
          "Could not set drop location",
          "Please try again or select the location on the map."
        );
      }
    },
    [addRecentLocation, setLastRideDrop, navigateToRideBook, stops.length, cancelInFlightSearch]
  );

  const handleConfirm = useCallback(() => {
    const pickup = pickupText.trim();
    const drop = dropText.trim();
    if (!pickup || !drop) return;
    if (stops.some((s) => !s.text.trim())) return;
    void navigateToRideBook(drop, dropCoords ?? undefined, dropPlaceLabel.trim() || undefined);
  }, [pickupText, dropText, dropCoords, dropPlaceLabel, stops, navigateToRideBook]);

  const handleStopSelect = useCallback(
    async (stopIndex: number, loc: EnrichedPlaceResult) => {
      const seq = ++selectSeqRef.current;
      cancelInFlightSearch();

      // Optimistic: reflect the tapped stop immediately.
      const tappedText = loc.fullAddress?.trim() || loc.primary?.trim() || "";
      if (tappedText || isValidLatLng(loc.latitude, loc.longitude)) {
        setStops((prev) =>
          prev.map((s, i) =>
            i === stopIndex
              ? {
                  ...s,
                  text: tappedText || s.text,
                  coords: isValidLatLng(loc.latitude, loc.longitude)
                    ? { latitude: loc.latitude, longitude: loc.longitude }
                    : s.coords,
                }
              : s
          )
        );
      }
      setActiveField("drop");
      setActiveStopQuery("");

      const resolved = await resolveMapboxEnrichedPlace(loc, "ride-stop");
      if (seq !== selectSeqRef.current) return; // superseded

      const finalCoords = isValidLatLng(resolved.latitude, resolved.longitude)
        ? { latitude: resolved.latitude, longitude: resolved.longitude }
        : isValidLatLng(loc.latitude, loc.longitude)
          ? { latitude: loc.latitude, longitude: loc.longitude }
          : null;
      const finalText = resolved.fullAddress?.trim() || tappedText;

      if (finalCoords) {
        addRecentLocation({ ...finalCoords, primary: resolved.primary, fullAddress: finalText });
      }
      setStops((prev) =>
        prev.map((s, i) =>
          i === stopIndex ? { ...s, text: finalText, coords: finalCoords ?? s.coords } : s
        )
      );
      setTimeout(() => {
        if (seq === selectSeqRef.current) dropInputRef.current?.focus();
      }, 100);
    },
    [addRecentLocation, cancelInFlightSearch]
  );

  const handleAddStop = () => {
    if (!canAddMoreStops) return;
    const id = `stop-${Date.now()}`;
    const newIndex = stops.length;
    setStops((prev) => [...prev, { id, text: "", coords: null }]);
    setActiveField(`stop-${newIndex}`);
    setActiveStopQuery("");
    setTimeout(() => stopInputRefs.current[id]?.focus(), 150);
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
    if (activeField === `stop-${index}`) {
      setActiveField("drop");
      setActiveStopQuery("");
    }
  };

  const handleYesSomeoneElse = async () => {
    setSomeoneElseSheetVisible(false);
    setFarPickupAcknowledged(false);
    setSelectedRiderId("guest");
    await handleAddGuest();
  };

  const handleNoBookingForMe = () => {
    setSomeoneElseSheetVisible(false);
    setFarPickupAcknowledged(true);
    setSelectedRiderId("myself");
    setGuestName(null);
    setGuestPhone(null);
  };

  const resolveDropSearchAnchor = useCallback((): { longitude: number; latitude: number } | null => {
    if (pickupCoords) {
      return { longitude: pickupCoords.longitude, latitude: pickupCoords.latitude };
    }
    if (pickupCityCoords) return pickupCityCoords;
    if (hasCoords && coords) {
      return { longitude: coords.longitude, latitude: coords.latitude };
    }
    return null;
  }, [pickupCoords, pickupCityCoords, hasCoords, coords?.latitude, coords?.longitude]);

  const resolvePickupSearchAnchor = useCallback((): { longitude: number; latitude: number } | null => {
    if (hasCoords && coords) {
      return { longitude: coords.longitude, latitude: coords.latitude };
    }
    if (pickupCoords) {
      return { longitude: pickupCoords.longitude, latitude: pickupCoords.latitude };
    }
    return null;
  }, [hasCoords, coords?.latitude, coords?.longitude, pickupCoords]);

  const runRideLocationSearch = useCallback(
    async (
      query: string,
      field: ActiveField,
      signal: AbortSignal
    ): Promise<EnrichedPlaceResult[]> => {
      const trimmed = query.trim();
      const isPincode = isPincodeSearchMode(trimmed);
      const minChars = isPincode ? 6 : RIDE_SEARCH_MIN_CHARS;
      const proximity =
        field === "pickup" ? resolvePickupSearchAnchor() : resolveDropSearchAnchor();
      const proximityOpt = proximity ?? undefined;
      const recentKeys = getRecentLocationKeys();
      const getLocal = (q: string) => addressService.getLocationSearchSuggestions(q, 12);

      if (trimmed.length > 0 && trimmed.length < minChars) {
        return [];
      }

      const sessionContext = sessionContextForField(field);

      if (trimmed.length === 0) {
        const recent = recentItemsToEnrichedResults(recentLocationItems, proximityOpt ?? undefined);
        const browseHint = extractPickupCityHint(
          field === "pickup" ? pickupText || resolvePickupAddress(address) : pickupText
        );
        if (!proximityOpt || browseHint.length < 2) {
          return recent;
        }
        const browseResults = await searchPlacesEnriched(browseHint, {
          signal,
          proximity: proximityOpt,
          sessionContext,
          recentLocationKeys: recentKeys,
          getLocalSuggestions: getLocal,
        });
        return finalizeRapidoSuggestions(
          mergeRideSearchResults(recent, browseResults),
          browseHint
        );
      }

      let results = await searchPlacesEnriched(trimmed, {
        signal,
        proximity: proximityOpt,
        sessionContext,
        recentLocationKeys: recentKeys,
        getLocalSuggestions: getLocal,
      });

      if (results.length === 0 && !isPincode) {
        try {
          const local = await getLocal(trimmed);
          if (signal.aborted) return [];
          if (local.length > 0) {
            results = localSuggestionsToEnriched(local, proximityOpt ?? undefined);
          }
        } catch {
          // keep empty
        }
      }

      return finalizeRapidoSuggestions(results, trimmed);
    },
    [
      getRecentLocationKeys,
      pickupText,
      address,
      recentLocationItems,
      resolveDropSearchAnchor,
      resolvePickupSearchAnchor,
    ]
  );

  useEffect(() => {
    if (pickupCoords) {
      setPickupCityCoords({
        longitude: pickupCoords.longitude,
        latitude: pickupCoords.latitude,
      });
    }
  }, [pickupCoords?.latitude, pickupCoords?.longitude]);

  useEffect(() => {
    if (pickupCoords) return;
    if (pickupCityGeocodeRef.current) clearTimeout(pickupCityGeocodeRef.current);
    const text = pickupText.trim();
    if (!text || isUsingDevicePickup(text, address)) {
      if (hasCoords) {
        setPickupCityCoords({ longitude: coords!.longitude!, latitude: coords!.latitude! });
      } else {
        setPickupCityCoords(null);
      }
      return;
    }
    pickupCityGeocodeRef.current = setTimeout(() => {
      pickupCityGeocodeRef.current = null;
      geocodeAddressToCoord(text)
        .then((c) => setPickupCityCoords(c ?? null))
        .catch(() => setPickupCityCoords(null));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (pickupCityGeocodeRef.current) clearTimeout(pickupCityGeocodeRef.current);
    };
  }, [pickupText, pickupCoords, address?.primary, address?.fullAddress, coords?.latitude, coords?.longitude, hasCoords]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const setSuggestionsForField = (
      field: ActiveField,
      results: EnrichedPlaceResult[],
      loading: boolean
    ) => {
      if (field === "pickup") {
        setPickupSuggestions(results);
        setPickupSuggestionsLoading(loading);
      } else if (field === "drop") {
        setDropSuggestions(results);
        setDropSuggestionsLoading(loading);
      } else {
        setStopSuggestions(results);
        setStopSuggestionsLoading(loading);
      }
    };

    const clearInactiveFields = (field: ActiveField) => {
      if (field !== "pickup") {
        setPickupSuggestions([]);
        setPickupSuggestionsLoading(false);
      }
      if (field !== "drop") {
        setDropSuggestions([]);
        setDropSuggestionsLoading(false);
      }
      if (!field.startsWith("stop-")) {
        setStopSuggestions([]);
        setStopSuggestionsLoading(false);
      }
    };

    const field = activeField;
    clearInactiveFields(field);

    const query =
      field === "pickup"
        ? pickupText.trim()
        : field === "drop"
          ? dropText.trim()
          : activeStopQuery.trim();

    if (field === "pickup" && isUsingDevicePickup(pickupText, address)) {
      setPickupSuggestions([]);
      setPickupSuggestionsLoading(false);
      return;
    }

    if (field !== "pickup" && !resolveDropSearchAnchor()) {
      setSuggestionsForField(field, [], false);
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSuggestionsForField(field, [], true);

      runRideLocationSearch(query, field, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setSuggestionsForField(field, results, false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestionsForField(field, [], false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, [
    activeField,
    pickupText,
    dropText,
    activeStopQuery,
    address,
    pickupCoords,
    pickupCityCoords,
    resolveDropSearchAnchor,
    runRideLocationSearch,
  ]);

  const activeStopIndex = activeField.startsWith("stop-")
    ? Number(activeField.replace("stop-", ""))
    : -1;

  const activeSuggestions =
    activeField === "drop"
      ? dropSuggestions
      : activeField === "pickup"
        ? pickupSuggestions
        : stopSuggestions;

  const activeLoading =
    activeField === "drop"
      ? dropSuggestionsLoading
      : activeField === "pickup"
        ? pickupSuggestionsLoading
        : stopSuggestionsLoading;

  const activeQuery =
    activeField === "pickup"
      ? pickupText.trim()
      : activeField === "drop"
        ? dropText.trim()
        : activeStopQuery.trim();
  const activeMinChars = isPincodeSearchMode(activeQuery) ? 6 : RIDE_SEARCH_MIN_CHARS;
  const queryReadyForSearch = activeQuery.length >= activeMinChars;

  const showEmptyState =
    !activeLoading && activeSuggestions.length === 0 && queryReadyForSearch;
  const hasStops = stops.length > 0;
  const showSuggestionsSection =
    activeLoading || activeSuggestions.length > 0 || (activeQuery.length === 0 && !activeLoading);
  const showStopsInfoPanel = hasStops && !showSuggestionsSection;
  const allStopsFilled = stops.every((s) => s.text.trim());
  const pickupFilled = Boolean(pickupText.trim());
  const dropFilled = Boolean(dropText.trim());
  const showConfirmFooter =
    (pickupFilled && dropFilled && !hasStops) ||
    (hasStops && pickupFilled && dropFilled);
  const canConfirm = hasStops
    ? pickupFilled && dropFilled && allStopsFilled
    : pickupFilled && dropFilled;
  // Clear (X) only on the focused row when it has text — not on empty or inactive rows.
  const showPickupClear = activeField === "pickup" && pickupText.trim().length > 0;
  const showDropClear = activeField === "drop" && dropText.trim().length > 0;

  const formatDistance = (loc: EnrichedPlaceResult) => {
    const anchor =
      activeField === "pickup" ? resolvePickupSearchAnchor() : resolveDropSearchAnchor();
    const distanceSuffix =
      activeField === "drop"
        ? pickupCoords
          ? "from pickup"
          : hasCoords
            ? "from current location"
            : null
        : hasCoords
          ? "from current location"
          : null;

    let km: number | null = null;
    if (loc.distanceKm != null && Number.isFinite(loc.distanceKm)) {
      km = loc.distanceKm;
    } else if (anchor && loc.latitude && loc.longitude) {
      const straight = haversineKm(anchor.latitude, anchor.longitude, loc.latitude, loc.longitude);
      km = Number.isFinite(straight) ? straight : null;
    }
    if (km == null) return null;

    const distanceText = km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km * 10) / 10} km`;
    return distanceSuffix ? `${distanceText} ${distanceSuffix}` : distanceText;
  };

  const renderSuggestionRow = (
    loc: EnrichedPlaceResult,
    kind: "pickup" | "drop" | "stop",
    stopIndex?: number
  ) => {
    const primary = resolvePlaceDisplayName(loc);
    return (
    <LocationSearchResultRow
      key={`${kind}-${loc.fullAddress}-${loc.mapboxSuggestion?.mapbox_id ?? loc.latitude}`}
      item={loc}
      query={activeQuery}
      distanceLabel={formatDistance(loc)}
      onPress={() => {
        if (kind === "pickup") void handlePickupSelect(loc);
        else if (kind === "drop") void handleDropSelect(loc);
        else if (stopIndex != null) void handleStopSelect(stopIndex, loc);
      }}
      favorited={isFavorite(loc.latitude, loc.longitude, primary)}
      onToggleFavorite={() =>
        toggleFavorite({
          latitude: loc.latitude,
          longitude: loc.longitude,
          primary,
          fullAddress: loc.fullAddress,
        })
      }
    />
    );
  };

  const renderConnectorSegment = () => (
    <View style={styles.connectorSegment}>
      <View style={styles.connectorLine} />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 4 : 8 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </AppText>
          <TouchableOpacity
            style={styles.forMeBtn}
            onPress={() => setRiderSheetVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Booking for"
          >
            <AppText style={styles.forMeText} numberOfLines={1}>
              {displayRiderLabel}
            </AppText>
            <Ionicons name="chevron-down" size={14} color="#111827" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + (showConfirmFooter ? 96 : 40) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.inputCard, stops.length > 0 && styles.inputCardExpanded]}>
            {/* Pickup row */}
            <View style={styles.locationRow}>
              <View style={styles.rowIconCol}>
                <View style={styles.dotPickupRing}>
                  <View style={styles.dotPickupInner} />
                </View>
                {renderConnectorSegment()}
              </View>
              <View style={styles.rowInputCol}>
                <View style={styles.inputRow}>
                  <TextInput
                    ref={pickupInputRef}
                    style={[styles.input, styles.inputFilled]}
                    placeholder="Pickup location"
                    placeholderTextColor="#A3A3A3"
                    value={pickupText}
                    onChangeText={handlePickupChange}
                    onFocus={() => {
                      activeFieldRef.current = "pickup";
                      setActiveField("pickup");
                    }}
                    returnKeyType="next"
                  />
                  {showPickupClear ? (
                    <TouchableOpacity onPress={clearPickup} hitSlop={12} style={styles.clearBtn}>
                      <Ionicons name="close-circle" size={18} color="#A3A3A3" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Stop rows */}
            {stops.map((stop, index) => (
              <View key={stop.id}>
                <View style={styles.fieldDivider} />
                <View style={styles.locationRow}>
                  <View style={styles.rowIconCol}>
                    <View style={styles.stopDiamond}>
                      <AppText style={styles.stopDiamondText}>{index + 1}</AppText>
                    </View>
                    {renderConnectorSegment()}
                  </View>
                  <View style={styles.rowInputCol}>
                    <View style={styles.inputRow}>
                      <TextInput
                        ref={(r) => {
                          stopInputRefs.current[stop.id] = r;
                        }}
                        style={styles.input}
                        placeholder="Add Stop"
                        placeholderTextColor="#94A3B8"
                        value={stop.text}
                        onChangeText={(text) => {
                          setStops((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, text, coords: null } : s))
                          );
                          setActiveField(`stop-${index}`);
                          setActiveStopQuery(text);
                        }}
                        onFocus={() => {
                          setActiveField(`stop-${index}`);
                          setActiveStopQuery(stop.text);
                        }}
                      />
                      <TouchableOpacity hitSlop={8} style={styles.rowActionBtn}>
                        <Ionicons name="reorder-three-outline" size={20} color="#737373" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={8}
                        style={styles.rowActionBtn}
                        onPress={() => removeStop(index)}
                      >
                        <Ionicons name="close" size={18} color="#737373" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            <View style={styles.fieldDivider} />

            {/* Drop row */}
            <View style={styles.locationRow}>
              <View style={styles.rowIconCol}>
                <View style={styles.dotDropRing}>
                  <View style={styles.dotDropInner} />
                </View>
              </View>
              <View style={styles.rowInputCol}>
                <View style={styles.inputRow}>
                  <TextInput
                    ref={dropInputRef}
                    style={styles.input}
                    placeholder="Drop location"
                    placeholderTextColor="#A3A3A3"
                    value={dropText}
                    onChangeText={setDropText}
                    onFocus={() => {
                      activeFieldRef.current = "drop";
                      setActiveField("drop");
                    }}
                  />
                  {showDropClear ? (
                    <TouchableOpacity onPress={clearDrop} hitSlop={12} style={styles.clearBtn}>
                      <Ionicons name="close-circle" size={18} color="#A3A3A3" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionPill}
              activeOpacity={0.85}
              onPress={openMapPicker}
            >
              <Ionicons name="location-outline" size={16} color="#111827" />
              <AppText style={styles.actionPillText}>Select on map</AppText>
            </TouchableOpacity>
            {canAddMoreStops ? (
              <TouchableOpacity style={styles.actionPill} activeOpacity={0.85} onPress={handleAddStop}>
                <View style={styles.addStopsIconWrap}>
                  <View style={styles.addStopsIcon}>
                    <Ionicons name="add" size={11} color="#FFFFFF" style={styles.addStopsPlus} />
                  </View>
                </View>
                <AppText style={styles.actionPillText}>Add stops</AppText>
              </TouchableOpacity>
            ) : (
              <View style={styles.actionPillPlaceholder} />
            )}
          </View>

          <View style={styles.sectionDivider} />

          {showSuggestionsSection ? (
            activeLoading ? (
              <LocationSearchSkeleton rows={6} />
            ) : (
              activeSuggestions.map((loc) =>
                renderSuggestionRow(
                  loc,
                  activeField === "pickup" ? "pickup" : activeField === "drop" ? "drop" : "stop",
                  activeStopIndex >= 0 ? activeStopIndex : undefined
                )
              )
            )
          ) : showStopsInfoPanel ? (
            <View style={styles.stopsInfoSection}>
              <View style={styles.stopsInfoIconWrap}>
                <Ionicons name="navigate" size={44} color="#3B82F6" />
              </View>
              <AppText style={styles.stopsInfoTitle}>No editing on the way!</AppText>
              <AppText style={styles.stopsInfoSub}>
                You cannot edit drop or remove stops once the ride starts
              </AppText>
            </View>
          ) : showEmptyState ? (
            <LocationSearchEmptyState />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {showConfirmFooter ? (
        <View style={[styles.confirmFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            activeOpacity={canConfirm ? 0.85 : 1}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            <AppText style={styles.confirmBtnText}>Confirm</AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      <BookingForSomeoneElseSheet
        visible={someoneElseSheetVisible}
        onClose={() => setSomeoneElseSheetVisible(false)}
        onYesSomeoneElse={handleYesSomeoneElse}
        onNoBookingForMe={handleNoBookingForMe}
      />

      <BookingRiderSheet
        visible={riderSheetVisible}
        onClose={() => setRiderSheetVisible(false)}
        selectedId={selectedRiderId}
        onSelect={setSelectedRiderId}
        onAddGuest={handleAddGuest}
      />

      <ContactsPermissionModal
        visible={contactsPermissionModalVisible}
        onDismiss={() => setContactsPermissionModalVisible(false)}
      />

      <ContactListSheet
        visible={contactListVisible}
        onClose={() => setContactListVisible(false)}
        onSelectContact={handleSelectContact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#0A0A0A",
    letterSpacing: -0.2,
  },
  forMeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D4D4D4",
  },
  forMeText: { fontSize: 14, fontWeight: "500", color: "#0A0A0A", maxWidth: 80 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  inputCard: {
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  inputCardExpanded: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E5E5",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  rowIconCol: {
    width: 22,
    alignItems: "center",
    paddingTop: 16,
  },
  rowInputCol: {
    flex: 1,
    marginLeft: 8,
  },
  connectorSegment: {
    flex: 1,
    alignItems: "center",
    minHeight: 12,
    marginVertical: 2,
  },
  connectorLine: {
    width: 0,
    flex: 1,
    borderLeftWidth: 1.5,
    borderLeftColor: "#BDBDBD",
    borderStyle: "dashed",
  },
  dotPickupRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#34A853",
    alignItems: "center",
    justifyContent: "center",
  },
  dotPickupInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  dotDropRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#C56A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  dotDropInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#7C3D12",
  },
  stopDiamond: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  stopDiamondText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FFFFFF",
    transform: [{ rotate: "-45deg" }],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    color: "#0A0A0A",
    paddingVertical: 12,
    paddingRight: 4,
  },
  inputFilled: {
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    color: "#171717",
  },
  clearBtn: { padding: 4 },
  rowActionBtn: { padding: 4, marginLeft: 2 },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#DCDCDC",
    marginLeft: 30,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 14,
  },
  actionPillPlaceholder: {
    width: 1,
    height: 1,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#FFFFFF",
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0A0A0A",
  },
  addStopsIconWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addStopsIcon: {
    width: 13,
    height: 13,
    borderRadius: 2,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  addStopsPlus: {
    transform: [{ rotate: "-45deg" }],
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5E5",
    marginBottom: 4,
  },
  suggestedLoading: { paddingVertical: 32, alignItems: "center" },
  suggestedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
    gap: 10,
  },
  suggestedDistance: {
    fontSize: 13,
    color: "#737373",
    fontWeight: "700",
    minWidth: 36,
  },
  suggestedContent: { flex: 1, minWidth: 0 },
  suggestedName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0A0A0A",
    marginBottom: 2,
  },
  suggestedAddress: {
    fontSize: 13,
    color: "#737373",
    fontWeight: "600",
  },
  heartBtn: { padding: 4 },
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0A0A0A",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    fontWeight: "400",
    color: "#737373",
    textAlign: "center",
    lineHeight: 20,
  },
  stopsInfoSection: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  stopsInfoIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stopsInfoTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0A0A0A",
    marginBottom: 8,
    textAlign: "center",
  },
  stopsInfoSub: {
    fontSize: 14,
    fontWeight: "400",
    color: "#737373",
    textAlign: "center",
    lineHeight: 20,
  },
  confirmFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
  },
  confirmBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A0A0A",
  },
});
