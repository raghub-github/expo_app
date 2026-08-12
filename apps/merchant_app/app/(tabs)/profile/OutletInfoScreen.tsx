/**
 * Outlet info page — GatiMitra branding, light background.
 * Data from backend (GET store, GET operating-hours). No dining fields.
 * Each section has its own edit modal: name, address → confirm → API → toast.
 * Cuisines: plain text on profile; Edit opens chips + master list (link/unlink via merchant-menu API).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator, Linking, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Switch, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { profileSectionTitle } from "@/constants/profileTypography";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getConfig } from "@/config/env";
import { getOutlet, updateOutlet, updatePickupInstruction, resolveImageUrl, uploadStoreLogo, removeStoreLogo, type OutletInfo, type OutletUpdateBody } from "@/services/outletApi";
import { StoreLogoPhotoOptionsSheet } from "@/components/StoreLogoPhotoOptionsSheet";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
import { reverseGeocode, forwardGeocode, type GeocodeAddress } from "@/services/geocoding";
import {
  fetchMenuCuisinesAndCatalog,
  linkMenuCuisineFromCatalog,
  unlinkMenuCuisine,
  type MenuCuisineOption,
} from "@/services/menuApi";

const TOAST_DURATION_MS = 2800;
const DEFAULT_MAP_CENTER = { lat: 22.5726, lng: 88.3639 };

function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Build Mapbox map HTML: sticky center pin, pannable map, satellite view with area labels; on moveend posts { lat, lng }. */
function buildMapHtml(token: string, lat: number | null, lng: number | null, zoom?: number): string {
  const centerLat = lat ?? DEFAULT_MAP_CENTER.lat;
  const centerLng = lng ?? DEFAULT_MAP_CENTER.lng;
  const zoomLevel = zoom ?? (lat != null && lng != null ? 16 : 14);
  const escapedToken = token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    #wrap { position: relative; width: 100%; height: 100%; }
    #map { width: 100%; height: 100%; }
    .pin { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); width: 32px; height: 40px; pointer-events: none; z-index: 2; }
    .pin::before { content: ''; position: absolute; width: 32px; height: 32px; background: #3EB489; border: 3px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); bottom: 0; left: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="map"><\/div>
    <div class="pin"><\/div>
  </div>
  <script>
    (function() {
      var token = '${escapedToken}';
      var center = [${centerLng}, ${centerLat}];
      var zoom = ${zoomLevel};
      mapboxgl.accessToken = token;
      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: center,
        zoom: zoom
      });
      function sendCenter() {
        var c = map.getCenter();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ lat: c.lat, lng: c.lng }));
        }
      }
      map.on('moveend', sendCenter);
      map.on('load', function() { map.resize(); });
    })();
  <\/script>
</body>
</html>
  `.trim();
}

export default function OutletInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedStore, setSelectedStore } = useSelectedStore();
  const { token, refreshPartner } = useAuth();
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [logoPhotoSheetVisible, setLogoPhotoSheetVisible] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [cuisineModalVisible, setCuisineModalVisible] = useState(false);

  // Separate edit modals per section
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [editCuisineModalVisible, setEditCuisineModalVisible] = useState(false);
  const [editAddressModalVisible, setEditAddressModalVisible] = useState(false);
  const [editPickupModalVisible, setEditPickupModalVisible] = useState(false);
  const [draftStoreName, setDraftStoreName] = useState("");
  /** Edit-cuisine modal: linked rows + catalog from GET …/cuisines */
  const [editCuisineLinked, setEditCuisineLinked] = useState<MenuCuisineOption[]>([]);
  const [editCuisineCatalog, setEditCuisineCatalog] = useState<MenuCuisineOption[]>([]);
  const [cuisineSearch, setCuisineSearch] = useState("");
  const [cuisineLoading, setCuisineLoading] = useState(false);
  const [cuisineMutating, setCuisineMutating] = useState(false);
  const [draftAddress, setDraftAddress] = useState({
    full_address: "",
    city: "",
    state: "",
    postal_code: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  /** Snapshot when Edit Address modal opened — for edited-state styling and partial save. */
  const [initialAddress, setInitialAddress] = useState<typeof draftAddress | null>(null);
  /** Coordinates (default) vs Area Search */
  const [addressMode, setAddressMode] = useState<"coordinates" | "area">("coordinates");
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<GeocodeAddress[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [coordLatStr, setCoordLatStr] = useState("");
  const [coordLonStr, setCoordLonStr] = useState("");
  const [draftPickupInstruction, setDraftPickupInstruction] = useState("");

  // Confirmation modal before saving (for name, address)
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    type: "name" | "address";
    message: string;
    payload: OutletUpdateBody;
  }>({ visible: false, type: "name", message: "", payload: {} });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storeId = selectedStore?.id ?? null;

  const loadOutlet = useCallback(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOutlet(storeId, token)
      .then((data) => {
        if (!cancelled) {
          setOutlet(data);
          setBannerError(false);
          setLogoError(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  useEffect(() => {
    const cleanup = loadOutlet();
    return cleanup;
  }, [loadOutlet]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const refetchOutlet = () => {
    if (!storeId || !token) return;
    getOutlet(storeId, token)
      .then((data) => setOutlet(data))
      .catch(() => {});
  };

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: "" });
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  };

  const openEditCuisine = useCallback(async () => {
    if (!token || !outlet?.store_id) {
      Alert.alert("Cuisines", "Store is not ready. Try again in a moment.");
      return;
    }
    setCuisineSearch("");
    setEditCuisineModalVisible(true);
    setCuisineLoading(true);
    setEditCuisineLinked([]);
    setEditCuisineCatalog([]);
    try {
      const { cuisines, catalog } = await fetchMenuCuisinesAndCatalog(outlet.store_id, token);
      setEditCuisineLinked(cuisines);
      setEditCuisineCatalog(catalog);
    } catch (e) {
      Alert.alert("Could not load cuisines", e instanceof Error ? e.message : "Please try again.");
      setEditCuisineModalVisible(false);
    } finally {
      setCuisineLoading(false);
    }
  }, [token, outlet?.store_id]);

  const filteredCuisineCatalog = useMemo(() => {
    const q = cuisineSearch.trim().toLowerCase();
    const linkedIds = new Set(editCuisineLinked.map((c) => c.id));
    let rows = editCuisineCatalog.filter((c) => !linkedIds.has(c.id));
    if (q) {
      rows = rows.filter((c) => c.name.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [editCuisineCatalog, editCuisineLinked, cuisineSearch]);

  const handleUnlinkCuisine = useCallback(
    async (c: MenuCuisineOption) => {
      if (!token || !outlet?.store_id || cuisineMutating) return;
      setCuisineMutating(true);
      try {
        await unlinkMenuCuisine(outlet.store_id, token, c.id);
        setEditCuisineLinked((prev) => prev.filter((x) => x.id !== c.id));
        setEditCuisineCatalog((prev) => {
          if (prev.some((x) => x.id === c.id)) return prev;
          return [...prev, c].sort((a, b) => a.name.localeCompare(b.name));
        });
        refetchOutlet();
        showToast(`Removed “${c.name}”`);
      } catch (e) {
        Alert.alert("Could not remove cuisine", e instanceof Error ? e.message : "Try again.");
      } finally {
        setCuisineMutating(false);
      }
    },
    [token, outlet?.store_id, cuisineMutating]
  );

  const handleLinkCuisine = useCallback(
    async (c: MenuCuisineOption) => {
      if (!token || !outlet?.store_id || cuisineMutating) return;
      setCuisineMutating(true);
      try {
        await linkMenuCuisineFromCatalog(outlet.store_id, token, c.id);
        setEditCuisineLinked((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
        setEditCuisineCatalog((prev) => prev.filter((x) => x.id !== c.id));
        refetchOutlet();
        showToast(`Added “${c.name}”`);
      } catch (e) {
        Alert.alert("Could not add cuisine", e instanceof Error ? e.message : "Try again.");
      } finally {
        setCuisineMutating(false);
      }
    },
    [token, outlet?.store_id, cuisineMutating]
  );

  const openEditName = () => {
    setDraftStoreName(outlet?.store_name ?? "");
    setEditNameModalVisible(true);
  };
  const openEditAddress = () => {
    const initial = {
      full_address: outlet?.full_address ?? "",
      city: outlet?.city ?? "",
      state: outlet?.state ?? "",
      postal_code: outlet?.postal_code ?? "",
      latitude: outlet?.latitude ?? null,
      longitude: outlet?.longitude ?? null,
    };
    setDraftAddress(initial);
    setInitialAddress(initial);
    setCoordLatStr(initial.latitude != null ? String(initial.latitude) : "");
    setCoordLonStr(initial.longitude != null ? String(initial.longitude) : "");
    setAddressMode("coordinates");
    setAreaSearchQuery("");
    setAreaSearchResults([]);
    setEditAddressModalVisible(true);
  };

  const allowDecimalNumber = (t: string): string => t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

  const parsedLat = (): number | null => {
    const n = parseFloat(coordLatStr);
    return Number.isFinite(n) ? n : null;
  };
  const parsedLon = (): number | null => {
    const n = parseFloat(coordLonStr);
    return Number.isFinite(n) ? n : null;
  };

  const handleMapCenterChange = async (lat: number, lng: number) => {
    setDraftAddress((prev) => ({ ...prev, latitude: lat, longitude: lng }));
    setCoordLatStr(String(lat));
    setCoordLonStr(String(lng));
    const token = getConfig().mapboxPublicToken;
    if (!token) return;
    setGeocodeLoading(true);
    try {
      const result = await reverseGeocode(token, lat, lng);
      if (result) {
        setDraftAddress((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          full_address: result.full_address || result.place_name || prev.full_address,
          city: result.city || prev.city,
          state: result.state || prev.state,
          postal_code: result.postal_code || prev.postal_code,
        }));
      }
    } catch {
      // keep coords only
    } finally {
      setGeocodeLoading(false);
    }
  };

  const handleAreaSearch = async () => {
    const token = getConfig().mapboxPublicToken;
    if (!token || !areaSearchQuery.trim()) return;
    setGeocodeLoading(true);
    setAreaSearchResults([]);
    try {
      const list = await forwardGeocode(token, areaSearchQuery.trim(), { limit: 5 });
      setAreaSearchResults(list);
    } catch {
      setAreaSearchResults([]);
    } finally {
      setGeocodeLoading(false);
    }
  };

  const selectAreaResult = (result: GeocodeAddress) => {
    setDraftAddress((prev) => ({
      ...prev,
      full_address: result.full_address,
      city: result.city,
      state: result.state,
      postal_code: result.postal_code,
      latitude: result.latitude,
      longitude: result.longitude,
    }));
    setCoordLatStr(String(result.latitude));
    setCoordLonStr(String(result.longitude));
    setAreaSearchResults([]);
    setAreaSearchQuery(result.place_name || result.full_address);
  };

  /** User filled lat/lon and tapped Search location — reverse geocode and fill address; keep lat/lon as entered. */
  const handleSearchByCoordinates = async () => {
    const token = getConfig().mapboxPublicToken;
    const lat = parsedLat();
    const lng = parsedLon();
    if (!token || lat == null || lng == null) return;
    setDraftAddress((prev) => ({ ...prev, latitude: lat, longitude: lng }));
    setGeocodeLoading(true);
    try {
      const result = await reverseGeocode(token, lat, lng);
      if (result) {
        setDraftAddress((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          full_address: result.full_address || result.place_name || prev.full_address,
          city: result.city || prev.city,
          state: result.state || prev.state,
          postal_code: result.postal_code || prev.postal_code,
        }));
      }
      setCoordLatStr(String(lat));
      setCoordLonStr(String(lng));
    } catch {
      // keep coords only
    } finally {
      setGeocodeLoading(false);
    }
  };

  const isAddressFieldEdited = (field: keyof typeof draftAddress) => {
    if (!initialAddress) return false;
    if (field === "latitude") {
      const a = parsedLat();
      const b = initialAddress.latitude;
      if (a === b) return false;
      if (a == null && b == null) return false;
      return a !== b;
    }
    if (field === "longitude") {
      const a = parsedLon();
      const b = initialAddress.longitude;
      if (a === b) return false;
      if (a == null && b == null) return false;
      return a !== b;
    }
    const a = draftAddress[field];
    const b = initialAddress[field];
    if (a === b) return false;
    if (a == null && b == null) return false;
    return String(a ?? "") !== String(b ?? "");
  };

  const buildAddressPayload = (): OutletUpdateBody => {
    const payload: OutletUpdateBody = {};
    if (!initialAddress) {
      return {
        full_address: draftAddress.full_address.trim(),
        city: draftAddress.city.trim(),
        state: draftAddress.state.trim(),
        postal_code: draftAddress.postal_code.trim(),
        latitude: parsedLat() ?? draftAddress.latitude,
        longitude: parsedLon() ?? draftAddress.longitude,
      };
    }
    if (isAddressFieldEdited("full_address")) payload.full_address = draftAddress.full_address.trim();
    if (isAddressFieldEdited("city")) payload.city = draftAddress.city.trim();
    if (isAddressFieldEdited("state")) payload.state = draftAddress.state.trim();
    if (isAddressFieldEdited("postal_code")) payload.postal_code = draftAddress.postal_code.trim();
    const lat = parsedLat();
    const lon = parsedLon();
    if (isAddressFieldEdited("latitude") && lat != null) payload.latitude = lat;
    if (isAddressFieldEdited("longitude") && lon != null) payload.longitude = lon;
    return payload;
  };
  const openEditPickup = () => {
    setDraftPickupInstruction(outlet?.pickup_instruction ?? "");
    setEditPickupModalVisible(true);
  };

  const handleConfirmSave = async () => {
    if (!storeId || !token || !outlet) return;
    const { type, payload } = confirmModal;

    // Optimistic UI update so the user sees changes immediately.
    if (type === "name" && typeof payload.store_name === "string") {
      setOutlet((prev) => (prev ? { ...prev, store_name: payload.store_name! } : null));
      if (selectedStore) setSelectedStore({ ...selectedStore, store_name: payload.store_name! });
    } else if (type === "address") {
      setOutlet((prev) => {
        if (!prev) return null;
        return { ...prev, ...payload };
      });
    }

    setSaving(true);
    try {
      await updateOutlet(storeId, payload, token);
      showToast(type === "name" ? "Store name updated" : "Address updated");
    } catch (e) {
      // On failure, fall back to backend state.
      refetchOutlet();
      Alert.alert("Update failed", e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
      setConfirmModal((p) => ({ ...p, visible: false }));
    }
  };

  const handleSavePickupInstruction = async () => {
    if (!storeId || !token) return;
    const text = draftPickupInstruction.trim() || null;
    setSaving(true);
    try {
      await updatePickupInstruction(storeId, text, token);
      setOutlet((prev) => (prev ? { ...prev, pickup_instruction: text ?? null } : null));
      showToast(text ? "Pickup instructions updated" : "Pickup instructions cleared");
      setEditPickupModalVisible(false);
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleViewOnMap = () => {
    if (!outlet?.latitude || !outlet?.longitude) {
      Alert.alert("Address", "Map location not set for this outlet.");
      return;
    }
    Linking.openURL(mapUrl(outlet.latitude, outlet.longitude));
  };

  const applyLogoUrlLocally = (logoUrl: string | null) => {
    setLogoError(false);
    setOutlet((prev) => (prev ? { ...prev, parent_logo_url: logoUrl } : null));
    if (selectedStore) {
      setSelectedStore({ ...selectedStore, parent_logo_url: logoUrl });
    }
  };

  const handleLogoPhotoSelected = async (file: { uri: string; type: string; name: string }) => {
    if (!storeId || !token) return;
    setLogoUploading(true);
    try {
      const { parent_logo_url } = await uploadStoreLogo(storeId, token, file);
      applyLogoUrlLocally(parent_logo_url || null);
      await refreshPartner().catch(() => undefined);
      showToast("Store photo updated");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogoPhoto = () => {
    if (!storeId || !token) return;
    Alert.alert("Remove photo", "Remove the store brand photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setLogoUploading(true);
            try {
              await removeStoreLogo(storeId, token);
              applyLogoUrlLocally(null);
              await refreshPartner().catch(() => undefined);
              showToast("Store photo removed");
            } catch (e) {
              Alert.alert("Remove failed", e instanceof Error ? e.message : "Could not remove photo.");
            } finally {
              setLogoUploading(false);
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading outlet info…</Text>
      </View>
    );
  }

  if (error || !outlet) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.errorText}>{error ?? "Outlet not found"}</Text>
        <Pressable onPress={() => loadOutlet()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const cuisineList: string[] = [
    ...(Array.isArray(outlet.cuisine_types) ? outlet.cuisine_types : []),
    ...(Array.isArray(outlet.food_categories) ? outlet.food_categories : []),
  ]
    .map((c) => (typeof c === "string" ? c.trim() : String(c)))
    .filter(Boolean);
  const hasMoreCuisines = cuisineList.length > 10;
  const pickupInstruction = outlet.pickup_instruction?.trim() || null;

  // Banner: from child store only (merchant_stores.banner_url)
  const bannerUri = resolveImageUrl(outlet.banner_url);
  const showBannerImage = (outlet.banner_url != null && outlet.banner_url.trim() !== "") && !bannerError && bannerUri;

  // Logo: from parent only (merchant_parents.store_logo) — all child stores share parent logo
  const logoUri = resolveImageUrl(outlet.parent_logo_url ?? null);
  const showLogoImage = (outlet.parent_logo_url != null && outlet.parent_logo_url.trim() !== "") && !logoError && logoUri;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner box (banner_url) + logo card overlapping */}
        <View style={styles.photoCard}>
          <View style={styles.bannerBox}>
            <View style={styles.bannerWrap}>
              {showBannerImage ? (
                <Image
                  source={{ uri: bannerUri ?? "" }}
                  style={styles.bannerImg}
                  resizeMode="cover"
                  onError={() => setBannerError(true)}
                />
              ) : (
                <View style={styles.bannerPlaceholder}>
                  <Ionicons name="image-outline" size={32} color={GatiMitraMerchant.textTertiary} />
                  <Text style={styles.bannerPlaceholderText}>Banner image</Text>
                </View>
              )}
            </View>
            {/* Logo card — bottom-left, overlapping banner */}
            <View style={styles.logoCard}>
              <View style={styles.logoImgWrap}>
                {showLogoImage ? (
                  <Image
                    source={{ uri: logoUri ?? "" }}
                    style={styles.logoImg}
                    resizeMode="cover"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <AppAssetImage
                    assetKey={MX.brand.appIcon}
                    style={styles.logoImg}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Pressable
                onPress={() => setLogoPhotoSheetVisible(true)}
                style={styles.editPhotoBtn}
                disabled={logoUploading}
              >
                {logoUploading ? (
                  <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                ) : (
                  <Text style={styles.editPhotoText}>Edit photo</Text>
                )}
              </Pressable>
            </View>
          </View>
          <View style={styles.bannerSpacer} />
        </View>

        {/* Restaurant information — single compact card (Zomato-style) */}
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Restaurant information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoBlock}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Restaurant's name</Text>
              <Pressable onPress={openEditName} hitSlop={8}>
                <Text style={styles.editLink}>Edit</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldValue}>{outlet.store_name}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoBlock}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Cuisine tags {cuisineList.length > 0 ? `(${cuisineList.length})` : ""}</Text>
              <Pressable onPress={openEditCuisine} hitSlop={8}>
                <Text style={styles.editLink}>Edit</Text>
              </Pressable>
            </View>
            {cuisineList.length === 0 ? (
              <Text style={styles.fieldValue}>—</Text>
            ) : (
              <>
                <Text style={styles.cuisinePlainText} numberOfLines={hasMoreCuisines ? 4 : undefined}>
                  {cuisineList.join(", ")}
                </Text>
                {hasMoreCuisines && (
                  <Pressable
                    onPress={() => setCuisineModalVisible(true)}
                    style={({ pressed }) => [styles.showMoreBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.showMoreText}>Show more</Text>
                    <Ionicons name="chevron-forward" size={16} color={GatiMitraMerchant.primary} />
                  </Pressable>
                )}
              </>
            )}
          </View>

          <Modal
            visible={cuisineModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCuisineModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setCuisineModalVisible(false)}>
              <Pressable style={[styles.modalCardFlex, styles.allCuisinesModalCard]} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>All cuisines</Text>
                  <Pressable onPress={() => setCuisineModalVisible(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                  </Pressable>
                </View>
                <ScrollView
                  style={styles.allCuisinesScroll}
                  contentContainerStyle={styles.allCuisinesPlainScrollContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  nestedScrollEnabled={true}
                >
                  <Text style={styles.allCuisinesPlainText}>{cuisineList.join(", ")}</Text>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
          <View style={styles.infoDivider} />
          <View style={styles.infoBlock}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Address</Text>
              <Pressable onPress={openEditAddress} hitSlop={8}>
                <Text style={styles.editLink}>Edit</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldValue}>{outlet.full_address}</Text>
            <Pressable onPress={handleViewOnMap} style={styles.mapLink}>
              <Ionicons name="location-outline" size={14} color={GatiMitraMerchant.primary} />
              <Text style={styles.mapLinkText}>View on map</Text>
            </Pressable>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoBlock}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Pickup instructions</Text>
              <Pressable onPress={openEditPickup} hitSlop={8}>
                <Text style={styles.editLink}>{pickupInstruction ? "Edit" : "Add"}</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldHint}>Helps our delivery partner reach your outlet faster</Text>
            <Text style={styles.fieldValue}>{pickupInstruction || "No instructions added"}</Text>
          </View>
        </View>

        {/* Outlet timings, Contact details, View on GatiMitra — compact list */}
        <View style={styles.linksCard}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile/hours")}
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <Ionicons name="time-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.linkText}>Outlet timings</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/profile/business-details")}
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <Ionicons name="call-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.linkText}>Contact details</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("https://www.gatimitra.com")}
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <Ionicons name="business-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.linkText}>View on GatiMitra</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/profile/change-history")}
            style={({ pressed }) => [styles.linkRow, styles.linkRowLast, pressed && styles.linkRowPressed]}
          >
            <Ionicons name="document-text-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.linkText}>Change history</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Edit Store Name modal */}
      <Modal visible={editNameModalVisible} transparent animationType="fade" onRequestClose={() => setEditNameModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditNameModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboardWrap}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit store name</Text>
                <Pressable onPress={() => setEditNameModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </Pressable>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.fieldLabel}>Restaurant's name</Text>
                <TextInput
                  style={styles.input}
                  value={draftStoreName}
                  onChangeText={setDraftStoreName}
                  placeholder="Enter store name"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.modalFooter}>
                <Pressable onPress={() => setEditNameModalVisible(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                  <Text style={styles.modalBtnTextSecondary}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const trimmed = draftStoreName.trim();
                    if (!trimmed) return;
                    setEditNameModalVisible(false);
                    setConfirmModal({
                      visible: true,
                      type: "name",
                      message: "Are you sure you want to update the store name?",
                      payload: { store_name: trimmed },
                    });
                  }}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                >
                  <Text style={styles.modalBtnTextPrimary}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Edit Cuisine modal — chips + search + master list (link/unlink immediately) */}
      <Modal visible={editCuisineModalVisible} transparent animationType="fade" onRequestClose={() => setEditCuisineModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditCuisineModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboardWrap}>
            <Pressable style={styles.modalCardFlex} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit cuisines</Text>
                <Pressable onPress={() => setEditCuisineModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </Pressable>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.fieldHint}>
                  Linked from the master list. Tap × to remove, or pick a cuisine below to add. Changes save immediately.
                </Text>
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  value={cuisineSearch}
                  onChangeText={setCuisineSearch}
                  placeholder="Search cuisines to add…"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!cuisineLoading}
                />
              </View>
              {cuisineLoading ? (
                <View style={styles.cuisineLoadingBox}>
                  <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                  <Text style={styles.cuisineLoadingText}>Loading cuisines…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.modalBody}>
                    <Text style={styles.fieldLabel}>On this store</Text>
                  </View>
                  <ScrollView
                    style={styles.modalChipScroll}
                    contentContainerStyle={styles.modalChipScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.modalChipWrap}>
                      {editCuisineLinked.length === 0 ? (
                        <Text style={styles.cuisineEmptyHint}>No cuisines linked yet. Search and add below.</Text>
                      ) : (
                        editCuisineLinked.map((c) => (
                          <View key={c.id} style={styles.draftChipRow}>
                            <View style={styles.modalChip}>
                              <Text style={styles.modalChipText}>{c.name}</Text>
                            </View>
                            <Pressable
                              onPress={() => handleUnlinkCuisine(c)}
                              disabled={cuisineMutating}
                              hitSlop={8}
                              style={styles.chipRemove}
                            >
                              <Ionicons name="close-circle" size={20} color={GatiMitraMerchant.error} />
                            </Pressable>
                          </View>
                        ))
                      )}
                    </View>
                  </ScrollView>
                  <View style={styles.modalBody}>
                    <Text style={styles.fieldLabel}>Add from master list</Text>
                  </View>
                  <ScrollView
                    style={styles.cuisineCatalogScroll}
                    contentContainerStyle={styles.cuisineCatalogScrollContent}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {filteredCuisineCatalog.length === 0 ? (
                      <Text style={styles.cuisineCatalogEmpty}>
                        {cuisineSearch.trim() ? "No matching cuisines." : "All linked cuisines are already on this store."}
                      </Text>
                    ) : (
                      filteredCuisineCatalog.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => handleLinkCuisine(c)}
                          disabled={cuisineMutating}
                          style={({ pressed }) => [styles.cuisineCatalogRow, pressed && styles.pressed]}
                        >
                          <Text style={styles.cuisineCatalogRowText}>{c.name}</Text>
                          <Ionicons name="add-circle-outline" size={22} color={GatiMitraMerchant.primary} />
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </>
              )}
              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => setEditCuisineModalVisible(false)}
                  style={[styles.modalBtn, styles.modalBtnPrimary, { flex: 1 }]}
                >
                  <Text style={styles.modalBtnTextPrimary}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Edit Address modal — map at top, toggle Coordinates / Area, then form; only modified fields saved. */}
      <Modal visible={editAddressModalVisible} transparent animationType="slide" onRequestClose={() => setEditAddressModalVisible(false)} statusBarTranslucent>
        <SafeAreaView style={styles.addressModalSafeArea} edges={["top"]}>
          <View style={styles.addressModalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.addressModalWrap}>
            <View style={styles.addressModalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit address</Text>
                <Pressable onPress={() => setEditAddressModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </Pressable>
              </View>
              {/* Toggle and map only when Mapbox token is set */}
              {getConfig().mapboxPublicToken && (
                <>
              <View style={styles.addressModeRow}>
                <Text style={styles.addressModeLabel}>Coordinates</Text>
                <Switch
                  value={addressMode === "area"}
                  onValueChange={(v) => setAddressMode(v ? "area" : "coordinates")}
                  trackColor={{ false: GatiMitraMerchant.border, true: GatiMitraMerchant.primary + "99" }}
                  thumbColor={GatiMitraMerchant.cardBg}
                />
                <Text style={styles.addressModeLabel}>Area / Address</Text>
              </View>
              {/* Map at top — sticky pin, pannable; moving updates coords + reverse-geocodes address */}
                <View style={styles.addressMapSection}>
                  <View style={styles.mapWrapLarge}>
                    <WebView
                      key={`${draftAddress.latitude ?? "n"}-${draftAddress.longitude ?? "n"}`}
                      source={{
                        html: buildMapHtml(
                          getConfig().mapboxPublicToken!,
                          draftAddress.latitude,
                          draftAddress.longitude,
                          draftAddress.latitude != null && draftAddress.longitude != null ? 16 : 14
                        ),
                      }}
                      style={styles.mapWebView}
                      scrollEnabled={false}
                      onMessage={(e) => {
                        try {
                          const data = JSON.parse(e.nativeEvent.data) as { lat: number; lng: number };
                          if (typeof data.lat === "number" && typeof data.lng === "number") {
                            handleMapCenterChange(data.lat, data.lng);
                          }
                        } catch {}
                      }}
                    />
                  </View>
                  {geocodeLoading && (
                    <View style={styles.mapLoadingBadge}>
                      <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                      <Text style={styles.mapLoadingText}>Updating address…</Text>
                    </View>
                  )}
                </View>
                </>
              )}
              <ScrollView
                style={styles.addressFormScroll}
                contentContainerStyle={styles.addressFormScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                {addressMode === "coordinates" && getConfig().mapboxPublicToken && (
                  <>
                    <Text style={styles.fieldLabel}>Coordinates</Text>
                    <View style={styles.coordsLabelsRow}>
                      <Text style={styles.coordsLabelAbove}>LATITUDE</Text>
                      <Text style={styles.coordsLabelAbove}>LONGITUDE</Text>
                    </View>
                    <View style={styles.coordsRow}>
                      <TextInput
                        style={[styles.coordInputPlain, isAddressFieldEdited("latitude") && styles.inputEdited]}
                        value={coordLatStr}
                        onChangeText={(t) => setCoordLatStr(allowDecimalNumber(t))}
                        placeholder="22.5726"
                        placeholderTextColor={GatiMitraMerchant.textTertiary}
                        keyboardType="decimal-pad"
                        numberOfLines={1}
                        scrollEnabled={false}
                      />
                      <TextInput
                        style={[styles.coordInputPlain, isAddressFieldEdited("longitude") && styles.inputEdited]}
                        value={coordLonStr}
                        onChangeText={(t) => setCoordLonStr(allowDecimalNumber(t))}
                        placeholder="88.3639"
                        placeholderTextColor={GatiMitraMerchant.textTertiary}
                        keyboardType="decimal-pad"
                        numberOfLines={1}
                        scrollEnabled={false}
                      />
                    </View>
                    <Pressable
                      onPress={handleSearchByCoordinates}
                      disabled={geocodeLoading || parsedLat() == null || parsedLon() == null}
                      style={[styles.searchLocationBtn, (geocodeLoading || parsedLat() == null || parsedLon() == null) && styles.searchLocationBtnDisabled]}
                    >
                      {geocodeLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="search" size={20} color="#fff" />
                          <Text style={styles.searchLocationBtnText}>Search location</Text>
                        </>
                      )}
                    </Pressable>
                  </>
                )}
                {addressMode === "area" && getConfig().mapboxPublicToken && (
                  <>
                    <Text style={styles.fieldLabel}>Search by area or address</Text>
                    <View style={styles.areaSearchRow}>
                      <TextInput
                        style={styles.areaSearchInput}
                        value={areaSearchQuery}
                        onChangeText={setAreaSearchQuery}
                        placeholder="Enter area, city, or full address"
                        placeholderTextColor={GatiMitraMerchant.textTertiary}
                        onSubmitEditing={handleAreaSearch}
                        returnKeyType="search"
                      />
                      <Pressable
                        onPress={handleAreaSearch}
                        disabled={geocodeLoading || !areaSearchQuery.trim()}
                        style={[styles.areaSearchBtn, (!areaSearchQuery.trim() || geocodeLoading) && styles.areaSearchBtnDisabled]}
                      >
                        {geocodeLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="search" size={20} color="#fff" />
                        )}
                      </Pressable>
                    </View>
                    {areaSearchResults.length > 0 && (
                      <View style={styles.areaResultsList}>
                        {areaSearchResults.map((r, i) => (
                          <Pressable
                            key={i}
                            onPress={() => selectAreaResult(r)}
                            style={({ pressed }) => [
                              styles.areaResultItem,
                              i === areaSearchResults.length - 1 && styles.areaResultItemLast,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons name="location" size={18} color={GatiMitraMerchant.primary} />
                            <Text style={styles.areaResultText} numberOfLines={2}>{r.place_name || r.full_address}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
                {(parsedLat() != null && parsedLon() != null) && (
                  <View style={styles.coordsDisplayRow}>
                    <Ionicons name="location" size={16} color={GatiMitraMerchant.primary} />
                    <Text style={styles.coordsDisplayText}>
                      Location: {coordLatStr}, {coordLonStr}
                    </Text>
                  </View>
                )}
                <Text style={styles.fieldLabel}>Full address</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline, isAddressFieldEdited("full_address") && styles.inputEdited]}
                  value={draftAddress.full_address}
                  onChangeText={(t) => setDraftAddress((prev) => ({ ...prev, full_address: t }))}
                  placeholder="Street, area, landmark"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  multiline
                  numberOfLines={2}
                />
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput
                  style={[styles.input, isAddressFieldEdited("city") && styles.inputEdited]}
                  value={draftAddress.city}
                  onChangeText={(t) => setDraftAddress((prev) => ({ ...prev, city: t }))}
                  placeholder="City"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                />
                <Text style={styles.fieldLabel}>State</Text>
                <TextInput
                  style={[styles.input, isAddressFieldEdited("state") && styles.inputEdited]}
                  value={draftAddress.state}
                  onChangeText={(t) => setDraftAddress((prev) => ({ ...prev, state: t }))}
                  placeholder="State"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                />
                <Text style={styles.fieldLabel}>Postal code</Text>
                <TextInput
                  style={[styles.input, isAddressFieldEdited("postal_code") && styles.inputEdited]}
                  value={draftAddress.postal_code}
                  onChangeText={(t) => setDraftAddress((prev) => ({ ...prev, postal_code: t }))}
                  placeholder="Postal code"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  keyboardType="number-pad"
                />
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable onPress={() => setEditAddressModalVisible(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                  <Text style={styles.modalBtnTextSecondary}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const payload = buildAddressPayload();
                    if (Object.keys(payload).length === 0) {
                      setEditAddressModalVisible(false);
                      return;
                    }
                    if (payload.full_address !== undefined && !String(payload.full_address).trim()) return;
                    setEditAddressModalVisible(false);
                    setConfirmModal({
                      visible: true,
                      type: "address",
                      message: "Save only the changed address fields?",
                      payload,
                    });
                  }}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                >
                  <Text style={styles.modalBtnTextPrimary}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Pickup instructions modal */}
      <Modal visible={editPickupModalVisible} transparent animationType="fade" onRequestClose={() => setEditPickupModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditPickupModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboardWrap}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{pickupInstruction ? "Edit pickup instructions" : "Add pickup instructions"}</Text>
                <Pressable onPress={() => setEditPickupModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </Pressable>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.fieldLabel}>Instructions for delivery partners</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={draftPickupInstruction}
                  onChangeText={setDraftPickupInstruction}
                  placeholder="e.g. Ring the bell, collect from counter"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={styles.modalFooter}>
                <Pressable onPress={() => setEditPickupModalVisible(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                  <Text style={styles.modalBtnTextSecondary}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSavePickupInstruction} disabled={saving} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnTextPrimary}>Save</Text>}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Confirmation modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={() => setConfirmModal((p) => ({ ...p, visible: false }))}>
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmModal((p) => ({ ...p, visible: false }))}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Confirm update</Text>
            <Text style={styles.confirmMessage}>{confirmModal.message}</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirmModal((p) => ({ ...p, visible: false }))} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                <Text style={styles.modalBtnTextSecondary}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmSave} disabled={saving} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnTextPrimary}>Yes, update</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <StoreLogoPhotoOptionsSheet
        visible={logoPhotoSheetVisible}
        hasLogo={Boolean(outlet.parent_logo_url?.trim())}
        onClose={() => setLogoPhotoSheetVisible(false)}
        onPhotoSelected={handleLogoPhotoSelected}
        onRemovePhoto={outlet.parent_logo_url?.trim() ? handleRemoveLogoPhoto : undefined}
      />

      {/* Success toast */}
      {toast.visible && (
        <View style={styles.toastWrap}>
          <View style={styles.toast}>
            <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.success} />
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  backBtn: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderRadius: 10 },
  backBtnText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 10,
  },
  retryBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 40 },

  photoCard: {
    marginBottom: 10,
    borderRadius: CARD_RADIUS,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  bannerBox: {
    position: "relative",
    width: "100%",
    borderRadius: CARD_RADIUS,
    overflow: "visible",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    ...GatiMitraMerchant.shadowSm,
  },
  bannerWrap: {
    position: "relative",
    width: "100%",
    overflow: "visible",
    borderTopLeftRadius: CARD_RADIUS - 1,
    borderTopRightRadius: CARD_RADIUS - 1,
  },
  bannerImg: {
    width: "100%",
    height: 130,
    borderTopLeftRadius: CARD_RADIUS - 1,
    borderTopRightRadius: CARD_RADIUS - 1,
  },
  bannerPlaceholder: {
    width: "100%",
    height: 130,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderTopLeftRadius: CARD_RADIUS - 1,
    borderTopRightRadius: CARD_RADIUS - 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  bannerPlaceholderText: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "500",
  },
  logoCard: {
    position: "absolute",
    left: 12,
    bottom: -32,
    flexDirection: "column",
    alignItems: "flex-start",
    padding: 10,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  logoImgWrap: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  logoImg: { width: "100%", height: "100%" },
  editPhotoBtn: { paddingVertical: 6, paddingRight: 4 },
  editPhotoText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  bannerSpacer: { height: 52 },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 6 },
  infoCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  infoBlock: { paddingVertical: 6 },
  infoDivider: { height: 1, backgroundColor: GatiMitraMerchant.divider, marginVertical: 4 },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  editLink: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  fieldValue: { fontSize: 14, color: GatiMitraMerchant.textPrimary, marginTop: 2 },
  cuisinePlainText: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    marginTop: 4,
    lineHeight: 20,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    paddingVertical: 6,
  },
  showMoreText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  pressed: { opacity: 0.7 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalKeyboardWrap: { width: "100%", maxWidth: 400, maxHeight: "90%", flex: 1 },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowCard,
  },
  modalCardFlex: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    flex: 1,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowCard,
  },
  allCuisinesModalCard: {
    maxHeight: Dimensions.get("window").height * 0.7,
    height: Dimensions.get("window").height * 0.7,
  },
  allCuisinesScroll: {
    flex: 1,
    minHeight: 0,
  },
  allCuisinesPlainScrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  allCuisinesPlainText: { fontSize: 14, color: GatiMitraMerchant.textPrimary, lineHeight: 22 },
  cuisineLoadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cuisineLoadingText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  cuisineEmptyHint: { fontSize: 13, color: GatiMitraMerchant.textTertiary, fontStyle: "italic", paddingVertical: 4 },
  cuisineCatalogScroll: { maxHeight: 200, minHeight: 80 },
  cuisineCatalogScrollContent: { paddingHorizontal: 16, paddingBottom: 8 },
  cuisineCatalogEmpty: { fontSize: 13, color: GatiMitraMerchant.textTertiary, paddingVertical: 12 },
  cuisineCatalogRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  cuisineCatalogRowText: { fontSize: 15, color: GatiMitraMerchant.textPrimary, flex: 1, paddingRight: 8 },
  modalChipScroll: { flex: 1, minHeight: 0, maxHeight: 180 },
  modalChipScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  modalBody: { padding: 16 },
  modalBodyScroll: { padding: 16, paddingBottom: 24 },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.divider,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BUTTON_RADIUS,
    minWidth: 88,
    alignItems: "center",
  },
  modalBtnPrimary: { backgroundColor: GatiMitraMerchant.primary },
  modalBtnSecondary: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  modalBtnTextPrimary: { fontSize: 15, fontWeight: "600", color: "#fff" },
  modalBtnTextSecondary: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginTop: 6,
    marginBottom: 12,
  },
  inputMultiline: { minHeight: 56, textAlignVertical: "top" },
  addCuisineRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 12 },
  addCuisineInput: { flex: 1, marginBottom: 0 },
  addCuisineBtn: {
    paddingHorizontal: 16,
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: BUTTON_RADIUS,
  },
  addCuisineBtnDisabled: { opacity: 0.5 },
  addCuisineBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  draftChipRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  chipRemove: { padding: 4 },
  modalScroll: { maxHeight: 340 },
  modalScrollContent: { padding: 16, paddingBottom: 24 },
  modalChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 20,
    ...GatiMitraMerchant.shadowCard,
  },
  confirmTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  confirmMessage: { fontSize: 15, color: GatiMitraMerchant.textSecondary, lineHeight: 22, marginBottom: 20 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  toastWrap: {
    position: "absolute",
    left: H_PADDING,
    right: H_PADDING,
    bottom: 100,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: GatiMitraMerchant.textPrimary,
    borderRadius: BUTTON_RADIUS,
    ...GatiMitraMerchant.shadowSm,
  },
  toastText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  modalChip: {
    backgroundColor: GatiMitraMerchant.primary + "18",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modalChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  fieldHint: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 2, marginBottom: 2 },
  mapWrap: { height: 180, borderRadius: 10, overflow: "hidden", marginTop: 8, marginBottom: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  mapWebView: { width: "100%", height: "100%", backgroundColor: GatiMitraMerchant.surfaceSubtle },
  addressModalSafeArea: { flex: 1, backgroundColor: "transparent" },
  addressModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  addressModalWrap: { flex: 1, width: "100%", maxHeight: "100%", justifyContent: "flex-end" },
  addressModalCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: CARD_RADIUS + 4,
    borderTopRightRadius: CARD_RADIUS + 4,
    overflow: "hidden",
    height: Dimensions.get("window").height * 0.92,
    maxHeight: Dimensions.get("window").height * 0.92,
    ...GatiMitraMerchant.shadowCard,
  },
  addressModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  addressModeLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  addressMapSection: { position: "relative", height: 220, borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.divider },
  mapWrapLarge: { width: "100%", height: "100%", backgroundColor: GatiMitraMerchant.surfaceSubtle },
  mapLoadingBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  mapLoadingText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  addressFormScroll: { flex: 1, minHeight: 0 },
  addressFormScrollContent: { padding: 16, paddingBottom: 48 },
  inputEdited: { borderColor: GatiMitraMerchant.primary, backgroundColor: GatiMitraMerchant.primary + "08" },
  areaSearchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  areaSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
  },
  areaSearchBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  areaSearchBtnDisabled: { opacity: 0.5 },
  areaResultsList: { marginBottom: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 10, overflow: "hidden" },
  areaResultItem: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.divider },
  areaResultItemLast: { borderBottomWidth: 0 },
  areaResultText: { flex: 1, fontSize: 14, color: GatiMitraMerchant.textPrimary },
  coordsLabelsRow: {
    flexDirection: "row",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  coordsLabelAbove: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.5,
  },
  coordsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  coordInputPlain: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  searchLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
  },
  searchLocationBtnDisabled: { opacity: 0.5 },
  searchLocationBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  coordsDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  coordsDisplayText: { fontSize: 13, color: GatiMitraMerchant.textSecondary, fontWeight: "500" },
  mapLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  mapLinkText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },

  linksCard: {
    marginTop: 2,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  linkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.divider },
  linkRowLast: { borderBottomWidth: 0 },
  linkRowPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  linkText: { flex: 1, fontSize: 14, fontWeight: "500", color: GatiMitraMerchant.textPrimary },
});
