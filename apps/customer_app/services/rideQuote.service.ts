import api from "./api";

const RIDES_PREFIX = "/v1/rides";

export type RideFareQuoteBilling = {
  finalAmount: number;
  rideFare: number;
  platformFee: number;
  convenienceFee: number;
  taxTotal: number;
  tipAmount: number;
  charges?: Array<{ label: string; amount: number; kind?: string }>;
  taxes?: Array<{ label: string; amount: number }>;
  breakdownSteps?: Array<{ step: string; amount: number }>;
};

export type RideFareQuote = {
  eligible: boolean;
  maxDistanceKm: number | null;
  baseFare: number;
  distanceFare: number;
  surgeTotal: number;
  finalFare: number;
  appliedSurges: Array<{ name: string; amount: number }>;
  rateCardSummary: string | null;
  waitingChargeNote: string | null;
  billing?: RideFareQuoteBilling | null;
};

export type RideFareQuoteResult =
  | { ok: true; quote: RideFareQuote }
  | { ok: false; error: string; code?: string };

export async function getRideFareQuote(params: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  tripKm: number;
  catalogCode: string;
  pickupPincode?: string;
  pickupState?: string;
}): Promise<RideFareQuoteResult> {
  try {
    const { data } = await api.post<{
      ok: true;
      eligible: boolean;
      maxDistanceKm: number | null;
      baseFare: number;
      distanceFare: number;
      surgeTotal: number;
      finalFare: number;
      appliedSurges: Array<{ name: string; amount: number }>;
      rateCardSummary: string | null;
      waitingChargeNote: string | null;
      billing?: RideFareQuoteBilling | null;
    }>(`${RIDES_PREFIX}/quote`, params);
    if (!data?.ok) return { ok: false, error: "Quote unavailable" };
    return {
      ok: true,
      quote: {
        eligible: data.eligible,
        maxDistanceKm: data.maxDistanceKm,
        baseFare: data.baseFare,
        distanceFare: data.distanceFare,
        surgeTotal: data.surgeTotal,
        finalFare: data.finalFare,
        appliedSurges: data.appliedSurges ?? [],
        rateCardSummary: data.rateCardSummary ?? null,
        waitingChargeNote: data.waitingChargeNote ?? null,
        billing: data.billing ?? null,
      },
    };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
    const message = axiosErr.response?.data?.error ?? "Could not fetch ride fare";
    const code = axiosErr.response?.data?.code;
    return { ok: false, error: message, code };
  }
}
