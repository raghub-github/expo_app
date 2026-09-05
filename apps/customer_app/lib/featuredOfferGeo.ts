/** Stabilize offer/geo query keys so GPS jitter does not duplicate featured-offer fetches. */

export function roundOfferCoord(n: number | null | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.round(n * 1e4) / 1e4;
}

export type OfferLocationParams = {
  lat?: number;
  lng?: number;
  pincode?: string;
  state?: string;
  city?: string;
};

export function normalizeOfferLocationParams(params: OfferLocationParams): OfferLocationParams {
  return {
    pincode: params.pincode?.trim() || undefined,
    state: params.state?.trim() || undefined,
    city: params.city?.trim() || undefined,
    lat: roundOfferCoord(params.lat),
    lng: roundOfferCoord(params.lng),
  };
}
