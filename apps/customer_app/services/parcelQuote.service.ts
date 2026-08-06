import api from "./api";
import type { ParcelVehicleCategoryCode } from "@/features/parcel/parcelGuidelinesConfig";

const PARCEL_PREFIX = "/v1/parcel";

export type ParcelFareQuote = {
  eligible: boolean;
  baseFare: number;
  distanceFare: number;
  finalFare: number;
  pricingGeoLevel: string | null;
  pricingGeoRefId: string | null;
};

export type ParcelFareQuoteBatchResult =
  | { ok: true; quotes: Record<string, ParcelFareQuote> }
  | { ok: false; error: string; code?: string };

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string; message?: string };
  return (
    e.code === "ERR_CANCELED" ||
    e.name === "CanceledError" ||
    e.name === "AbortError" ||
    String(e.message ?? "").toLowerCase().includes("canceled")
  );
}

/** One round-trip for parcel fares across vehicle categories (geo slabs). */
export async function getParcelFareQuoteBatch(params: {
  pickupLat: number;
  pickupLng: number;
  tripKm: number;
  vehicleTypes: ParcelVehicleCategoryCode[];
  pickupPincode?: string;
  pickupState?: string;
  signal?: AbortSignal;
}): Promise<ParcelFareQuoteBatchResult> {
  try {
    const { signal: _signal, ...body } = params;
    const { data } = await api.post<{
      ok: true;
      quotes: Record<
        string,
        | {
            ok: true;
            eligible: boolean;
            baseFare: number;
            distanceFare: number;
            finalFare: number;
            pricingGeoLevel: string | null;
            pricingGeoRefId: string | null;
          }
        | { ok: false; code: string; message: string }
      >;
    }>(`${PARCEL_PREFIX}/quote-batch`, body, { signal: params.signal, timeout: 15_000 });

    if (!data?.ok || !data.quotes) return { ok: false, error: "Quote batch unavailable" };

    const quotes: Record<string, ParcelFareQuote> = {};
    for (const [code, raw] of Object.entries(data.quotes)) {
      if (!raw || typeof raw !== "object") continue;
      if ((raw as { ok?: boolean }).ok === false) continue;
      const q = raw as {
        eligible: boolean;
        baseFare: number;
        distanceFare: number;
        finalFare: number;
        pricingGeoLevel: string | null;
        pricingGeoRefId: string | null;
      };
      if (!q.eligible || !(q.finalFare > 0)) continue;
      quotes[code] = {
        eligible: q.eligible,
        baseFare: q.baseFare,
        distanceFare: q.distanceFare,
        finalFare: q.finalFare,
        pricingGeoLevel: q.pricingGeoLevel ?? null,
        pricingGeoRefId: q.pricingGeoRefId ?? null,
      };
    }

    return { ok: true, quotes };
  } catch (err: unknown) {
    if (isAbortError(err)) return { ok: false, error: "aborted", code: "ABORTED" };
    const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
    const message = axiosErr.response?.data?.error ?? "Could not fetch parcel fare";
    const code = axiosErr.response?.data?.code;
    return { ok: false, error: message, code };
  }
}
