import api from "./api";

export type GeoServiceAvailability = {
  found: boolean;
  food: boolean;
  parcel: boolean;
  ride: boolean;
  pincode: string | null;
  stateName: string | null;
  resolvedLevel: string | null;
};

export type GeoServiceAvailabilityResult =
  | { ok: true; availability: GeoServiceAvailability }
  | { ok: false; error: string };

export async function getGeoServiceAvailability(params: {
  pincode?: string;
  state?: string;
  lat?: number;
  lng?: number;
}): Promise<GeoServiceAvailabilityResult> {
  try {
    const { data } = await api.get<GeoServiceAvailability & { ok: true }>("/v1/geo/services", {
      params: {
        ...(params.pincode ? { pincode: params.pincode } : {}),
        ...(params.state ? { state: params.state } : {}),
        ...(params.lat != null ? { lat: params.lat } : {}),
        ...(params.lng != null ? { lng: params.lng } : {}),
      },
    });
    if (!data?.ok) return { ok: false, error: "Service availability unavailable" };
    const { ok: _ok, ...availability } = data;
    return { ok: true, availability };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    const message =
      axiosErr.response?.data?.message ??
      axiosErr.response?.data?.error ??
      "Could not fetch service availability";
    return { ok: false, error: message };
  }
}
