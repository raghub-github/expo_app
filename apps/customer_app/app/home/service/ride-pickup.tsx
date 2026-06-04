/**
 * Pickup / Drop page – Rapido-style location inputs, optional stops (max 2), map actions.
 * Pickup defaults to user's current address; drop field is auto-focused on entry.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocationStore } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
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
  pickup?: string;
  drop?: string;
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
  const hasCoords = coords?.latitude != null && coords?.longitude != null;

  const dropInputRef = useRef<TextInput>(null);
  const pickupInputRef = useRef<TextInput>(null);
  const stopInputRefs = useRef<Record<string, TextInput | null>>({});
  const userEditedPickupRef = useRef(restoringFromBook);
  const pickupCityGeocodeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        return {
          latitude: Number(routeParams.pickupLat),
          longitude: Number(routeParams.pickupLng),
        };
      }
      return hasCoords ? { latitude: coords!.latitude!, longitude: coords!.longitude! } : null;
    }
  );
  const [dropCoords, setDropCoords] = useState<{ latitude: number; longitude: number } | null>(() => {
    if (restoringFromBook && routeParams.dropLat && routeParams.dropLng) {
      return {
        latitude: Number(routeParams.dropLat),
        longitude: Number(routeParams.dropLng),
      };
    }
    return null;
  });
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
  }, [hydrateRecentLocations]);

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
    setPickupText("");
    setPickupCoords(null);
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
    (dropLabel: string, dropCoord?: { latitude: number; longitude: number }) => {
      const pickup = pickupText.trim() || resolvePickupAddress(address);
      if (!pickupCoords?.latitude || !pickupCoords?.longitude) {
        Alert.alert(
          "Pickup location required",
          "Select pickup from search or map so we can save exact coordinates."
        );
        return;
      }
      if (!dropCoord?.latitude || !dropCoord?.longitude) {
        Alert.alert(
          "Drop location required",
          "Select drop from search or map so we can save exact coordinates."
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

      const params: Record<string, string> = { pickup, drop: dropLabel };
      params.pickupLat = String(pickupCoords.latitude);
      params.pickupLng = String(pickupCoords.longitude);
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
      router.push({ pathname: "/home/service/ride-book", params });
    },
    [
      pickupText,
      pickupCoords,
      stops,
      address,
      selectedRiderId,
      guestName,
      guestPhone,
      farPickupPromptShown,
      farPickupAcknowledged,
      pickupDistanceFromBookerKm,
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
        setDropText(result.fullAddress);
        setDropCoords({ latitude: result.latitude, longitude: result.longitude });
        if (stops.length === 0) {
          navigateToRideBook(result.fullAddress, {
            latitude: result.latitude,
            longitude: result.longitude,
          });
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
      return () => {
        didAutoFocusOnVisitRef.current = false;
        lastRestoreKeyRef.current = "";
      };
    }, [])
  );

  const handlePickupSelect = useCallback(
    async (loc: EnrichedPlaceResult) => {
      const resolved = await resolveMapboxEnrichedPlace(loc, "ride-pickup");
      userEditedPickupRef.current = true;
      setLastRidePickup({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
      });
      addRecentLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
        kind: "pickup",
      });
      setPickupText(resolved.fullAddress);
      setPickupCoords({ latitude: resolved.latitude, longitude: resolved.longitude });
      if (isPickupFarFromUser(resolved.latitude, resolved.longitude)) {
        const km = haversineKm(coords!.latitude!, coords!.longitude!, resolved.latitude, resolved.longitude);
        setPickupDistanceFromBookerKm(km);
        setFarPickupPromptShown(true);
        setFarPickupAcknowledged(false);
        setSomeoneElseSheetVisible(true);
      }
      setActiveField("drop");
      setTimeout(() => dropInputRef.current?.focus(), 100);
    },
    [addRecentLocation, setLastRidePickup, isPickupFarFromUser, coords?.latitude, coords?.longitude]
  );

  const handleDropSelect = useCallback(
    async (loc: EnrichedPlaceResult) => {
      const resolved = await resolveMapboxEnrichedPlace(loc, "ride-drop");
      setLastRideDrop({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
      });
      addRecentLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
        kind: "drop",
      });
      setDropText(resolved.fullAddress);
      setDropCoords({ latitude: resolved.latitude, longitude: resolved.longitude });
      if (stops.length === 0) {
        navigateToRideBook(resolved.fullAddress, {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
        });
      }
    },
    [addRecentLocation, setLastRideDrop, navigateToRideBook, stops.length]
  );

  const handleConfirm = useCallback(() => {
    const pickup = pickupText.trim();
    const drop = dropText.trim();
    if (!pickup || !drop) return;
    if (stops.some((s) => !s.text.trim())) return;
    navigateToRideBook(drop, dropCoords ?? undefined);
  }, [pickupText, dropText, dropCoords, stops, navigateToRideBook]);

  const handleStopSelect = useCallback(
    async (stopIndex: number, loc: EnrichedPlaceResult) => {
      const resolved = await resolveMapboxEnrichedPlace(loc, "ride-stop");
      addRecentLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        primary: resolved.primary,
        fullAddress: resolved.fullAddress,
      });
      setStops((prev) =>
        prev.map((s, i) =>
          i === stopIndex
            ? { ...s, text: resolved.fullAddress, coords: { latitude: resolved.latitude, longitude: resolved.longitude } }
            : s
        )
      );
      setActiveField("drop");
      setActiveStopQuery("");
      setTimeout(() => dropInputRef.current?.focus(), 100);
    },
    [addRecentLocation]
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

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

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
  const showPickupClear = pickupText.length > 0 && !isUsingDevicePickup(pickupText, address);

  const formatDistance = (loc: EnrichedPlaceResult) => {
    if (loc.distanceKm != null && Number.isFinite(loc.distanceKm)) {
      const km = loc.distanceKm;
      if (km < 1) return `${Math.round(km * 1000)} m`;
      return `${Math.round(km)} km`;
    }
    const anchor =
      activeField === "pickup" ? resolvePickupSearchAnchor() : resolveDropSearchAnchor();
    if (!anchor || !loc.latitude || !loc.longitude) return null;
    const km = haversineKm(anchor.latitude, anchor.longitude, loc.latitude, loc.longitude);
    if (!Number.isFinite(km)) return null;
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${Math.round(km)} km`;
  };

  const renderSuggestionRow = (
    loc: EnrichedPlaceResult,
    kind: "pickup" | "drop" | "stop",
    stopIndex?: number
  ) => (
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
    />
  );

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <TouchableOpacity
            style={styles.forMeBtn}
            onPress={() => setRiderSheetVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Booking for"
          >
            <Text style={styles.forMeText} numberOfLines={1}>
              {displayRiderLabel}
            </Text>
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
                      <Text style={styles.stopDiamondText}>{index + 1}</Text>
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
              <Text style={styles.actionPillText}>Select on map</Text>
            </TouchableOpacity>
            {canAddMoreStops ? (
              <TouchableOpacity style={styles.actionPill} activeOpacity={0.85} onPress={handleAddStop}>
                <View style={styles.addStopsIconWrap}>
                  <View style={styles.addStopsIcon}>
                    <Ionicons name="add" size={11} color="#FFFFFF" style={styles.addStopsPlus} />
                  </View>
                </View>
                <Text style={styles.actionPillText}>Add stops</Text>
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
              <Text style={styles.stopsInfoTitle}>No editing on the way!</Text>
              <Text style={styles.stopsInfoSub}>
                You cannot edit drop or remove stops once the ride starts
              </Text>
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
            <Text style={styles.confirmBtnText}>Confirm</Text>
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
    fontWeight: "400",
    color: "#0A0A0A",
    paddingVertical: 12,
    paddingRight: 4,
  },
  inputFilled: {
    fontWeight: "500",
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
    fontWeight: "500",
    minWidth: 36,
  },
  suggestedContent: { flex: 1, minWidth: 0 },
  suggestedName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0A0A0A",
    marginBottom: 2,
  },
  suggestedAddress: {
    fontSize: 13,
    color: "#737373",
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
