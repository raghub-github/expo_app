/**
 * Pickup page – shown when user taps search input on Ride screen.
 * Pickup/Drop inputs, "For me" dropdown (rider bottom sheet), Select on map, Add stops.
 * Empty state: Could not get address.
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocationStore } from "@/store/locationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { BookingRiderSheet } from "@/features/ride/BookingRiderSheet";
import { ContactListSheet } from "@/features/ride/ContactListSheet";
import { ContactsPermissionModal } from "@/components/ContactsPermissionModal";
import {
  searchPlacesWithProximity,
  searchPlaces,
  searchDropSuggestionsInCity,
  geocodeAddressToCoord,
  type PlaceSearchResult,
} from "@/services/location.service";

const PAD = 20;
const SEARCH_DEBOUNCE_MS = 250;

function getDefaultPickup(address: { primary?: string; fullAddress?: string } | null): string {
  if (!address) return "";
  return address.primary ?? address.fullAddress ?? "";
}

export default function RidePickupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address, coords } = useLocationStore();
  const [pickupText, setPickupText] = useState(() => getDefaultPickup(address));
  const [dropText, setDropText] = useState("");
  const [riderSheetVisible, setRiderSheetVisible] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("myself");
  const [guestName, setGuestName] = useState<string | null>(null);
  const [contactsPermissionModalVisible, setContactsPermissionModalVisible] = useState(false);
  const [contactListVisible, setContactListVisible] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState<PlaceSearchResult[]>([]);
  const [dropSuggestions, setDropSuggestions] = useState<PlaceSearchResult[]>([]);
  const [pickupSuggestionsLoading, setPickupSuggestionsLoading] = useState(false);
  const [dropSuggestionsLoading, setDropSuggestionsLoading] = useState(false);
  const userEditedPickupRef = useRef(false);
  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupCityGeocodeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupAbortRef = useRef<AbortController | null>(null);
  const dropAbortRef = useRef<AbortController | null>(null);
  const [pickupCityCoords, setPickupCityCoords] = useState<{ longitude: number; latitude: number } | null>(null);
  /** Active input: drives which suggestion section appears first (no page reload). */
  const [activeField, setActiveField] = useState<"pickup" | "drop" | null>(null);
  /** Stored when user selects from suggestions; passed to ride-book for distance. */
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dropCoords, setDropCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const hasCoords = !!coords?.latitude && !!coords?.longitude;

  // When screen focuses: show current location by default; when returning from map, show selected location (store updated)
  useFocusEffect(
    useCallback(() => {
      const fromStore = getDefaultPickup(address);
      if (!fromStore) return;
      if (!userEditedPickupRef.current) {
        setPickupText(fromStore);
        if (coords?.latitude != null && coords?.longitude != null) {
          setPickupCoords({ latitude: coords.latitude, longitude: coords.longitude });
        }
      }
      userEditedPickupRef.current = false;
    }, [address?.primary, address?.fullAddress, coords?.latitude, coords?.longitude])
  );

  const handlePickupChange = (text: string) => {
    userEditedPickupRef.current = true;
    setPickupText(text);
  };

  const displayRiderLabel = selectedRiderId === "myself" ? "For me" : guestName ? guestName : "Add a guest";

  const handleAddGuest = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      setContactsPermissionModalVisible(true);
      return;
    }
    setRiderSheetVisible(false);
    setContactListVisible(true);
  };

  const handleSelectContact = (name: string) => {
    setGuestName(name);
    setSelectedRiderId("guest");
  };

  // Dynamic suggestions for pickup (Mapbox; proximity when location available; abort stale requests)
  useEffect(() => {
    if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
    const query = pickupText.trim();
    if (!query && !hasCoords) {
      setPickupSuggestions([]);
      return;
    }
    pickupDebounceRef.current = setTimeout(() => {
      pickupDebounceRef.current = null;
      pickupAbortRef.current?.abort();
      const controller = new AbortController();
      pickupAbortRef.current = controller;
      setPickupSuggestionsLoading(true);
      const search =
        hasCoords && coords
          ? searchPlacesWithProximity(query || "place", coords.longitude, coords.latitude, { signal: controller.signal })
          : query.length >= 2
            ? searchPlaces(query, { signal: controller.signal, proximity: coords ? { longitude: coords.longitude, latitude: coords.latitude } : undefined })
            : Promise.resolve([]);
      search
        .then((results) => {
          if (!controller.signal.aborted) setPickupSuggestions(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPickupSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPickupSuggestionsLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (pickupDebounceRef.current) clearTimeout(pickupDebounceRef.current);
      pickupAbortRef.current?.abort();
    };
  }, [pickupText, hasCoords, coords?.latitude, coords?.longitude]);

  // Resolve pickup to "city" coordinates: use current location when pickup matches store, else geocode pickup text (India-only).
  useEffect(() => {
    if (pickupCityGeocodeRef.current) clearTimeout(pickupCityGeocodeRef.current);
    const text = pickupText.trim();
    if (!text) {
      setPickupCityCoords(null);
      return;
    }
    const fromStore = getDefaultPickup(address);
    const matchesCurrent = fromStore && (text === fromStore || (address?.fullAddress && text === address.fullAddress));
    if (matchesCurrent && coords?.latitude != null && coords?.longitude != null) {
      setPickupCityCoords({ longitude: coords.longitude, latitude: coords.latitude });
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
  }, [pickupText, address?.primary, address?.fullAddress, coords?.latitude, coords?.longitude]);

  // Drop suggestions: same city as pickup only; abort stale requests for real-time feel.
  useEffect(() => {
    if (dropDebounceRef.current) clearTimeout(dropDebounceRef.current);
    const query = dropText.trim();
    if (!pickupCityCoords) {
      setDropSuggestions([]);
      return;
    }
    dropDebounceRef.current = setTimeout(() => {
      dropDebounceRef.current = null;
      dropAbortRef.current?.abort();
      const controller = new AbortController();
      dropAbortRef.current = controller;
      setDropSuggestionsLoading(true);
      searchDropSuggestionsInCity(query || "landmark", pickupCityCoords.longitude, pickupCityCoords.latitude, { signal: controller.signal })
        .then((results) => {
          if (!controller.signal.aborted) setDropSuggestions(results);
        })
        .catch(() => {
          if (!controller.signal.aborted) setDropSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setDropSuggestionsLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (dropDebounceRef.current) clearTimeout(dropDebounceRef.current);
      dropAbortRef.current?.abort();
    };
  }, [dropText, pickupCityCoords?.latitude, pickupCityCoords?.longitude]);

  function renderPickupSuggestions(isSecond: boolean) {
    return (
      <>
        <Text style={[styles.suggestedTitle, isSecond && styles.suggestedTitleSpaced]}>Suggested for pickup</Text>
        {pickupSuggestionsLoading ? (
          <View style={styles.suggestedLoading}>
            <ActivityIndicator size="small" color={GatiMitraColors.emerald} />
          </View>
        ) : (
          pickupSuggestions.map((loc) => (
            <TouchableOpacity
              key={loc.fullAddress + loc.latitude}
              style={styles.suggestedRow}
              onPress={() => {
                setPickupText(loc.fullAddress);
                setPickupCoords({ latitude: loc.latitude, longitude: loc.longitude });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={20} color={GatiMitraColors.textSecondary} />
              <View style={styles.suggestedContent}>
                <Text style={styles.suggestedName}>{loc.primary}</Text>
                <Text style={styles.suggestedAddress} numberOfLines={1}>{loc.fullAddress}</Text>
              </View>
              <TouchableOpacity style={styles.heartBtn} hitSlop={12}>
                <Ionicons name="heart-outline" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </>
    );
  }

  function renderDropSuggestions(isSecond: boolean) {
    if (pickupText.trim().length === 0) return null;
    return (
      <>
        <Text style={[styles.suggestedTitle, isSecond && styles.suggestedTitleSpaced]}>Suggested for drop</Text>
        {!pickupCityCoords && !dropSuggestionsLoading ? (
          <Text style={styles.suggestedHint}>Resolving pickup… Type above for drop suggestions in same city</Text>
        ) : dropSuggestionsLoading ? (
          <View style={styles.suggestedLoading}>
            <ActivityIndicator size="small" color={GatiMitraColors.emerald} />
          </View>
        ) : dropSuggestions.length > 0 ? (
          dropSuggestions.map((loc) => (
            <TouchableOpacity
              key={loc.fullAddress + loc.latitude}
              style={styles.suggestedRow}
              onPress={() => {
                setDropText(loc.fullAddress);
                setDropCoords({ latitude: loc.latitude, longitude: loc.longitude });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={20} color={GatiMitraColors.textSecondary} />
              <View style={styles.suggestedContent}>
                <Text style={styles.suggestedName}>{loc.primary}</Text>
                <Text style={styles.suggestedAddress} numberOfLines={1}>{loc.fullAddress}</Text>
              </View>
              <TouchableOpacity style={styles.heartBtn} hitSlop={12}>
                <Ionicons name="heart-outline" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.suggestedHint}>Type in drop field — suggestions from pickup city will appear here</Text>
        )}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header – compact, minimal gap below status bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Pickup</Text>
          <TouchableOpacity
            style={styles.forMeBtn}
            onPress={() => {
              setRiderSheetVisible(true);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Booking for"
          >
            <Text style={styles.forMeText} numberOfLines={1}>{displayRiderLabel}</Text>
            <Ionicons name="chevron-down" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner */}
          <View style={styles.banner}>
            <Ionicons name="information-circle" size={22} color={GatiMitraColors.warmOrange} />
            <Text style={styles.bannerText}>
              Uh oh, we can't find you! Enter your pickup location for a smooth ride.
            </Text>
          </View>

          {/* Pickup / Drop – clearly editable fields */}
          <View style={styles.inputCard}>
            <View style={styles.connectorColumn}>
              <View style={[styles.dot, styles.dotPickup]} />
              <View style={styles.dashedLine} />
              <View style={[styles.dot, styles.dotDrop]} />
            </View>
            <View style={styles.inputColumn}>
              <View style={styles.inputRowWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter pickup location"
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  value={pickupText}
                  onChangeText={handlePickupChange}
                  onFocus={() => setActiveField("pickup")}
                  returnKeyType="next"
                  editable
                  selectTextOnFocus
                />
                <TouchableOpacity style={styles.inputActionBtn} hitSlop={12}>
                  <Ionicons name="create-outline" size={20} color={GatiMitraColors.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={styles.inputDivider} />
              <View style={styles.inputRowWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter drop location"
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  value={dropText}
                  onChangeText={setDropText}
                  onFocus={() => setActiveField("drop")}
                  editable
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.swapBtn}
                  onPress={() => {
                    setPickupText(dropText);
                    setDropText(pickupText);
                  }}
                  hitSlop={12}
                >
                  <Ionicons name="swap-vertical" size={20} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* See ride options – directly below inputs; sticky, compact */}
          <TouchableOpacity
            style={[styles.seeRidesBtn, (!pickupText || !dropText) && styles.seeRidesBtnDisabled]}
            onPress={() => {
              if (pickupText && dropText) {
                const params: Record<string, string> = { pickup: pickupText, drop: dropText };
                if (pickupCoords) {
                  params.pickupLat = String(pickupCoords.latitude);
                  params.pickupLng = String(pickupCoords.longitude);
                }
                if (dropCoords) {
                  params.dropLat = String(dropCoords.latitude);
                  params.dropLng = String(dropCoords.longitude);
                }
                router.push({ pathname: "/home/service/ride-book", params });
              }
            }}
            activeOpacity={0.9}
            disabled={!pickupText || !dropText}
          >
            <Text style={styles.seeRidesBtnText}>See ride options</Text>
          </TouchableOpacity>

          {/* Dynamic suggestion sections: order by active field (pickup focused → pickup first; drop focused → drop first) */}
          {activeField === "drop" ? (
            <>
              {renderDropSuggestions(false)}
              {renderPickupSuggestions(true)}
            </>
          ) : (
            <>
              {renderPickupSuggestions(false)}
              {renderDropSuggestions(true)}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
  container: { flex: 1, backgroundColor: GatiMitraColors.background },
  keyboard: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.background,
    paddingHorizontal: PAD,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginRight: 8,
  },
  forMeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GatiMitraColors.textPrimary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    minWidth: 88,
    justifyContent: "center",
  },
  forMeText: { fontSize: 13, fontWeight: "600", color: "#fff", maxWidth: 64 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, paddingTop: 14 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraColors.textPrimary,
    lineHeight: 18,
  },
  inputCard: {
    flexDirection: "row",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    ...GatiMitraColors.elevationShadow,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  connectorColumn: {
    width: 24,
    alignItems: "center",
    marginRight: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotPickup: { backgroundColor: GatiMitraColors.emerald },
  dotDrop: { backgroundColor: GatiMitraColors.warmOrange },
  dashedLine: {
    width: 2,
    flex: 1,
    minHeight: 20,
    marginVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: GatiMitraColors.border,
    borderStyle: "dashed",
  },
  inputColumn: { flex: 1 },
  inputRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    paddingVertical: 10,
    paddingRight: 8,
    paddingLeft: 0,
  },
  inputActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  inputDivider: {
    height: 0,
    marginVertical: 2,
  },
  swapBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  seeRidesBtn: {
    backgroundColor: GatiMitraColors.mint,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    ...GatiMitraColors.elevationShadow,
  },
  seeRidesBtnDisabled: { opacity: 0.5 },
  seeRidesBtnText: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  suggestedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 10,
  },
  suggestedTitleSpaced: { marginTop: 20 },
  suggestedHint: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  suggestedLoading: { paddingVertical: 16, alignItems: "center" },
  suggestedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    borderStyle: "dashed",
    gap: 10,
  },
  suggestedContent: { flex: 1, minWidth: 0 },
  suggestedName: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 2,
  },
  suggestedAddress: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
  },
  suggestedDistance: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    fontWeight: "600",
  },
  heartBtn: { padding: 4 },
});
