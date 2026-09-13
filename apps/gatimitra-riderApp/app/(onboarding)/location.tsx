// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { reverseGeocode } from "@/src/services/location/reverseGeocoding";
import * as Location from "expo-location";
import {
  fetchOnboardingDistricts,
  fetchOnboardingStates,
  resolveOnboardingGeo,
  saveOnboardingWorkLocation,
  fetchRiderHiringStatus,
  type GeoHierarchyNode,
  type ResolvedWorkLocation,
  type RiderHiringStatusResult,
} from "@/src/services/onboardingGeo.service";
import { Button } from "@/src/components/ui/Button";
import { ONBOARDING_PAGE_BG } from "@/src/components/onboarding/OnboardingTopBar";
import { resolveOnboardingHref } from "@/src/lib/onboarding-routes";
import { openOnboardingIssueSupportTicket } from "@/src/lib/rider-support-navigation";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { useQueryClient } from "@tanstack/react-query";
import { showWorkingLocationSuccess } from "@/src/stores/workingLocationSuccessStore";

type LocationSource = "gps_auto" | "manual_select" | "manual_other";
type PickerLevel = "state" | "district" | null;

const OTHER_ID = "__other__";
/** Transparent onboarding header ≈ safe-area + bar chips + extra gap so content sits lower. */
const HEADER_CLEARANCE = 88;
const CONTENT_TOP_EXTRA = 36;
const GPS_FIX_TIMEOUT_MS = 4500;
const GEOCODE_TIMEOUT_MS = 2000;

/** In-memory district lists keyed by stateId — makes state→district cascade feel instant. */
const districtListCache = new Map<string, GeoHierarchyNode[]>();
const districtListInflight = new Map<string, Promise<GeoHierarchyNode[]>>();

async function loadDistrictsForState(
  token: string,
  stateId: string,
): Promise<GeoHierarchyNode[]> {
  const cached = districtListCache.get(stateId);
  if (cached) return cached;
  const existing = districtListInflight.get(stateId);
  if (existing) return existing;
  const pending = fetchOnboardingDistricts(token, { stateId })
    .then((res) => {
      const list = res.districts ?? [];
      districtListCache.set(stateId, list);
      districtListInflight.delete(stateId);
      return list;
    })
    .catch((err) => {
      districtListInflight.delete(stateId);
      throw err;
    });
  districtListInflight.set(stateId, pending);
  return pending;
}
const RESOLVE_TIMEOUT_MS = 6000;

/** Hide Region row when DB value is NA / empty / placeholder / system junk. */
function isRegionHidden(name: string | null | undefined): boolean {
  const v = String(name || "").trim();
  if (!v) return true;
  return /^(na|n\/a|n\.a\.?|none|null|nil|-|—|–|not\s*available|not\s*applicable|divreportingcircle)$/i.test(
    v,
  );
}

function hasAuthoritativeLocation(args: {
  locationSource?: string | null;
  state?: string | null;
  district?: string | null;
  stateId?: string | null;
  districtId?: string | null;
}): boolean {
  if (args.locationSource) return true;
  return Boolean(
    (args.stateId || args.state?.trim()) && (args.districtId || args.district?.trim()),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v as T | null).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; returnTo?: string }>();
  const isWorkingUpdate = String(params.mode || "") === "working_update";
  const session = useSessionStore((s) => s.session);
  const { data, setData } = useOnboardingStore();
  const queryClient = useQueryClient();
  const { data: riderStatus } = useRiderStatus(data.riderId);

  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const bootstrappedRef = React.useRef(false);

  const [source, setSource] = useState<LocationSource | null>(data.locationSource ?? null);
  const [stateName, setStateName] = useState(data.state ?? "");
  const [regionName, setRegionName] = useState(
    isRegionHidden(data.region) ? "" : (data.region ?? ""),
  );
  const [districtName, setDistrictName] = useState(data.district ?? "");
  const [stateId, setStateId] = useState(data.stateId ?? null);
  const [regionId, setRegionId] = useState(data.regionId ?? null);
  const [districtId, setDistrictId] = useState(data.districtId ?? null);
  const [lat, setLat] = useState(data.lat ?? null);
  const [lon, setLon] = useState(data.lon ?? null);
  const [pincode, setPincode] = useState(data.pincode ?? "");
  const [city, setCity] = useState(data.city ?? "");
  const [otherState, setOtherState] = useState(data.locationOtherState ?? "");
  const [otherDistrict, setOtherDistrict] = useState(data.locationOtherDistrict ?? "");
  const [unmatched, setUnmatched] = useState(false);

  const [pickerLevel, setPickerLevel] = useState<PickerLevel>(null);
  const [pickerItems, setPickerItems] = useState<GeoHierarchyNode[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showOtherForm, setShowOtherForm] = useState(
    data.locationSource === "manual_other",
  );
  const [hiring, setHiring] = useState<RiderHiringStatusResult | null>(null);
  const [hiringSheetOpen, setHiringSheetOpen] = useState(false);
  /** State-row / picker: false when that state is Explicit OFF (NOT HIRING). */
  const [stateHiringAllowed, setStateHiringAllowed] = useState<boolean | null>(null);

  const token = session?.accessToken ?? "";

  const refreshHiring = useCallback(
    async (args: {
      stateId?: string | null;
      regionId?: string | null;
      districtId?: string | null;
      state?: string;
      region?: string;
      district?: string;
      manualOther?: boolean;
      openSheetIfBlocked?: boolean;
    }) => {
      if (!token) {
        setHiring(null);
        return;
      }
      // Need at least a state name or id (or Other) before querying.
      if (!args.stateId && !args.regionId && !args.districtId && !args.state?.trim() && !args.manualOther) {
        setHiring(null);
        return;
      }
      try {
        const res = await fetchRiderHiringStatus(token, {
          riderId: data.riderId,
          stateId: args.stateId,
          regionId: args.regionId,
          districtId: args.districtId,
          state: args.state,
          region: args.region,
          district: args.district,
          manualOther: args.manualOther,
        });
        setHiring(res);
        if (args.openSheetIfBlocked && res.hiringAllowed === false) {
          setPickerLevel(null);
          setHiringSheetOpen(true);
        }
      } catch {
        // Keep prior status if known; otherwise fail closed so OFF districts never look hireable.
        setHiring((prev) =>
          prev ?? {
            success: false,
            hiringAllowed: false,
            status: "NOT_HIRING",
            source: "none",
          },
        );
      }
    },
    [token, data.riderId],
  );

  const applyResolved = useCallback((loc: ResolvedWorkLocation, nextSource: LocationSource) => {
    if (loc.state.name) setStateName(loc.state.name);
    const nextRegionName = loc.region.name || "";
    if (loc.region.id) setRegionId(loc.region.id);
    setRegionName(isRegionHidden(nextRegionName) ? "" : nextRegionName);
    if (loc.district.name) setDistrictName(loc.district.name);
    if (loc.state.id) setStateId(loc.state.id);
    if (loc.district.id) setDistrictId(loc.district.id);
    if (loc.pincode) setPincode(loc.pincode);
    if (loc.city || loc.district.name) setCity(loc.city || loc.district.name || "");
    setSource(nextSource);
    setUnmatched(Boolean(loc.unmatched));
    if (loc.district.id || loc.district.name) setShowOtherForm(false);
    void refreshHiring({
      stateId: loc.state.id,
      regionId: loc.region.id,
      districtId: loc.district.id,
      state: loc.state.name || undefined,
      region: isRegionHidden(nextRegionName) ? undefined : nextRegionName || undefined,
      district: loc.district.name || undefined,
      openSheetIfBlocked: true,
    });
  }, [refreshHiring]);

  const captureGps = useCallback(async () => {
    setDetecting(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const perm = await permissionManager.requestLocationForeground();
      if (perm.status !== "granted") {
        setPermissionDenied(true);
        setError(
          "Location permission is off. You can still select State and District manually.",
        );
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setError("GPS is off. Turn on location or select State and District manually.");
      return;
    }

      const [lastKnown, fresh] = await Promise.all([
        Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null),
        withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            maximumAge: 30_000,
          }),
          GPS_FIX_TIMEOUT_MS,
        ),
      ]);
      const position = fresh ?? lastKnown;
      if (!position) {
        setError("Could not get GPS quickly. Select State and District manually.");
        return;
      }

      const nextLat = parseFloat(position.coords.latitude.toFixed(8));
      const nextLon = parseFloat(position.coords.longitude.toFixed(8));
      setLat(nextLat);
      setLon(nextLon);

      let stateHint: string | undefined;
      let districtHint: string | undefined;
      let cityHint: string | undefined;
      let pinHint: string | undefined;
      const addr = await withTimeout(reverseGeocode(nextLat, nextLon, 1), GEOCODE_TIMEOUT_MS);
      if (addr) {
        stateHint = addr.state && addr.state !== "Unknown" ? addr.state : undefined;
        districtHint = addr.city && addr.city !== "Unknown" ? addr.city : undefined;
        cityHint = districtHint;
        pinHint = addr.pincode || undefined;
        if (pinHint) setPincode(pinHint);
        if (cityHint) setCity(cityHint);
      }

      if (!token) {
        if (stateHint) setStateName(stateHint);
        if (districtHint) setDistrictName(districtHint);
        setSource("gps_auto");
        setUnmatched(true);
        await setData({
          state: stateHint,
          district: districtHint,
          city: cityHint,
          pincode: pinHint,
          lat: nextLat,
          lon: nextLon,
          locationSource: "gps_auto",
        });
        return;
      }

      const res = await withTimeout(
        resolveOnboardingGeo(token, {
          lat: nextLat,
          lng: nextLon,
          pincode: pinHint,
          stateHint,
          districtHint,
          cityHint,
        }),
        RESOLVE_TIMEOUT_MS,
      );
      if (res?.location) {
        applyResolved(res.location, "gps_auto");
        const loc = res.location;
        const regionLabel = isRegionHidden(loc.region.name) ? undefined : loc.region.name || undefined;
        await setData({
          lat: nextLat,
          lon: nextLon,
          city: loc.city || loc.district.name || undefined,
          state: loc.state.name || undefined,
          region: regionLabel,
          district: loc.district.name || undefined,
          pincode: loc.pincode || pinHint || undefined,
          stateId: loc.state.id || undefined,
          regionId: loc.region.id || undefined,
          districtId: loc.district.id || undefined,
          locationSource: "gps_auto",
          locationOtherState: undefined,
          locationOtherDistrict: undefined,
        });
      } else {
        if (stateHint) setStateName(stateHint);
        if (districtHint) setDistrictName(districtHint);
        setSource("gps_auto");
        setUnmatched(true);
        setError("We could not match your area in the list. Use Change Location or Other.");
        await setData({
          lat: nextLat,
          lon: nextLon,
          state: stateHint,
          district: districtHint,
          city: cityHint,
          pincode: pinHint,
          locationSource: "gps_auto",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not detect location");
    } finally {
      setDetecting(false);
    }
  }, [applyResolved, token, setData]);

  const persistManualSelection = useCallback(
    async (patch: {
      state?: string;
      region?: string;
      district?: string;
      stateId?: string | null;
      regionId?: string | null;
      districtId?: string | null;
      city?: string;
      locationSource: LocationSource;
      locationOtherState?: string;
      locationOtherDistrict?: string;
    }) => {
      await setData({
        state: patch.state,
        region: patch.region,
        district: patch.district,
        stateId: patch.stateId || undefined,
        regionId: patch.regionId || undefined,
        districtId: patch.districtId || undefined,
        city: patch.city,
        locationSource: patch.locationSource,
        locationOtherState: patch.locationOtherState,
        locationOtherDistrict: patch.locationOtherDistrict,
      });
    },
    [setData],
  );

  // Hydrate once from persisted store / server — never overwrite MANUAL with GPS.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    const ha = riderStatus?.homeAddress;
    const src = (data.locationSource || ha?.locationSource) as LocationSource | undefined;
    const nextState = data.state || ha?.state || "";
    const nextRegion = data.region || ha?.region || "";
    const nextDistrict = data.district || ha?.district || "";
    const nextCity = data.city || ha?.city || "";
    const saved = hasAuthoritativeLocation({
      locationSource: src,
      state: nextState,
      district: nextDistrict,
      stateId: data.stateId || ha?.stateId,
      districtId: data.districtId || ha?.districtId,
    });

    // Wait for status when we have riderId but nothing local yet (cold start).
    if (!saved && data.riderId && riderStatus === undefined) return;

    bootstrappedRef.current = true;

    if (nextState) setStateName(nextState);
    setRegionName(isRegionHidden(nextRegion) ? "" : nextRegion);
    if (nextDistrict) setDistrictName(nextDistrict);
    if (nextCity) setCity(nextCity);
    if (data.stateId || ha?.stateId) setStateId(data.stateId || ha?.stateId || null);
    if (data.regionId || ha?.regionId) setRegionId(data.regionId || ha?.regionId || null);
    if (data.districtId || ha?.districtId) {
      setDistrictId(data.districtId || ha?.districtId || null);
    }
    if (src) setSource(src);
    else if (nextState && nextDistrict) setSource("manual_select");
    if (data.lat != null || ha?.lat != null) setLat(data.lat ?? ha?.lat ?? null);
    if (data.lon != null || ha?.lon != null) setLon(data.lon ?? ha?.lon ?? null);
    if (data.pincode || ha?.pincode) setPincode(data.pincode || ha?.pincode || "");
    if (src === "manual_other" || data.locationOtherState || ha?.locationOtherState) {
      setShowOtherForm(true);
      setOtherState(data.locationOtherState || ha?.locationOtherState || "");
      setOtherDistrict(data.locationOtherDistrict || ha?.locationOtherDistrict || "");
    }

    if (saved) {
      setDetecting(false);
      void refreshHiring({
        stateId: data.stateId || ha?.stateId,
        regionId: data.regionId || ha?.regionId,
        districtId: data.districtId || ha?.districtId,
        state: nextState || undefined,
        region: isRegionHidden(nextRegion) ? undefined : nextRegion || undefined,
        district: nextDistrict || undefined,
        manualOther: src === "manual_other",
        openSheetIfBlocked: false,
      });
        return;
      }

    // First visit only — no saved location yet.
    void captureGps();
  }, [data, riderStatus, captureGps, refreshHiring]);

  useEffect(() => {
    if (!showOtherForm) return;
    const t = setTimeout(() => {
      void refreshHiring({
        manualOther: true,
        state: otherState || stateName,
        district: otherDistrict || districtName,
        openSheetIfBlocked: false,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [showOtherForm, otherState, otherDistrict, stateName, districtName, refreshHiring]);

  // State-row badge: hiring for the selected state alone (ignores district overrides).
  useEffect(() => {
    if (!token || !stateId) {
      if (!stateId) setStateHiringAllowed(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchRiderHiringStatus(token, {
          stateId,
          state: stateName || undefined,
        });
        if (!cancelled) setStateHiringAllowed(res.hiringAllowed !== false);
    } catch {
        /* keep prior */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, stateId, stateName]);

  const openPicker = async (
    level: PickerLevel,
    opts?: { stateId?: string | null },
  ) => {
    if (!token || !level) return;
    setPickerLevel(level);
    setSearch("");
    try {
      if (level === "state") {
        setPickerLoading(true);
        const res = await fetchOnboardingStates(token);
        setPickerItems(res.states ?? []);
      } else if (level === "district") {
        let sid = opts?.stateId ?? stateId;
        if (!sid && stateName.trim()) {
          const states = await fetchOnboardingStates(token);
          const match = (states.states ?? []).find(
            (s) => s.name.toLowerCase() === stateName.trim().toLowerCase(),
          );
          if (match) {
            sid = match.id;
            setStateId(match.id);
            setStateName(match.name);
          }
        }
        if (!sid) {
          setError("Select a state first");
          setPickerLevel(null);
          return;
        }
        const cached = districtListCache.get(sid);
        if (cached) {
          setPickerItems(cached);
          setPickerLoading(false);
          // Refresh quietly so hiring flags stay fresh.
          void loadDistrictsForState(token, sid).then((list) => {
            setPickerItems(list);
          });
          return;
        }
        // Don't flash previous state's list while loading.
        setPickerItems([]);
        setPickerLoading(true);
        const list = await loadDistrictsForState(token, sid);
        setPickerItems(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load locations");
      setPickerLevel(null);
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? pickerItems.filter((i) => i.name.toLowerCase().includes(q))
      : pickerItems;
    // Duplicate district names (same name under different regions) — disambiguate in the list.
    const nameCounts = new Map<string, number>();
    for (const i of base) {
      const key = i.name.trim().toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    }
    const labeled = base.map((i) => {
      const dup = (nameCounts.get(i.name.trim().toLowerCase()) || 0) > 1;
      const regionLabel = i.regionName?.trim();
      if (dup && regionLabel && !isRegionHidden(regionLabel)) {
        return { ...i, listLabel: `${i.name} · ${regionLabel}` };
      }
      return { ...i, listLabel: i.name };
    });
    const withOther = [
      ...labeled,
      {
        id: OTHER_ID,
        name: "Other (enter manually)",
        listLabel: "Other (enter manually)",
      },
    ];
    const activeId =
      pickerLevel === "state"
        ? showOtherForm
          ? OTHER_ID
          : stateId
        : pickerLevel === "district"
          ? showOtherForm
            ? OTHER_ID
            : districtId
          : null;
    if (!activeId) return withOther;
    const activeIdx = withOther.findIndex((i) => i.id === activeId);
    if (activeIdx <= 0) return withOther;
    const active = withOther[activeIdx]!;
    return [active, ...withOther.slice(0, activeIdx), ...withOther.slice(activeIdx + 1)];
  }, [pickerItems, search, pickerLevel, stateId, districtId, showOtherForm]);

  const onPickItem = (item: GeoHierarchyNode) => {
    if (item.id === OTHER_ID) {
      setShowOtherForm(true);
      setSource("manual_other");
      setPickerLevel(null);
      if (pickerLevel === "state") {
        setStateId(null);
        setRegionId(null);
        setDistrictId(null);
        setRegionName("");
        setDistrictName("");
      } else if (pickerLevel === "district") {
        setDistrictId(null);
        setRegionId(null);
        setRegionName("");
      }
      void persistManualSelection({
        state: otherState || stateName,
        district: otherDistrict || districtName,
        locationSource: "manual_other",
        locationOtherState: otherState || stateName,
        locationOtherDistrict: otherDistrict || districtName,
      });
      void refreshHiring({
        manualOther: true,
        state: otherState || stateName,
        district: otherDistrict || districtName,
        openSheetIfBlocked: true,
      });
      return;
    }
    setShowOtherForm(false);
    setUnmatched(false);
    setSource("manual_select");
    if (pickerLevel === "state") {
      setStateId(item.id);
      setStateName(item.name);
      const allowed = item.hiringAllowed !== false;
      setStateHiringAllowed(allowed);
      setRegionId(null);
      setRegionName("");
      setDistrictId(null);
      setDistrictName("");
      setOtherState("");
      setOtherDistrict("");
      void persistManualSelection({
        state: item.name,
        region: undefined,
        district: undefined,
        stateId: item.id,
        regionId: null,
        districtId: null,
        locationSource: "manual_select",
        locationOtherState: undefined,
        locationOtherDistrict: undefined,
      });
      if (!allowed) {
        setPickerLevel(null);
        setHiringSheetOpen(true);
        void refreshHiring({
          stateId: item.id,
          state: item.name,
          openSheetIfBlocked: false,
        });
        return;
      }
      // Start district fetch immediately (shared inflight + cache).
      if (token) void loadDistrictsForState(token, item.id);
      void refreshHiring({
        stateId: item.id,
        state: item.name,
        openSheetIfBlocked: true,
      });
      // Cascade instantly with the picked state id (don't wait for React state flush).
      void openPicker("district", { stateId: item.id });
    } else if (pickerLevel === "district") {
      setDistrictId(item.id);
      setDistrictName(item.name);
      setCity(item.name);
      const nextRegionId = item.regionId ?? null;
      const nextRegionName = item.regionName ?? "";
      const regionVisible = !isRegionHidden(nextRegionName);
      setRegionId(nextRegionId);
      setRegionName(regionVisible ? nextRegionName : "");
      void persistManualSelection({
        state: stateName,
        region: regionVisible ? nextRegionName : undefined,
        district: item.name,
        stateId,
        regionId: nextRegionId,
        districtId: item.id,
        city: item.name,
        locationSource: "manual_select",
        locationOtherState: undefined,
        locationOtherDistrict: undefined,
      });
      const districtAllowed = item.hiringAllowed !== false;
      setPickerLevel(null);
      if (!districtAllowed) {
        setHiringSheetOpen(true);
        void refreshHiring({
          stateId,
          regionId: nextRegionId,
          districtId: item.id,
          state: stateName,
          region: regionVisible ? nextRegionName : undefined,
          district: item.name,
          openSheetIfBlocked: false,
        });
        return;
      }
      void refreshHiring({
        stateId,
        regionId: nextRegionId,
        districtId: item.id,
        state: stateName,
        region: regionVisible ? nextRegionName : undefined,
        district: item.name,
        openSheetIfBlocked: true,
      });
    } else {
      setPickerLevel(null);
    }
  };

  const hiringBlocked = hiring?.hiringAllowed === false;
  const showRegionRow = !showOtherForm && !isRegionHidden(regionName);

  const canContinue = useMemo(() => {
    if (hiringBlocked) return false;
    if (source === "manual_other") {
  return (
        (otherState.trim() || stateName.trim()).length >= 2 &&
        (otherDistrict.trim() || districtName.trim()).length >= 2
      );
    }
    return Boolean(stateName.trim() && (districtName.trim() || districtId));
  }, [
    hiringBlocked,
    source,
    otherState,
    otherDistrict,
    stateName,
    districtName,
    districtId,
  ]);

  const sourceLabel =
    source === "gps_auto"
      ? "Current location (GPS)"
      : source === "manual_other"
        ? "Entered manually (Other)"
        : source === "manual_select"
          ? "Selected manually"
          : detecting
            ? "Detecting…"
            : "Not set yet";

  const handleContinue = async () => {
    if (hiringBlocked) {
      setPickerLevel(null);
      setHiringSheetOpen(true);
      return;
    }
    if (!canContinue || !token) {
      setError(!token ? "Please sign in again" : "Select or enter State and District");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalSource: LocationSource = source || "manual_select";
      const payload = {
        riderId: data.riderId,
        lat,
        lon,
        city: city || districtName || otherDistrict || stateName,
        state: finalSource === "manual_other" ? otherState.trim() || stateName : stateName,
        region: regionName || null,
        district:
          finalSource === "manual_other"
            ? otherDistrict.trim() || districtName
            : districtName,
        pincode: pincode || null,
        address: [districtName || otherDistrict, regionName, stateName || otherState]
          .filter(Boolean)
          .join(", "),
        stateId: finalSource === "manual_other" ? null : stateId,
        regionId: finalSource === "manual_other" ? null : regionId,
        districtId: finalSource === "manual_other" ? null : districtId,
        locationSource: finalSource,
        locationOtherState:
          finalSource === "manual_other" ? otherState.trim() || stateName : null,
        locationOtherDistrict:
          finalSource === "manual_other" ? otherDistrict.trim() || districtName : null,
      };
      await saveOnboardingWorkLocation(token, payload);
      await setData({
        lat: lat ?? undefined,
        lon: lon ?? undefined,
        city: payload.city,
        state: payload.state,
        region: payload.region || undefined,
        district: payload.district || undefined,
        pincode: payload.pincode || undefined,
        address: payload.address,
        stateId: payload.stateId || undefined,
        regionId: payload.regionId || undefined,
        districtId: payload.districtId || undefined,
        locationSource: finalSource,
        locationOtherState: payload.locationOtherState || undefined,
        locationOtherDistrict: payload.locationOtherDistrict || undefined,
      });
      if (data.riderId) {
        await queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
      }
      // Post-duty mismatch: save working location then return so rider can turn ON-DUTY.
      if (isWorkingUpdate) {
        showWorkingLocationSuccess(payload.address || payload.city || payload.state);
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
        return;
      }
      // Resume first incomplete step — never force Aadhaar if KYC already done.
      const next = resolveOnboardingHref(
        riderStatus?.onboardingStatus,
        data.currentStep,
        (riderStatus?.nextOnboardingStep as any) ?? null,
        {
          vehicleChoice: data.vehicleChoice || riderStatus?.vehicleChoice || undefined,
          vehicleOnboardingFlow:
            data.vehicleOnboardingFlow ||
            (riderStatus?.vehicleOnboardingFlow === "dl_rc" ||
            riderStatus?.vehicleOnboardingFlow === "rental_ev" ||
            riderStatus?.vehicleOnboardingFlow === "payment"
              ? riderStatus.vehicleOnboardingFlow
              : undefined),
          vehicleOnboardingSubmittedFor:
            data.vehicleOnboardingSubmittedFor ||
            riderStatus?.vehicleDocsSubmittedFor ||
            undefined,
          bankAccountOnboardingDone:
            data.bankAccountOnboardingDone || riderStatus?.bankAccountOnboardingDone,
          accountStatus: riderStatus?.accountStatus,
          approvalStatus: riderStatus?.approvalStatus,
          paymentCompleted: riderStatus?.paymentCompleted,
          referralPromptHandled: true,
          workLocationConfirmed: true,
          completedOnboardingSteps: riderStatus?.completedOnboardingSteps,
        },
      );
      router.replace(
        next === "/(onboarding)/location" ? "/(onboarding)/aadhaar" : next,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save location";
      if (/NOT_HIRING|hiring is currently unavailable/i.test(msg)) {
        setPickerLevel(null);
        setHiringSheetOpen(true);
        setHiring((prev) =>
          prev
            ? { ...prev, hiringAllowed: false, status: "NOT_HIRING" }
            : {
                success: true,
                hiringAllowed: false,
                status: "NOT_HIRING",
                source: "none",
              },
        );
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
          contentContainerStyle={[
            styles.scroll,
            // headerTransparent overlays content — clear the floating top bar.
            { paddingTop: insets.top + HEADER_CLEARANCE + CONTENT_TOP_EXTRA },
          ]}
          keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          <Text style={styles.title}>Your work location</Text>
          <Text style={styles.subtitle}>
            Select your State and District. We’ll fill Region from our coverage map when it
            applies.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                {permissionDenied ? "Permission needed" : "Location notice"}
          </Text>
              <Text style={styles.errorBody}>{error}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button onPress={() => void captureGps()} variant="outline" size="sm">
                  Current Location
                </Button>
                {permissionDenied ? (
                  <Button
                    onPress={() => void permissionManager.openSettings("location_foreground")}
                    variant="outline"
                    size="sm"
                  >
                    Open settings
                  </Button>
                ) : null}
        </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Ionicons name="location-outline" size={14} color="#166534" />
                <Text style={styles.badgeText}>{sourceLabel}</Text>
              </View>
              {hiringBlocked ? (
                <Pressable onPress={() => setHiringSheetOpen(true)} hitSlop={8}>
                  <Text style={styles.notHiringChip}>NOT HIRING</Text>
                </Pressable>
              ) : null}
              {unmatched && source === "gps_auto" && !hiringBlocked ? (
                <Text style={styles.warnChip}>Not in list — use Change Location</Text>
              ) : null}
            </View>

            {hiringBlocked ? (
              <Pressable style={styles.notHiringBanner} onPress={() => setHiringSheetOpen(true)}>
                <Text style={styles.notHiringPlace}>
                  {[districtName || otherDistrict, showRegionRow ? regionName : null, stateName || otherState]
                    .filter(Boolean)
                    .join(", ") || "Selected area"}
              </Text>
                <Text style={styles.notHiringHint}>
                  Rider hiring is unavailable here. Tap for details or Change Location.
              </Text>
              </Pressable>
            ) : null}

            <FieldRow
              label="State"
              value={showOtherForm ? otherState || stateName : stateName}
              placeholder="Select state"
              onPress={() => void openPicker("state")}
              notHiring={stateHiringAllowed === false}
            />
            {showRegionRow ? (
              <FieldRow
                label="Region"
                value={regionName}
                placeholder=""
                readOnly
              />
            ) : null}
            <FieldRow
              label="District"
              value={showOtherForm ? otherDistrict || districtName : districtName}
              placeholder="Select district"
              onPress={() => void openPicker("district")}
              disabled={!stateId && !stateName.trim() && !showOtherForm}
            />

            {showOtherForm ? (
              <View style={styles.otherBox}>
                <Text style={styles.otherTitle}>Other location</Text>
                <Text style={styles.muted}>
                  Enter the names if your State or District is not in the list.
                </Text>
                <Text style={styles.inputLabel}>State name</Text>
                <TextInput
                  style={styles.input}
                  value={otherState}
                  onChangeText={(t) => {
                    setOtherState(t);
                    setSource("manual_other");
                  }}
                  onBlur={() => {
                    void persistManualSelection({
                      state: otherState || stateName,
                      district: otherDistrict || districtName,
                      locationSource: "manual_other",
                      locationOtherState: otherState || stateName,
                      locationOtherDistrict: otherDistrict || districtName,
                    });
                  }}
                  placeholder="e.g. West Bengal"
                  placeholderTextColor="#94A3B8"
                />
                <Text style={styles.inputLabel}>District name</Text>
                <TextInput
                  style={styles.input}
                  value={otherDistrict}
                  onChangeText={(t) => {
                    setOtherDistrict(t);
                    setSource("manual_other");
                  }}
                  onBlur={() => {
                    void persistManualSelection({
                      state: otherState || stateName,
                      district: otherDistrict || districtName,
                      locationSource: "manual_other",
                      locationOtherState: otherState || stateName,
                      locationOtherDistrict: otherDistrict || districtName,
                    });
                  }}
                  placeholder="e.g. Howrah"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => void captureGps()}
                disabled={detecting}
              >
                {detecting ? (
                  <ActivityIndicator size="small" color="#166534" />
                ) : (
                  <Ionicons name="navigate" size={16} color="#166534" />
                )}
                <Text style={styles.actionBtnPrimaryText}>
                  {detecting ? "Detecting…" : "Current Location"}
              </Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => void openPicker("state")}
                disabled={detecting}
              >
                <Ionicons name="map-outline" size={16} color="#0F172A" />
                <Text style={styles.actionBtnSecondaryText}>Change Location</Text>
              </Pressable>
            </View>
          </View>

          <Button
            onPress={() => void handleContinue()}
            loading={saving}
            disabled={!canContinue || saving}
            size="lg"
          >
            Next
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={pickerLevel != null} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Select {pickerLevel === "state" ? "state" : "district"}
              </Text>
              <Pressable onPress={() => setPickerLevel(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
              </View>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search…"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />
            {pickerLoading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#16A34A" />
            ) : (
              <FlatList
                data={filteredItems}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const notHiring =
                    item.id !== OTHER_ID && item.hiringAllowed === false;
                  const selected =
                    pickerLevel === "state"
                      ? item.id === OTHER_ID
                        ? showOtherForm
                        : item.id === stateId
                      : item.id === OTHER_ID
                        ? showOtherForm
                        : item.id === districtId;
                  const label =
                    "listLabel" in item && item.listLabel ? item.listLabel : item.name;
                  const rowContent = (
                    <>
                      <Text
                        style={[
                          styles.listRowText,
                          item.id === OTHER_ID && { color: "#16A34A", fontWeight: "700" },
                          selected && styles.listRowTextSelected,
                          notHiring && !selected && styles.listRowTextFaded,
                        ]}
                        numberOfLines={2}
                      >
                        {label}
                      </Text>
                      {notHiring ? (
                        <Text
                          style={[
                            styles.notHiringChipInline,
                            selected && styles.notHiringChipOnSelected,
                          ]}
                        >
                          NOT HIRING
                        </Text>
                      ) : null}
                      {selected ? (
                        <Ionicons name="checkmark" size={20} color="#16A34A" />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                      )}
                    </>
                  );
                  if (selected) {
                    return (
                      <Pressable onPress={() => onPickItem(item)}>
                        <LinearGradient
                          colors={["#ECFDF5", "#BBF7D0"]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={[styles.listRow, styles.listRowSelected]}
                        >
                          {rowContent}
                        </LinearGradient>
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      style={[styles.listRow, notHiring && styles.listRowFaded]}
                      onPress={() => onPickItem(item)}
                    >
                      {rowContent}
                    </Pressable>
                  );
                }}
              />
            )}
                </View>
                </View>
      </Modal>

      <Modal visible={hiringSheetOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setHiringSheetOpen(false)} />
          <View style={styles.hiringSheetWrap} pointerEvents="box-none">
            <View style={styles.hiringCloseRow} pointerEvents="box-none">
              <Pressable
                style={styles.hiringCloseFab}
                onPress={() => setHiringSheetOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#374151" />
              </Pressable>
                </View>
            <View style={[styles.hiringSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.hiringHandle} />
              <View style={styles.hiringSheetHeaderRow}>
                <Text style={styles.hiringPlaceTitle} numberOfLines={1}>
                  {districtName || otherDistrict || stateName || otherState || "This area"}
                </Text>
                <Text style={styles.notHiringChipInline}>NOT HIRING</Text>
              </View>
              <Text style={styles.hiringSheetTitle}>Rider hiring isn't available here</Text>
              <Text style={styles.hiringSheetBody}>
                We're currently not hiring riders in this area. You can try a nearby area where
                rider hiring is available.
              </Text>
              <View style={styles.hiringActions}>
                <Button
                  onPress={() => {
                    setHiringSheetOpen(false);
                    void openPicker("state");
                  }}
                  size="lg"
                >
                  Change Location
              </Button>
          <Button
                  variant="outline"
            size="lg"
                  onPress={() => {
                    setHiringSheetOpen(false);
                    const place = [
                      districtName || otherDistrict,
                      stateName || otherState,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    openOnboardingIssueSupportTicket({
                      prefillHint: place
                        ? `Rider hiring isn't available in ${place}. Please help me with work location / hiring.`
                        : "Rider hiring isn't available in my selected area. Please help me with work location / hiring.",
                    });
                  }}
                >
                  Contact Support
          </Button>
        </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FieldRow(props: {
  label: string;
  value: string;
  placeholder: string;
  onPress?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  notHiring?: boolean;
}) {
  const body = (
    <>
      <View style={{ flex: 1, opacity: props.notHiring ? 0.55 : 1 }}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text
          style={props.value ? styles.fieldValue : styles.fieldPlaceholder}
          numberOfLines={1}
        >
          {props.value || props.placeholder}
        </Text>
      </View>
      {props.notHiring ? <Text style={styles.notHiringChipInline}>NOT HIRING</Text> : null}
      {props.readOnly ? null : (
        <Ionicons name="chevron-forward" size={18} color="#16A34A" />
      )}
    </>
  );
  if (props.readOnly) {
    return <View style={styles.fieldRow}>{body}</View>;
  }
  return (
    <Pressable
      onPress={props.disabled ? undefined : props.onPress}
      style={[styles.fieldRow, props.disabled && { opacity: 0.45 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ONBOARDING_PAGE_BG },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 21,
  },
  muted: { fontSize: 14, color: "#64748B", marginTop: 10, textAlign: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnPrimary: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  actionBtnSecondary: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#166534" },
  warnChip: { fontSize: 12, color: "#B45309", alignSelf: "center" },
  notHiringChip: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#B91C1C",
    backgroundColor: "#FEE2E2",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  notHiringChipInline: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#B91C1C",
    backgroundColor: "#FEE2E2",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginLeft: 8,
    flexShrink: 0,
  },
  hiringSheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  notHiringBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    marginBottom: 10,
  },
  notHiringPlace: { fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 4 },
  notHiringHint: { fontSize: 13, color: "#B91C1C", lineHeight: 18 },
  hiringSheetWrap: {
    width: "100%",
  },
  hiringCloseRow: {
    alignItems: "center",
    marginBottom: 12,
    zIndex: 2,
  },
  hiringSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  hiringCloseFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      default: {},
    }),
  },
  hiringActions: {
    gap: 10,
    marginTop: 4,
  },
  hiringHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 14,
  },
  hiringPlaceTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  hiringSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  hiringSheetBody: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 18,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  fieldLabel: { fontSize: 12, color: "#64748B", marginBottom: 2 },
  fieldValue: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  fieldPlaceholder: { fontSize: 16, color: "#94A3B8" },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 14,
  },
  changeText: { fontSize: 15, fontWeight: "700", color: "#16A34A" },
  otherBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  otherTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 4 },
  inputLabel: { fontSize: 12, color: "#64748B", marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: { fontSize: 15, fontWeight: "700", color: "#B91C1C", marginBottom: 4 },
  errorBody: { fontSize: 13, color: "#DC2626", lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "78%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  listRowSelected: {
    borderBottomColor: "#86EFAC",
  },
  listRowFaded: {
    opacity: 0.48,
  },
  listRowText: { fontSize: 16, color: "#0F172A", flex: 1, paddingRight: 4 },
  listRowTextSelected: {
    fontWeight: "700",
    color: "#14532D",
  },
  listRowTextFaded: {
    color: "#64748B",
  },
  notHiringChipOnSelected: {
    opacity: 0.9,
  },
});
