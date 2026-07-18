/**
 * Full address form after confirming pin on map.
 * Reverse-geocode auto-fills city/state/pincode; Home/Work uniqueness; 500m nearby check; double-tap guard.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, FlatList, ActivityIndicator, Alert, Modal, Pressable, Animated, Easing, Image, useWindowDimensions } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import { MapboxWebPannableMap } from "@/components/maps/MapboxWebPannableMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { addressService, type Address } from "@/services/address.service";
import {
  reverseGeocode,
  searchPlacesEnriched,
  MAPBOX_SEARCH_DEBOUNCE_MS,
  isPincodeSearchMode,
  getRoadDistance,
  type EnrichedPlaceResult,
  type ReverseGeocodeResult,
} from "@/services/location.service";
import { profileService } from "@/services/profile.service";
import { useLocationStore, type LocationSource } from "@/store/locationStore";
import { parseMapCoordParam, resolveMapCenter } from "@/lib/map-coordinates";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const NEARBY_RADIUS_METERS = 500;
const BRAND = GatiMitraColors.splashMint;

/** Best-effort split of saved `fullAddress` into flat/area lines using structured fields. */
function splitSavedAddressLines(addr: Address): { line1: string; line2: string } {
  const city = (addr.city ?? "").trim();
  const state = (addr.state ?? "").trim();
  const pin = (addr.pincode ?? "").trim();
  let rest = (addr.fullAddress ?? "").trim();
  if (city && state && pin) {
    const tail = `, ${city}, ${state}, ${pin}`.replace(/\s+/g, " ");
    const lower = rest.toLowerCase();
    const t = tail.toLowerCase();
    if (lower.endsWith(t)) rest = rest.slice(0, rest.length - tail.length).replace(/,\s*$/, "").trim();
  }
  const parts = rest.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { line1: (addr.fullAddress || "—").trim(), line2: "" };
  return { line1: parts[0]!, line2: parts.slice(1).join(", ") };
}

/** Parse city/state/pincode from comma-separated Mapbox full address when context fields are missing. */
function inferAddressPartsFromFullAddress(
  fullAddress: string,
  hints?: { city?: string | null; state?: string | null; pincode?: string | null }
): { city?: string; state?: string; pincode?: string } {
  const parts = fullAddress
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "—" && p !== "-");
  const isPincode = (p: string) => /^\d{6}$/.test(p);
  const pinIdx = parts.findIndex(isPincode);
  const pincode = hints?.pincode?.trim() || (pinIdx >= 0 ? parts[pinIdx] : undefined);

  let state = hints?.state?.trim() || undefined;
  if (!state && pinIdx > 0) {
    const beforePin = parts[pinIdx - 1]!;
    const cityHint = hints?.city?.trim().toLowerCase();
    if (beforePin.toLowerCase() !== "india") {
      if (!cityHint || beforePin.toLowerCase() !== cityHint) {
        state = beforePin;
      } else if (pinIdx > 1) {
        state = parts[pinIdx - 2];
      }
    }
  }

  let city = hints?.city?.trim() || undefined;
  if (!city && state) {
    const stateIdx = parts.findIndex((p) => p.toLowerCase() === state!.toLowerCase());
    if (stateIdx > 0) city = parts[stateIdx - 1];
  }

  return { city, state, pincode };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BG = "#F5F7FA";
const CARD_BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const TEAL = "#14b8a6";
const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;
type PrefilledField = "line2" | "city" | "state" | "pincode";
type DeviceContact = { id: string; name: string; phone: string };
type LocationListItem = {
  key: string;
  kind: "search" | "recent";
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  icon: "location-outline" | "time-outline";
};

function SheetSkeleton({ opacity }: { opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <View>
      <Animated.View style={[styles.skeletonLine, { opacity, width: "44%", height: 14, marginBottom: 12 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
      <Animated.View style={[styles.skeletonLine, { opacity, height: 44, marginBottom: 10 }]} />
    </View>
  );
}

export default function LocationAddressScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.round(Math.min(300, Math.max(220, windowHeight * 0.3)));
  const router = useRouter();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const storeCoords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);

  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    primary?: string;
    fullAddress?: string;
    fromOnboarding?: string;
    afterSaveReturn?: string;
    addressId?: string;
  }>();

  const editAddressId = useMemo(() => {
    const raw = params.addressId;
    if (raw == null || raw === "") return null;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params.addressId]);

  const isEditMode = editAddressId != null;

  const fallbackCenter = {
    latitude: storeCoords?.latitude ?? DEFAULT_LAT,
    longitude: storeCoords?.longitude ?? DEFAULT_LNG,
  };
  const parsedLat = parseMapCoordParam(params.latitude, fallbackCenter.latitude);
  const parsedLng = parseMapCoordParam(params.longitude, fallbackCenter.longitude);
  const { latitude: initialLat, longitude: initialLon } = resolveMapCenter(
    parsedLat,
    parsedLng,
    fallbackCenter
  );
  const fromOnboarding = params.fromOnboarding === "1";
  const returnToCheckout = params.afterSaveReturn === "checkout";

  const finishAddressFlow = () => {
    if (fromOnboarding) {
      router.replace("/(onboarding)/permissions");
      return;
    }
    if (returnToCheckout) {
      router.replace("/checkout");
      return;
    }
    router.replace("/(tabs)/");
  };
  const mapRef = useRef<CustomerMapRef | null>(null);
  const editSeedAppliedRef = useRef(false);
  const editBaselineRef = useRef<{ lat: number; lon: number } | null>(null);
  const addressSavedRef = useRef(false);
  const locationSnapshotRef = useRef<{
    address: ReverseGeocodeResult;
    coords: { latitude: number; longitude: number };
    source: LocationSource | null;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState({ latitude: initialLat, longitude: initialLon });
  /** When true, skip reverse-geocode so saved city/state/pin are not overwritten until the user moves the pin. */
  const [editGeoLocked, setEditGeoLocked] = useState(isEditMode);

  useEffect(() => {
    setEditGeoLocked(isEditMode);
    if (!isEditMode) {
      editSeedAppliedRef.current = false;
      editBaselineRef.current = null;
    }
  }, [isEditMode]);

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [landmark, setLandmark] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [label, setLabel] = useState<"Home" | "Work" | "Other">("Home");
  const [customLabel, setCustomLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<Record<PrefilledField, boolean>>({
    line2: false,
    city: false,
    state: false,
    pincode: false,
  });
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [locationSearchVisible, setLocationSearchVisible] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<EnrichedPlaceResult[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [resultRoadDistances, setResultRoadDistances] = useState<Record<string, number>>({});
  const [isCurrentLocationSheetLoading, setIsCurrentLocationSheetLoading] = useState(false);
  const [distanceOrigin, setDistanceOrigin] = useState<{
    latitude: number;
    longitude: number;
    label: string;
  } | null>(null);
  const [pinDistance, setPinDistance] = useState<{
    meters: number;
    kind: "road" | "straight";
  } | null>(null);
  const [pinDistanceLoading, setPinDistanceLoading] = useState(false);
  const [doorImageLocalUri, setDoorImageLocalUri] = useState<string | null>(null);
  const [doorImageRemoteUrl, setDoorImageRemoteUrl] = useState<string | null>(null);
  const [doorImageUploading, setDoorImageUploading] = useState(false);
  const selectedLat = mapCenter.latitude;
  const selectedLon = mapCenter.longitude;
  const shimmer = useRef(new Animated.Value(0.45)).current;

  const canSaveAddress = useMemo(() => {
    if (isCurrentLocationSheetLoading) return false;
    if (!line1.trim()) return false;
    if (!city.trim() || !state.trim()) return false;
    const pc = pincode.trim();
    if (!pc || !/^\d{6}$/.test(pc)) return false;
    if (label === "Other" && !customLabel.trim()) return false;
    if (!Number.isFinite(selectedLat) || !Number.isFinite(selectedLon)) return false;
    return true;
  }, [
    isCurrentLocationSheetLoading,
    line1,
    city,
    state,
    pincode,
    label,
    customLabel,
    selectedLat,
    selectedLon,
  ]);
  const locationSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSearchAbortRef = useRef<AbortController | null>(null);
  const roadDistanceInflightRef = useRef<Set<string>>(new Set());
  const {
    items: recentLocations,
    addRecentLocation,
    getRecentLocationKeys,
    hydrate: hydrateRecentLocations,
  } = useRecentLocationStore();

  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    retry: false,
  });

  const editTarget = useMemo(
    () => (editAddressId != null ? savedAddresses.find((a) => a.id === editAddressId) : undefined),
    [savedAddresses, editAddressId]
  );

  const hasHome = savedAddresses.some(
    (a) => (a.label ?? "").toLowerCase() === "home" && (!isEditMode || a.id !== editAddressId)
  );
  const hasWork = savedAddresses.some(
    (a) => (a.label ?? "").toLowerCase() === "work" && (!isEditMode || a.id !== editAddressId)
  );
  const liveMapAddress = [line2.trim(), city.trim(), state.trim(), pincode.trim()].filter(Boolean).join(", ");
  const getDistanceKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

  useEffect(() => {
    const state = useLocationStore.getState();
    if (state.coords && state.address) {
      locationSnapshotRef.current = {
        address: state.address,
        coords: state.coords,
        source: state.locationSource,
      };
    }
    return () => {
      if (!addressSavedRef.current && locationSnapshotRef.current) {
        const snap = locationSnapshotRef.current;
        useLocationStore.getState().setAddressAndCoords(snap.address, snap.coords, {
          source: snap.source ?? "selected",
        });
      }
    };
  }, []);

  const applyReverseResult = (result: ReverseGeocodeResult) => {
    const inferred = inferAddressPartsFromFullAddress(result.fullAddress, {
      city: result.city,
      state: result.state,
      pincode: result.pincode,
    });
    const resolvedCity = result.city?.trim() || inferred.city || "";
    const resolvedState = result.state?.trim() || inferred.state || "";
    const resolvedPincode = result.pincode?.trim() || inferred.pincode || "";

    if (resolvedCity) {
      setCity(resolvedCity);
      setPrefilled((p) => ({ ...p, city: true }));
    }
    if (resolvedState) {
      setState(resolvedState);
      setPrefilled((p) => ({ ...p, state: true }));
    }
    if (resolvedPincode) {
      setPincode(resolvedPincode);
      setPrefilled((p) => ({ ...p, pincode: true }));
    }
    if (result.secondary && result.secondary !== "—") {
      setLine2(result.secondary);
      setPrefilled((p) => ({ ...p, line2: true }));
    }
  };

  useEffect(() => {
    if (isEditMode && editGeoLocked) {
      setGeocodeLoading(false);
      return;
    }
    let cancelled = false;
    setGeocodeLoading(true);
    reverseGeocode(mapCenter.longitude, mapCenter.latitude)
      .then((result) => {
        if (cancelled) return;
        applyReverseResult(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not fetch location details.");
      })
      .finally(() => {
        if (!cancelled) setGeocodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapCenter.latitude, mapCenter.longitude, isEditMode, editGeoLocked]);

  useEffect(() => {
    if (!isEditMode || editSeedAppliedRef.current) return;
    const addr = editTarget;
    if (!addr) return;
    editSeedAppliedRef.current = true;
    editBaselineRef.current = { lat: addr.latitude, lon: addr.longitude };
    setMapCenter({ latitude: addr.latitude, longitude: addr.longitude });
    const lines = splitSavedAddressLines(addr);
    setLine1(lines.line1);
    setLine2(lines.line2);
    if (addr.city) {
      setCity(addr.city);
      setPrefilled((p) => ({ ...p, city: true }));
    }
    if (addr.state) {
      setState(addr.state);
      setPrefilled((p) => ({ ...p, state: true }));
    }
    if (addr.pincode) {
      setPincode(addr.pincode);
      setPrefilled((p) => ({ ...p, pincode: true }));
    }
    setLandmark(addr.landmark ?? "");
    if (addr.contactName) setContactName(addr.contactName);
    if (addr.contactMobile) setContactMobile(addr.contactMobile);
    if (addr.deliveryDoorImageUrl) setDoorImageRemoteUrl(addr.deliveryDoorImageUrl);
    const lb = (addr.label ?? "").trim();
    if (lb.toLowerCase() === "home") setLabel("Home");
    else if (lb.toLowerCase() === "work") setLabel("Work");
    else {
      setLabel("Other");
      setCustomLabel(lb);
    }
    setGeocodeLoading(false);
    setError("");
    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion?.(
        {
          latitude: addr.latitude,
          longitude: addr.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }
      );
    });
  }, [isEditMode, editTarget]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await profileService.getProfile();
        if (cancelled) return;
        setContactName((prev) => (prev.trim() ? prev : (profile.full_name ?? "").trim()));
        setContactMobile((prev) => (prev.trim() ? prev : (profile.mobile_number ?? "").trim()));
      } catch {
        // Non-blocking fallback: user can still enter manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void hydrateRecentLocations();
  }, [hydrateRecentLocations]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.45,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  useEffect(() => {
    if (!locationSearchVisible) return;
    const query = locationSearchQuery.trim();
    const isPincode = isPincodeSearchMode(query);
    const minChars = isPincode ? 6 : 2;

    if (query.length < minChars) {
      setLocationSearchResults([]);
      setLocationSearchLoading(false);
      return;
    }

    if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    locationSearchDebounceRef.current = setTimeout(() => {
      locationSearchDebounceRef.current = null;
      locationSearchAbortRef.current?.abort();
      const controller = new AbortController();
      locationSearchAbortRef.current = controller;
      setLocationSearchLoading(true);

      searchPlacesEnriched(query, {
        signal: controller.signal,
        proximity: { latitude: selectedLat, longitude: selectedLon },
        sessionContext: "add-address",
        recentLocationKeys: getRecentLocationKeys(),
      })
        .then((results) => {
          if (controller.signal.aborted) return;
          setLocationSearchResults(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setLocationSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLocationSearchLoading(false);
        });
    }, MAPBOX_SEARCH_DEBOUNCE_MS);

    return () => {
      if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
      locationSearchAbortRef.current?.abort();
    };
  }, [
    locationSearchVisible,
    locationSearchQuery,
    selectedLat,
    selectedLon,
    getRecentLocationKeys,
  ]);

  /** Baseline for "how far is this pin from the user": device GPS when allowed, else last coordinates in the app store. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            setDistanceOrigin({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              label: "your current location",
            });
            return;
          }
        }
      } catch {
        // fall through to store
      }
      if (cancelled) return;
      if (storeCoords?.latitude != null && storeCoords?.longitude != null) {
        setDistanceOrigin({
          latitude: storeCoords.latitude,
          longitude: storeCoords.longitude,
          label:
            locationSource === "selected"
              ? "your location in the app"
              : "your last used location",
        });
        return;
      }
      setDistanceOrigin(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeCoords?.latitude, storeCoords?.longitude, locationSource]);

  useEffect(() => {
    if (
      !distanceOrigin ||
      !Number.isFinite(selectedLat) ||
      !Number.isFinite(selectedLon)
    ) {
      setPinDistance(null);
      setPinDistanceLoading(false);
      return;
    }
    let cancelled = false;
    setPinDistanceLoading(true);
    setPinDistance(null);
    getRoadDistance(
      distanceOrigin.longitude,
      distanceOrigin.latitude,
      selectedLon,
      selectedLat
    )
      .then(({ distanceMeters }) => {
        if (!cancelled) {
          setPinDistance({ meters: distanceMeters, kind: "road" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        const meters = haversineMeters(
          distanceOrigin.latitude,
          distanceOrigin.longitude,
          selectedLat,
          selectedLon
        );
        setPinDistance({ meters, kind: "straight" });
      })
      .finally(() => {
        if (!cancelled) setPinDistanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    distanceOrigin?.latitude,
    distanceOrigin?.longitude,
    selectedLat,
    selectedLon,
  ]);

  useEffect(() => {
    if (!locationSearchVisible || locationSearchResults.length === 0) return;
    if (selectedLat == null || selectedLon == null) return;
    const topVisible = locationSearchResults.slice(0, 3);
    topVisible.forEach((item) => {
      const key = getDistanceKey(item.latitude, item.longitude);
      if (resultRoadDistances[key] != null || roadDistanceInflightRef.current.has(key)) return;
      roadDistanceInflightRef.current.add(key);
      getRoadDistance(selectedLon, selectedLat, item.longitude, item.latitude)
        .then(({ distanceMeters }) => {
          setResultRoadDistances((prev) => ({ ...prev, [key]: distanceMeters }));
        })
        .catch(() => {
          // keep quiet if route unavailable
        })
        .finally(() => {
          roadDistanceInflightRef.current.delete(key);
        });
    });
  }, [locationSearchVisible, locationSearchResults, selectedLat, selectedLon, resultRoadDistances]);

  const handleSave = async () => {
    if (submittingRef.current) return;
    if (!line1.trim()) {
      setError("Please enter flat / house / building details.");
      return;
    }
    if (Number.isNaN(selectedLat) || Number.isNaN(selectedLon)) {
      setError("Location is missing. Please try again.");
      return;
    }
    const cityVal = city.trim() || "—";
    const stateVal = state.trim() || "—";
    const pincodeVal = pincode.trim() || "—";

    const finalLabel = label === "Other" && customLabel.trim() ? customLabel.trim() : label;
    const fullAddress = [line1.trim(), line2.trim(), cityVal !== "—" ? cityVal : "", stateVal !== "—" ? stateVal : "", pincodeVal !== "—" ? pincodeVal : ""]
      .filter(Boolean)
      .join(", ");

    let savedWithin500m: Address | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const addr of savedAddresses) {
      if (isEditMode && addr.id === editAddressId) continue;
      try {
        const { distanceMeters } = await getRoadDistance(
          selectedLon,
          selectedLat,
          addr.longitude,
          addr.latitude
        );
        if (distanceMeters <= NEARBY_RADIUS_METERS && distanceMeters < bestDistance) {
          bestDistance = distanceMeters;
          savedWithin500m = addr;
        }
      } catch {
        // Ignore route failures and continue checking others.
      }
    }

    if (savedWithin500m) {
      Alert.alert(
        "Address nearby",
        `You already have a saved address "${savedWithin500m.label ?? "Address"}" very close to this location. Do you want to use it instead?`,
        [
          { text: "Use saved address", onPress: async () => {
            try {
              await addressService.setActiveLocation({
                latitude: savedWithin500m.latitude,
                longitude: savedWithin500m.longitude,
                address: savedWithin500m.fullAddress,
              });
              const primary = savedWithin500m.label ?? "Address";
              addressSavedRef.current = true;
              useLocationStore.getState().setAddressAndCoords(
                {
                  primary,
                  secondary: savedWithin500m.fullAddress.slice(0, 80),
                  fullAddress: savedWithin500m.fullAddress,
                },
                { latitude: savedWithin500m.latitude, longitude: savedWithin500m.longitude },
                { source: "selected" }
              );
              queryClient.invalidateQueries({ queryKey: ["addresses"] });
              queryClient.invalidateQueries({ queryKey: ["active-location"] });
              finishAddressFlow();
            } catch {
              setError("Could not set location.");
            }
          } },
          { text: "Save as new", style: "cancel", onPress: () => doSave(finalLabel, fullAddress, cityVal, stateVal, pincodeVal) },
        ]
      );
      return;
    }

    await doSave(finalLabel, fullAddress, cityVal, stateVal, pincodeVal);
  };

  const pickDoorImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo access to add a door/building image.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setDoorImageLocalUri(res.assets[0].uri);
    } catch {
      Alert.alert("Could not open gallery", "Try again or choose another image.");
    }
  };

  const uploadPendingDoorImage = async (addressId: number) => {
    if (!doorImageLocalUri) return;
    const filename =
      doorImageLocalUri.split("/").pop() || `door-${Date.now()}.jpg`;
    setDoorImageUploading(true);
    try {
      const url = await addressService.uploadDoorImage(addressId, {
        uri: doorImageLocalUri,
        name: filename,
        mimeType: "image/jpeg",
      });
      setDoorImageRemoteUrl(url);
      setDoorImageLocalUri(null);
    } finally {
      setDoorImageUploading(false);
    }
  };

  const doSave = async (
    finalLabel: string,
    fullAddress: string,
    cityVal: string,
    stateVal: string,
    pincodeVal: string
  ) => {
    if (submittingRef.current) return;
    setError("");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (isEditMode && editAddressId != null) {
        await addressService.updateAddress(editAddressId, {
          label: finalLabel,
          fullAddress,
          landmark: landmark.trim() || null,
          city: cityVal === "—" ? null : cityVal,
          state: stateVal === "—" ? null : stateVal,
          pincode: pincodeVal === "—" ? null : pincodeVal,
          country: "IN",
          latitude: selectedLat,
          longitude: selectedLon,
          contactName: contactName.trim() || null,
          contactMobile: contactMobile.trim() || null,
        });
        await uploadPendingDoorImage(editAddressId);
        queryClient.invalidateQueries({ queryKey: ["addresses"] });
        queryClient.invalidateQueries({ queryKey: ["active-location"] });
        addressSavedRef.current = true;
        router.back();
        return;
      }

      const created = await addressService.addAddress({
        label: finalLabel,
        fullAddress,
        landmark: landmark.trim() || null,
        city: cityVal === "—" ? null : cityVal,
        state: stateVal === "—" ? null : stateVal,
        pincode: pincodeVal === "—" ? null : pincodeVal,
        country: "IN",
        latitude: selectedLat,
        longitude: selectedLon,
        // Newly-added addresses are ALWAYS marked default — the customer just
        // explicitly chose this location, so every consumer (home header,
        // checkout) should immediately use it without an extra tap. The server
        // automatically un-defaults the previous row in the same transaction.
        isDefault: true,
        contactName: contactName.trim() || null,
        contactMobile: contactMobile.trim() || null,
      });
      await uploadPendingDoorImage(created.id);
      await addressService.setActiveLocation({
        latitude: selectedLat,
        longitude: selectedLon,
        address: fullAddress,
      });
      const reverseResult: ReverseGeocodeResult = {
        primary: line1.trim(),
        secondary: line2.trim(),
        fullAddress,
        city: cityVal === "—" ? null : cityVal,
        state: stateVal === "—" ? null : stateVal,
        pincode: pincodeVal === "—" ? null : pincodeVal,
      };
      addressSavedRef.current = true;
      useLocationStore.getState().setAddressAndCoords(
        reverseResult,
        { latitude: selectedLat, longitude: selectedLon },
        { source: "selected" }
      );
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      queryClient.invalidateQueries({ queryKey: ["active-location"] });
      finishAddressFlow();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not save address. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const getInputStyle = (field: string, isPrefilled = false) => [
    styles.input,
    focusedField === field && styles.inputFocused,
    isPrefilled && styles.inputPrefilled,
  ];
  const filteredContacts = deviceContacts.filter((c) => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });
  const handleUseCurrentLocationOnMap = async () => {
    setIsCurrentLocationSheetLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location not found", "Please enable location and try again.");
        return;
      }
      const latest = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const nextLat = latest.coords.latitude;
      const nextLon = latest.coords.longitude;
      setDistanceOrigin({
        latitude: nextLat,
        longitude: nextLon,
        label: "your current location",
      });
      setMapCenter({ latitude: nextLat, longitude: nextLon });
      if (isEditMode) setEditGeoLocked(false);
      mapRef.current?.animateToRegion?.({
        latitude: nextLat,
        longitude: nextLon,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      });
      const result = await reverseGeocode(nextLon, nextLat);
      applyReverseResult(result);
    } catch {
      setError("Could not fetch current location details.");
    } finally {
      setIsCurrentLocationSheetLoading(false);
    }
  };

  const handlePickFromContacts = async () => {
    setContactsModalVisible(true);
    try {
      setContactsLoading(true);
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setContactsModalVisible(false);
        Alert.alert("Permission required", "Please allow contacts permission to pick a contact.");
        return;
      }
      try {
        await profileService.updateProfile({ contacts_permission: true });
      } catch {
        // Non-blocking: contact picker should still work even if profile sync fails.
      }
      const res = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 150,
      });
      const mapped: DeviceContact[] = (res.data ?? [])
        .map((c) => {
          const phone = c.phoneNumbers?.[0]?.number?.trim() ?? "";
          return {
            id: c.id,
            name: c.name?.trim() || "Unnamed contact",
            phone,
          };
        })
        .filter((c) => !!c.phone)
        .slice(0, 80);

      if (mapped.length === 0) {
        setContactsModalVisible(false);
        Alert.alert("No contacts", "No contacts with phone numbers found.");
        return;
      }
      setDeviceContacts(mapped);
    } catch {
      setContactsModalVisible(false);
      Alert.alert("Could not open contacts", "Please try again.");
    } finally {
      setContactsLoading(false);
    }
  };

  const applySearchedLocation = (latitude: number, longitude: number, primary: string, fullAddress?: string) => {
    setIsCurrentLocationSheetLoading(false);
    setMapCenter({ latitude, longitude });
    if (isEditMode) setEditGeoLocked(false);
    mapRef.current?.animateToRegion?.({
      latitude,
      longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    });
    addRecentLocation({ latitude, longitude, primary, fullAddress });
    setLocationSearchVisible(false);
    setLocationSearchQuery("");
    setLocationSearchResults([]);
  };

  const locationListData: LocationListItem[] =
    locationSearchQuery.trim().length >= 2
      ? locationSearchResults.map((item) => ({
          key: `search-${item.latitude.toFixed(6)}-${item.longitude.toFixed(6)}-${item.primary}`,
          kind: "search" as const,
          title: item.primary,
          subtitle: item.fullAddress,
          latitude: item.latitude,
          longitude: item.longitude,
          icon: "location-outline" as const,
        }))
      : recentLocations.slice(0, 7).map((item) => ({
          key: `recent-${item.latitude.toFixed(6)}-${item.longitude.toFixed(6)}-${item.primary}`,
          kind: "recent" as const,
          title: item.primary,
          subtitle: item.fullAddress || "Recent location",
          latitude: item.latitude,
          longitude: item.longitude,
          icon: "time-outline" as const,
        }));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={TITLE_DARK} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerSearchBar} onPress={() => setLocationSearchVisible(true)} activeOpacity={0.85}>
          <Ionicons name="search" size={18} color={TEAL} />
          <AppText style={styles.headerSearchText}>Search for area, street name...</AppText>
        </TouchableOpacity>
      </View>
      <View style={styles.mapCard}>
        <View style={[styles.mapSlot, { height: mapHeight }]}>
          <MapboxWebPannableMap
            key={isEditMode && editAddressId != null ? `edit-addr-${editAddressId}` : "new-address-map"}
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            onRegionChangeComplete={(region) => {
              const latitude = region.latitude;
              const longitude = region.longitude;
              setMapCenter({ latitude, longitude });
              if (isEditMode && editBaselineRef.current) {
                const b = editBaselineRef.current;
                if (haversineMeters(b.lat, b.lon, latitude, longitude) > 35) {
                  setEditGeoLocked(false);
                }
              }
            }}
          />
          <View style={styles.mapTooltipWrap} pointerEvents="none">
            <View style={styles.mapTooltip}>
              <AppText style={styles.mapTooltipText}>Move pin to your exact delivery location</AppText>
            </View>
          </View>
          <View pointerEvents="none" style={styles.mapPinOverlay}>
            <Ionicons name="location" size={34} color={TEAL} />
          </View>
          <TouchableOpacity style={styles.mapUseCurrentPill} onPress={handleUseCurrentLocationOnMap} activeOpacity={0.85}>
            <Ionicons name="locate" size={15} color={TEAL} />
            <AppText style={styles.mapUseCurrentText}>Use current location</AppText>
          </TouchableOpacity>
        </View>
        <AppText style={styles.mapHint}>Move map to set exact delivery location</AppText>
      </View>
      <View style={styles.sheet}>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
          <View style={styles.sheetHandle} />
          {isCurrentLocationSheetLoading ? (
            <SheetSkeleton opacity={shimmer.interpolate({ inputRange: [0.45, 1], outputRange: [0.45, 1] })} />
          ) : (
            <>
              <View style={styles.sectionHeadRow}>
                <Ionicons name="home-outline" size={15} color={TEAL} />
                <AppText style={styles.sectionTitle}>Address details</AppText>
              </View>

              <View style={styles.summaryBox}>
                <AppText style={styles.summaryTitle}>Map location</AppText>
                <AppText style={styles.summaryText} numberOfLines={2}>
                  {liveMapAddress || params.primary || "Location selected on map"}
                </AppText>
                {pinDistanceLoading ? (
                  <AppText style={styles.summaryDistanceTextMuted}>Calculating distance…</AppText>
                ) : pinDistance != null && distanceOrigin ? (
                  <AppText style={styles.summaryDistanceText}>
                    {pinDistance.meters < 50
                      ? `Same area as ${distanceOrigin.label}`
                      : pinDistance.meters < 1000
                        ? `${Math.round(pinDistance.meters)} m${
                            pinDistance.kind === "road" ? " by road" : " (approx., straight line)"
                          } from ${distanceOrigin.label}`
                        : `${(pinDistance.meters / 1000).toFixed(1)} km${
                            pinDistance.kind === "road" ? " by road" : " approx. (straight line)"
                          } from ${distanceOrigin.label}`}
                  </AppText>
                ) : !distanceOrigin ? (
                  <AppText style={styles.summaryDistanceTextMuted}>
                    Allow location access to see distance from you to this pin.
                  </AppText>
                ) : null}
              </View>

              <AppText style={styles.label}>Flat / House / Building *</AppText>
          <TextInput
            style={getInputStyle("line1")}
            placeholder="e.g. Flat 501, Shyam Residency"
            placeholderTextColor={TEXT_GRAY}
            autoCapitalize="words"
            value={line1}
            onChangeText={setLine1}
            editable={!submitting}
            onFocus={() => setFocusedField("line1")}
            onBlur={() => setFocusedField(null)}
          />

              <AppText style={styles.label}>Street / Area (optional)</AppText>
          <TextInput
            style={getInputStyle("line2", prefilled.line2)}
            placeholder="Area, street name"
            placeholderTextColor={TEXT_GRAY}
            autoCapitalize="words"
            value={line2}
            onChangeText={(text) => {
              setLine2(text);
              if (!text.trim()) setPrefilled((p) => ({ ...p, line2: false }));
            }}
            editable={!submitting}
            onFocus={() => setFocusedField("line2")}
            onBlur={() => setFocusedField(null)}
          />

              <View style={styles.row}>
                <View style={styles.col}>
                  <AppText style={styles.label}>City *</AppText>
                  <TextInput
                    style={getInputStyle("city", prefilled.city)}
                    placeholder="City"
                    placeholderTextColor={TEXT_GRAY}
                    autoCapitalize="words"
                    value={city}
                    onChangeText={(text) => {
                      setCity(text);
                      if (!text.trim()) setPrefilled((p) => ({ ...p, city: false }));
                    }}
                    editable={!submitting}
                    onFocus={() => setFocusedField("city")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={styles.col}>
                  <AppText style={styles.label}>State *</AppText>
                  <TextInput
                    style={getInputStyle("state", prefilled.state)}
                    placeholder="State"
                    placeholderTextColor={TEXT_GRAY}
                    autoCapitalize="words"
                    value={state}
                    onChangeText={(text) => {
                      setState(text);
                      if (!text.trim()) setPrefilled((p) => ({ ...p, state: false }));
                    }}
                    editable={!submitting}
                    onFocus={() => setFocusedField("state")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <AppText style={styles.label}>Pincode *</AppText>
                  <TextInput
                    style={getInputStyle("pincode", prefilled.pincode)}
                    placeholder="Pincode"
                    placeholderTextColor={TEXT_GRAY}
                    value={pincode}
                    onChangeText={(text) => {
                      setPincode(text);
                      if (!text.trim()) setPrefilled((p) => ({ ...p, pincode: false }));
                    }}
                    keyboardType="number-pad"
                    editable={!submitting}
                    onFocus={() => setFocusedField("pincode")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={styles.col}>
                  <AppText style={styles.label}>Landmark (optional)</AppText>
                  <TextInput
                    style={getInputStyle("landmark")}
                    placeholder="Nearby landmark"
                    placeholderTextColor={TEXT_GRAY}
                    autoCapitalize="words"
                    value={landmark}
                    onChangeText={setLandmark}
                    editable={!submitting}
                    onFocus={() => setFocusedField("landmark")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.sectionHeadRow}>
            <Ionicons name="person-outline" size={15} color={TEAL} />
            <AppText style={styles.sectionTitle}>Delivery contact</AppText>
            <TouchableOpacity
              style={styles.contactsBtn}
              onPress={handlePickFromContacts}
              disabled={contactsLoading || submitting}
            >
              {contactsLoading ? (
                <ActivityIndicator size="small" color={TEAL} />
              ) : (
                <AppText style={styles.contactsBtnText}>Pick from contacts</AppText>
              )}
            </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <AppText style={styles.label}>Contact name</AppText>
                  <TextInput
                    style={getInputStyle("contactName")}
                    placeholder="Receiver name"
                    placeholderTextColor={TEXT_GRAY}
                    autoCapitalize="words"
                    value={contactName}
                    onChangeText={setContactName}
                    editable={!submitting}
                    onFocus={() => setFocusedField("contactName")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={styles.col}>
                  <AppText style={styles.label}>Contact mobile</AppText>
                  <TextInput
                    style={getInputStyle("contactMobile")}
                    placeholder="Mobile number"
                    placeholderTextColor={TEXT_GRAY}
                    value={contactMobile}
                    onChangeText={setContactMobile}
                    keyboardType="phone-pad"
                    editable={!submitting}
                    onFocus={() => setFocusedField("contactMobile")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>


              <AppText style={styles.doorImageLabel}>Door/building image (optional)</AppText>
              <Pressable style={styles.doorImageDashed} onPress={pickDoorImage} disabled={submitting || doorImageUploading}>
                {doorImageLocalUri || doorImageRemoteUrl ? (
                  <Image
                    source={{
                      uri:
                        doorImageLocalUri ??
                        toAbsoluteImageUrl(doorImageRemoteUrl) ??
                        undefined,
                    }}
                    style={styles.doorImagePreview}
                  />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={22} color={BRAND} />
                    <AppText style={styles.doorImageCta}>Add an image</AppText>
                  </>
                )}
                {doorImageUploading ? (
                  <View style={styles.doorImageUploading}>
                    <ActivityIndicator size="small" color={BRAND} />
                  </View>
                ) : null}
              </Pressable>
              <AppText style={styles.doorImageHelp}>
                This helps our delivery partners find your exact location faster
              </AppText>

              <AppText style={styles.label}>Save as</AppText>
              <View style={styles.chipRow}>
            {(["Home", "Work", "Other"] as const).map((opt) => {
              const disabled = (opt === "Home" && hasHome) || (opt === "Work" && hasWork) || submitting;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, label === opt && styles.chipActive, disabled && styles.chipDisabled]}
                  onPress={() => !disabled && setLabel(opt)}
                  disabled={disabled}
                >
                  <AppText style={[styles.chipText, label === opt && styles.chipTextActive, disabled && styles.chipTextDisabled]}>
                    {opt}
                  </AppText>
                </TouchableOpacity>
              );
            })}
              </View>
              {label === "Other" && (
            <TextInput
              style={[...getInputStyle("customLabel"), { marginTop: 8 }]}
              placeholder="Label name (e.g. Mom's house)"
              placeholderTextColor={TEXT_GRAY}
              autoCapitalize="words"
              value={customLabel}
              onChangeText={setCustomLabel}
              editable={!submitting}
              onFocus={() => setFocusedField("customLabel")}
              onBlur={() => setFocusedField(null)}
            />
              )}

          </>
          )}

          {error ? <AppText style={styles.errorText}>{error}</AppText> : null}

          </View>
        </ScrollView>
        <View style={[styles.stickyCtaWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, (submitting || !canSaveAddress) && styles.primaryBtnDisabled]}
            onPress={handleSave}
            disabled={submitting || !canSaveAddress}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText style={styles.primaryBtnText}>{isEditMode ? "Update address" : "Save address"}</AppText>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={locationSearchVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalTopSpace} onPress={() => setLocationSearchVisible(false)} />
          <View style={styles.modalBottomWrap}>
            <View style={styles.locationSearchCard}>
              <TouchableOpacity style={styles.floatingCutBtn} onPress={() => setLocationSearchVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={18} color={TEXT_GRAY} />
              </TouchableOpacity>
              <View style={styles.modalHeader}>
                <AppText style={styles.modalTitle}>Select a location</AppText>
              </View>
              <View style={styles.modalSearchWrap}>
                <Ionicons name="search" size={18} color={TEAL} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search for area, street name..."
                  placeholderTextColor={TEXT_GRAY}
                  value={locationSearchQuery}
                  onChangeText={setLocationSearchQuery}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {locationSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setLocationSearchQuery("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={TEXT_GRAY} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.locationSearchActionRow}
                onPress={async () => {
                  await handleUseCurrentLocationOnMap();
                  setLocationSearchVisible(false);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="locate" size={18} color={TEAL} />
                <View style={{ flex: 1 }}>
                  <AppText style={styles.locationSearchActionTitle}>Use current location</AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_GRAY} />
              </TouchableOpacity>

              <FlatList
                data={locationListData}
                style={styles.modalList}
                keyExtractor={(item) => item.key}
                removeClippedSubviews
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
                renderItem={({ item }) => {
                  const roadMeters =
                    resultRoadDistances[getDistanceKey(item.latitude, item.longitude)] ?? null;
                  return (
                    <TouchableOpacity
                      style={styles.locationResultRow}
                      onPress={() => applySearchedLocation(item.latitude, item.longitude, item.title, item.subtitle)}
                    >
                      <Ionicons name={item.icon} size={18} color="#64748B" />
                      <View style={styles.locationResultTextWrap}>
                        <AppText style={styles.locationResultTitle}>{item.title}</AppText>
                        <AppText style={styles.locationResultSubtitle}>{item.subtitle}</AppText>
                        {roadMeters != null && (
                          <AppText style={styles.locationResultDistance}>
                            {roadMeters < 1000
                              ? `${Math.round(roadMeters)} m`
                              : `${(roadMeters / 1000).toFixed(1)} km`}
                          </AppText>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  locationSearchLoading ? (
                    <View style={styles.emptyContactsWrap}>
                      <ActivityIndicator size="small" color={TEAL} />
                      <AppText style={[styles.emptyContactsText, { marginTop: 8 }]}>Searching locations...</AppText>
                    </View>
                  ) : (
                    <View style={styles.emptyContactsWrap}>
                      <AppText style={styles.emptyContactsText}>
                        {locationSearchQuery.trim().length >= 2 ? "No location found." : "No recent locations."}
                      </AppText>
                    </View>
                  )
                }
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={contactsModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalTopSpace} onPress={() => setContactsModalVisible(false)} />
          <KeyboardAvoidingView
            style={styles.modalBottomWrap}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <View style={styles.modalCard}>
              <TouchableOpacity style={styles.floatingCutBtn} onPress={() => setContactsModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={18} color={TEXT_GRAY} />
              </TouchableOpacity>
              <View style={styles.modalHeader}>
                <AppText style={styles.modalTitle}>Select contact</AppText>
              </View>
              <View style={styles.modalSearchWrap}>
                <Ionicons name="search" size={16} color={TEXT_GRAY} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search contact name or number"
                  placeholderTextColor={TEXT_GRAY}
                  value={contactSearch}
                  onChangeText={setContactSearch}
                />
                {contactSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setContactSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={TEXT_GRAY} />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id}
                style={styles.modalList}
                removeClippedSubviews
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={8}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                renderItem={({ item: c }) => (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => {
                      setContactName(c.name);
                      setContactMobile(c.phone);
                      setContactSearch("");
                      setContactsModalVisible(false);
                    }}
                  >
                    <View style={styles.contactIcon}>
                      <Ionicons name="person" size={16} color={TEAL} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.contactName} numberOfLines={1}>
                        {c.name}
                      </AppText>
                      <AppText style={styles.contactPhone} numberOfLines={1}>
                        {c.phone}
                      </AppText>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  contactsLoading ? (
                    <View style={styles.emptyContactsWrap}>
                      <ActivityIndicator size="small" color={TEAL} />
                      <AppText style={[styles.emptyContactsText, { marginTop: 8 }]}>Loading contacts...</AppText>
                    </View>
                  ) : (
                    <View style={styles.emptyContactsWrap}>
                      <AppText style={styles.emptyContactsText}>No contacts found.</AppText>
                    </View>
                  )
                }
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerSearchBar: {
    flex: 1,
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerSearchText: { color: TEXT_GRAY, fontSize: 15, fontWeight: "500" },
  sheet: {
    flex: 1,
    backgroundColor: CARD_BG,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { flexGrow: 1 },
  mapCard: {
    flexShrink: 0,
    backgroundColor: CARD_BG,
    borderRadius: 0,
    overflow: "hidden",
    marginBottom: 0,
  },
  mapSlot: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -14,
  },
  mapHint: {
    fontSize: 12,
    color: TEXT_GRAY,
    textAlign: "center",
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  mapTooltipWrap: {
    position: "absolute",
    top: 12,
    width: "100%",
    alignItems: "center",
  },
  mapTooltip: {
    backgroundColor: "rgba(15,23,42,0.92)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapTooltipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  mapUseCurrentPill: {
    position: "absolute",
    bottom: 34,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapUseCurrentText: { color: TEAL, fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 10,
  },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: TEAL },
  contactsBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  contactsBtnText: { fontSize: 11, fontWeight: "700", color: TEAL },
  label: { fontSize: 12, fontWeight: "600", color: TITLE_DARK, marginBottom: 3 },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: TITLE_DARK,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
  },
  inputFocused: {
    borderColor: TEAL,
    backgroundColor: "#FFFFFF",
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 1,
  },
  inputPrefilled: {
    borderColor: "#2DD4BF",
    backgroundColor: "#F0FDFA",
  },
  skeletonLine: {
    backgroundColor: "#E2E8F0",
    borderRadius: 8,
  },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFF",
  },
  chipActive: { borderColor: TEAL, backgroundColor: "#E0F2F1" },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: 13, color: TITLE_DARK },
  chipTextActive: { fontWeight: "600", color: TEAL },
  chipTextDisabled: { color: TEXT_GRAY },
  summaryBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    backgroundColor: "#F9FAFB",
  },
  summaryTitle: { fontSize: 13, fontWeight: "600", color: TITLE_DARK, marginBottom: 4 },
  summaryText: { fontSize: 13, color: TEXT_GRAY },
  summaryDistanceText: { fontSize: 12, color: TEAL, fontWeight: "700", marginTop: 6 },
  summaryDistanceTextMuted: { fontSize: 12, color: TEXT_GRAY, fontWeight: "500", marginTop: 6 },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 4, marginBottom: 4 },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  doorImageLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TITLE_DARK,
    marginTop: 14,
    marginBottom: 8,
  },
  doorImageDashed: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
  },
  doorImageCta: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND,
  },
  doorImageHelp: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 8,
    lineHeight: 17,
  },
  doorImagePreview: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    resizeMode: "cover",
  },
  doorImageUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  stickyCtaWrap: {
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  modalTopSpace: { flex: 1 },
  modalBottomWrap: { justifyContent: "flex-end" },
  locationSearchCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 8,
    minHeight: "62%",
    maxHeight: "78%",
    width: "100%",
  },
  locationSearchActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  locationSearchActionTitle: { fontSize: 15, fontWeight: "700", color: TEAL },
  locationResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 2,
    marginVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  locationResultTextWrap: { flex: 1 },
  locationResultTitle: { fontSize: 14, fontWeight: "700", color: TITLE_DARK },
  locationResultSubtitle: { fontSize: 13, color: TEXT_GRAY, marginTop: 2 },
  locationResultDistance: { fontSize: 12, color: TEAL, marginTop: 4, fontWeight: "700" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 8,
    height: "78%",
    width: "100%",
  },
  floatingCutBtn: {
    position: "absolute",
    top: -20,
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 3,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: TITLE_DARK },
  modalSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: TITLE_DARK,
    marginLeft: 8,
    paddingVertical: 9,
  },
  modalList: { flex: 1 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  contactIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6FFFA",
  },
  contactName: { fontSize: 14, fontWeight: "600", color: TITLE_DARK },
  contactPhone: { fontSize: 12, color: TEXT_GRAY, marginTop: 2 },
  emptyContactsWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  emptyContactsText: { color: TEXT_GRAY, fontSize: 13 },
});
