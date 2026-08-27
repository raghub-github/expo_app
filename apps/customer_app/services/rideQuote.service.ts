import api from "./api";

const RIDES_PREFIX = "/v1/rides";

export type RideFareQuoteBilling = {
  finalAmount: number;
  rideFare: number;
  platformFee: number;
  convenienceFee: number;
  taxTotal: number;
  tipAmount: number;
  discountTotal?: number;
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

function mapQuotePayload(data: {
  eligible: boolean;
  maxDistanceKm: number | null;
  baseFare: number;
  distanceFare: number;
  surgeTotal: number;
  finalFare: number;
  appliedSurges?: Array<{ name: string; amount: number }>;
  rateCardSummary?: string | null;
  waitingChargeNote?: string | null;
  billing?: RideFareQuoteBilling | null;
}): RideFareQuote {
  return {
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
  };
}

export async function getRideFareQuote(params: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  tripKm: number;
  catalogCode: string;
  pickupPincode?: string;
  pickupState?: string;
  signal?: AbortSignal;
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
    }>(`${RIDES_PREFIX}/quote`, params, { signal: params.signal });
    if (!data?.ok) return { ok: false, error: "Quote unavailable" };
    return { ok: true, quote: mapQuotePayload(data) };
  } catch (err: unknown) {
    if (isAbortError(err)) return { ok: false, error: "aborted", code: "ABORTED" };
    const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
    const message = axiosErr.response?.data?.error ?? "Could not fetch ride fare";
    const code = axiosErr.response?.data?.code;
    return { ok: false, error: message, code };
  }
}

export type RideFareQuoteBatchResult =
  | {
      ok: true;
      quotes: Record<string, RideFareQuote>;
      fareOffsets?: Record<string, { parentCatalogCode: string; discountInr: number }>;
      timings?: {
        geoMs: number;
        configMs: number;
        slabsMs: number;
        pricingMs: number;
        billingMs: number;
        totalMs: number;
      };
    }
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

/** One round-trip for all vehicle fares (shared geo/slabs/billing on server). */
export async function getRideFareQuoteBatch(params: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  tripKm: number;
  catalogCodes: string[];
  pickupPincode?: string;
  pickupState?: string;
  signal?: AbortSignal;
}): Promise<RideFareQuoteBatchResult> {
  try {
    const { signal: _signal, ...body } = params;
    const { data } = await api.post<{
      ok: true;
      quotes: Record<
        string,
        | ({
            ok: true;
            eligible: boolean;
            maxDistanceKm: number | null;
            baseFare: number;
            distanceFare: number;
            surgeTotal: number;
            finalFare: number;
            appliedSurges?: Array<{ name: string; amount: number }>;
            rateCardSummary?: string | null;
            waitingChargeNote?: string | null;
            billing?: RideFareQuoteBilling | null;
          })
        | { ok: false; code: string; message: string }
      >;
      fareOffsets?: Record<string, { parentCatalogCode: string; discountInr: number }>;
      timings?: RideFareQuoteBatchResult extends { ok: true; timings?: infer T } ? T : never;
    }>(`${RIDES_PREFIX}/quote-batch`, body, { signal: params.signal, timeout: 12_000 });

    if (!data?.ok || !data.quotes) return { ok: false, error: "Quote batch unavailable" };

    const quotes: Record<string, RideFareQuote> = {};
    for (const [code, raw] of Object.entries(data.quotes)) {
      if (!raw || typeof raw !== "object") continue;
      if ((raw as { ok?: boolean }).ok === false) continue;
      const q = raw as {
        ok?: true;
        eligible: boolean;
        maxDistanceKm: number | null;
        baseFare: number;
        distanceFare: number;
        surgeTotal: number;
        finalFare: number;
        appliedSurges?: Array<{ name: string; amount: number }>;
        rateCardSummary?: string | null;
        waitingChargeNote?: string | null;
        billing?: RideFareQuoteBilling | null;
      };
      if (!q.eligible || !(q.finalFare > 0)) continue;
      quotes[code] = mapQuotePayload(q);
    }

    return { ok: true, quotes, fareOffsets: data.fareOffsets, timings: data.timings };
  } catch (err: unknown) {
    if (isAbortError(err)) return { ok: false, error: "aborted", code: "ABORTED" };
    const axiosErr = err as {
      code?: string;
      message?: string;
      response?: { data?: { error?: string; code?: string } };
    };
    const message = axiosErr.response?.data?.error ?? "Could not fetch ride fares";
    const network =
      axiosErr.code === "ERR_NETWORK" ||
      axiosErr.code === "ECONNABORTED" ||
      axiosErr.code === "ETIMEDOUT" ||
      /network|fetch failed|timeout/i.test(String(axiosErr.message ?? ""));
    const code = axiosErr.response?.data?.code ?? (network ? "NETWORK" : undefined);
    return { ok: false, error: message, code };
  }
}
