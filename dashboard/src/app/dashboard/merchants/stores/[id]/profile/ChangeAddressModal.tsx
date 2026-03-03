"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Save, Search, X } from "lucide-react";
import { VerificationLocationMap } from "@/components/verification/VerificationLocationMap";

export type AddressForm = {
  full_address: string;
  landmark: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
};

type ChangeAddressModalProps = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  initialAddress: AddressForm | null;
  onSaved: () => void;
};

const emptyAddress: AddressForm = {
  full_address: "",
  landmark: "",
  city: "",
  state: "",
  postal_code: "",
  latitude: null,
  longitude: null,
};

export function ChangeAddressModal({
  open,
  onClose,
  storeId,
  initialAddress,
  onSaved,
}: ChangeAddressModalProps) {
  const [fullAddress, setFullAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchMode, setSearchMode] = useState<"coordinates" | "manual">("coordinates");
  const prevOpenRef = useRef(false);

  // Only reset form when modal first opens — do not clear search input or coordinates after a search
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    const justOpened = !prevOpenRef.current;
    prevOpenRef.current = true;
    if (justOpened) {
      const a = initialAddress ?? emptyAddress;
      setFullAddress(a.full_address ?? "");
      setLandmark(a.landmark ?? "");
      setCity(a.city ?? "");
      setState(a.state ?? "");
      setPostalCode(a.postal_code ?? "");
      setLat(a.latitude ?? null);
      setLng(a.longitude ?? null);
      setSearchQuery("");
    }
  }, [open, initialAddress]);

  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `/api/merchant/reverse-geocode?lat=${latitude}&lng=${longitude}`
      );
      const data = await res.json();
      if (data?.success) {
        if (data.place_name) setFullAddress(data.place_name);
        if (data.city != null) setCity(data.city);
        if (data.state != null) setState(data.state);
        if (data.postal_code != null) setPostalCode(data.postal_code);
      }
    } catch (_) {}
  }, []);

  const handleCoordinatesChange = useCallback(
    (newLat: number, newLng: number) => {
      setLat(newLat);
      setLng(newLng);
      reverseGeocode(newLat, newLng);
    },
    [reverseGeocode]
  );

  const handleReverseGeocode = useCallback(
    (address: {
      place_name?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
    }) => {
      if (address.place_name) setFullAddress(address.place_name);
      if (address.city != null) setCity(address.city);
      if (address.state != null) setState(address.state);
      if (address.postal_code != null) setPostalCode(address.postal_code);
    },
    []
  );

  const handleSearch = async () => {
    setSearching(true);
    try {
      if (searchMode === "coordinates") {
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        await reverseGeocode(lat, lng);
      } else {
        const q = searchQuery.trim();
        if (!q) return;
        const res = await fetch("/api/merchant/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        const data = await res.json();
        if (data?.success && data.results?.length > 0) {
          const first = data.results[0];
          setLat(first.latitude);
          setLng(first.longitude);
          if (first.place_name) setFullAddress(first.place_name);
          if (first.city != null) setCity(first.city);
          if (first.state != null) setState(first.state);
          if (first.postal_code != null) setPostalCode(first.postal_code);
        }
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            full_address: fullAddress.trim() || undefined,
            landmark: landmark.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            postal_code: postalCode.trim() || undefined,
            latitude: lat != null && Number.isFinite(lat) ? lat : undefined,
            longitude: lng != null && Number.isFinite(lng) ? lng : undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Change Address
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Update your store address. Search or click on the map to set
              location. Existing address is shown below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Search by
                </p>
                <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setSearchMode("coordinates")}
                    className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "coordinates"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    By coordinates
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("manual")}
                    className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "manual"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    By address search
                  </button>
                </div>
              </div>

              {searchMode === "coordinates" ? (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-gray-600">GPS → get exact location</p>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={lat ?? ""}
                      onChange={(e) =>
                        setLat(e.target.value === "" ? null : parseFloat(e.target.value) || null)
                      }
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={lng ?? ""}
                      onChange={(e) =>
                        setLng(e.target.value === "" ? null : parseFloat(e.target.value) || null)
                      }
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={searching || lat == null || lng == null}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="mb-1 text-[11px] font-medium text-gray-600">Address text → get exact location</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Enter address to search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Search
                    </button>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] font-medium text-gray-600">Coordinates (from search)</p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={lat != null && Number.isFinite(lat) ? String(lat) : "—"}
                        className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
                        placeholder="Latitude"
                      />
                      <input
                        type="text"
                        readOnly
                        value={lng != null && Number.isFinite(lng) ? String(lng) : "—"}
                        className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
                        placeholder="Longitude"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Address details
                </p>
                <div className="space-y-1.5">
                  <div>
                    <label className="mb-0.5 block text-[11px] font-medium text-gray-600">
                      Full Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={fullAddress}
                      onChange={(e) => setFullAddress(e.target.value)}
                      className="w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-xs"
                      placeholder="Street, area, landmark"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-gray-600">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-gray-600">State *</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-gray-600">Postal Code *</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] font-medium text-gray-600">Landmark</label>
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                        placeholder="e.g. near Shiv Mandir"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-gray-600 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                Map
              </p>
              <VerificationLocationMap
                latitude={lat}
                longitude={lng}
                onCoordinatesChange={handleCoordinatesChange}
                onReverseGeocode={handleReverseGeocode}
                className="rounded border border-gray-200 overflow-hidden"
              />
              <p className="text-[10px] text-gray-500">
                Drag marker or click on map to set location. Use search above for exact address.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
