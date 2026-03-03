/**
 * Customer addresses and active location.
 * GET/POST /v1/me/addresses, GET/PUT /v1/me/active-location.
 */

import api from "./api";

export type Address = {
  id: number;
  label: string | null;
  fullAddress: string;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isLastUsed: boolean;
};

export type ActiveLocation = {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  lockedForOrder: boolean;
};

export const addressService = {
  async getAddresses(): Promise<Address[]> {
    const { data } = await api.get<Address[]>("/v1/me/addresses");
    return Array.isArray(data) ? data : [];
  },

  async addAddress(body: {
    label?: string | null;
    fullAddress: string;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    country?: string | null;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
  }): Promise<{ id: number }> {
    const { data } = await api.post<{ id: number }>("/v1/me/addresses", body);
    return data;
  },

  async updateAddress(
    id: number,
    body: Partial<{
      label: string | null;
      fullAddress: string;
      landmark: string | null;
      city: string | null;
      state: string | null;
      pincode: string | null;
      country: string | null;
      latitude: number;
      longitude: number;
      isDefault: boolean;
    }>
  ): Promise<void> {
    await api.patch(`/v1/me/addresses/${id}`, body);
  },

  async deleteAddress(id: number): Promise<void> {
    await api.delete(`/v1/me/addresses/${id}`);
  },

  async setAddressDefault(id: number): Promise<void> {
    await api.post(`/v1/me/addresses/${id}/default`);
  },

  async getActiveLocation(): Promise<ActiveLocation> {
    const { data } = await api.get<ActiveLocation>("/v1/me/active-location");
    return data ?? { latitude: null, longitude: null, address: null, lockedForOrder: false };
  },

  async setActiveLocation(params: {
    latitude: number;
    longitude: number;
    address?: string | null;
  }): Promise<{ ok: boolean }> {
    const { data } = await api.put<{ ok: boolean }>("/v1/me/active-location", params);
    return data ?? { ok: true };
  },

  /** Local fallback: popular_locations + saved addresses (for hybrid location search). */
  async getLocationSearchSuggestions(query: string, limit = 10): Promise<LocalSuggestionResult[]> {
    const { data } = await api.get<LocalSuggestionResult[]>("/v1/me/location-search", {
      params: { q: query.trim(), limit },
    });
    return Array.isArray(data) ? data : [];
  },

  /** City→area suggestions (e.g. "Patna" → Kankarbagh, Boring Road, ...). */
  async getCityAreaSuggestions(cityName: string, limit = 10): Promise<LocalSuggestionResult[]> {
    const { data } = await api.get<LocalSuggestionResult[]>("/v1/me/location-suggestions/city", {
      params: { city: cityName.trim(), limit },
    });
    return Array.isArray(data) ? data : [];
  },

  /** Record delivery location for self-learning (call after order placement). */
  async recordDeliveryLocation(params: {
    cityName: string;
    areaName: string;
    displayName?: string | null;
    latitude: number;
    longitude: number;
  }): Promise<void> {
    await api.post("/v1/me/location-record", params);
  },
};

export type LocalSuggestionResult = {
  primary: string;
  secondary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  source: "popular" | "saved_address";
  usageCount?: number;
  city?: string;
  area?: string;
};
