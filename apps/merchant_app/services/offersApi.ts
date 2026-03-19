import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type OfferType =
  | "PERCENTAGE_DISCOUNT"
  | "FLAT_DISCOUNT"
  | "COUPON_DISCOUNT"
  | "BUY_N_GET_M"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "COMBO_OFFER"
  | "CASHBACK"
  | "FIRST_ORDER_OFFER"
  | "LOYALTY_BASED";

export interface Offer {
  id: number;
  store_id: number | null;
  type: OfferType;
  title: string;
  conditions: Record<string, unknown>;
  benefits: Record<string, unknown>;
  priority: number;
  stackable: boolean;
  combinable_with: string[];
  max_offers_per_order: number;
  usage_limit_total: number | null;
  usage_limit_per_user: number | null;
  valid_from: string;
  valid_till: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "EXPIRED" | "ARCHIVED";
}

export interface CreateOfferPayload {
  title: string;
  type: OfferType;
  storeId: number;
  priority?: number;
  stackable?: boolean;
  combinableWith?: string[];
  maxOffersPerOrder?: number;
  validFrom: string;
  validTill: string;
  conditions: Record<string, unknown>;
  benefits: Record<string, unknown>;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number | null;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE";
}

export async function listOffers(storeId: number, token: string): Promise<Offer[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to load offers");
  }
  const data = await res.json();
  return (data as any).offers ?? [];
}

export async function createOffer(
  storeId: number,
  payload: CreateOfferPayload,
  token: string
): Promise<Offer> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers`,
    token,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to create offer");
  }
  const data = await res.json();
  return (data as any).offer;
}

export async function updateOffer(
  storeId: number,
  offerId: number,
  payload: Partial<CreateOfferPayload>,
  token: string
): Promise<Offer> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/${offerId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to update offer");
  }
  const data = await res.json();
  return (data as any).offer;
}

export async function deleteOffer(
  storeId: number,
  offerId: number,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/${offerId}`,
    token,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to delete offer");
  }
}

