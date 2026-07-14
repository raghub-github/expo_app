import { getConfig } from "@/config/env";
import { normalizeOfferFromApi } from "@/lib/offers/offer-utils";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

const APP_SOURCE_HEADER = { "X-Source-Platform": "MERCHANT_APP" } as const;

export type OfferType =
  | "PERCENTAGE"
  | "FLAT"
  | "CART_PERCENTAGE"
  | "CART_FLAT"
  | "BUY_X_GET_Y"
  | "BUY_N_GET_M"
  | "BOGO"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "BUNDLE"
  | "TIERED"
  | "COUPON";

export interface Offer {
  id: number;
  offer_id: string;
  store_id: number | null;
  offer_title: string;
  offer_description: string | null;
  offer_type: OfferType;
  offer_sub_type: "ALL_ORDERS" | "SPECIFIC_ITEM";
  menu_item_ids: string[] | null;
  discount_value: string | null;
  discount_percentage: string | null;
  max_discount_amount: string | null;
  min_order_amount: string | null;
  max_order_amount: string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  coupon_code: string | null;
  offer_image_url: string | null;
  valid_from: string;
  valid_till: string;
  is_active: boolean | null;
  auto_apply: boolean | null;
  is_stackable: boolean | null;
  priority: number | null;
  first_order_only: boolean | null;
  new_user_only: boolean | null;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  current_uses: number;
  applicable_on_days: string[] | null;
  applicable_time_start: string | null;
  applicable_time_end: string | null;
  offer_metadata: Record<string, unknown> | null;
  created_source_platform: string | null;
  updated_source_platform?: string | null;
  created_by_role: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferPayload {
  offer_title: string;
  offer_description?: string | null;
  offer_type: OfferType;
  offer_sub_type?: "ALL_ORDERS" | "SPECIFIC_ITEM";
  menu_item_ids?: string[] | null;
  discount_value?: number | null;
  discount_percentage?: number | null;
  max_discount_amount?: number | null;
  min_order_amount?: number | null;
  max_order_amount?: number | null;
  buy_quantity?: number | null;
  get_quantity?: number | null;
  coupon_code?: string | null;
  offer_image_url?: string | null;
  valid_from: string;
  valid_till: string;
  applicable_time_start?: string | null;
  applicable_time_end?: string | null;
  applicable_on_days?: string[] | null;
  is_active?: boolean;
  auto_apply?: boolean;
  is_stackable?: boolean;
  priority?: number;
  first_order_only?: boolean;
  new_user_only?: boolean;
  max_uses_total?: number | null;
  max_uses_per_user?: number | null;
  offer_metadata?: Record<string, unknown> | null;
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
  const rows = (data as any).offers ?? [];
  return rows.map((r: Record<string, unknown>) => normalizeOfferFromApi(r));
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
      headers: APP_SOURCE_HEADER,
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to create offer");
  }
  const data = await res.json();
  return normalizeOfferFromApi((data as any).offer ?? {});
}

export async function updateOffer(
  storeId: number,
  offerId: string | number,
  payload: Partial<CreateOfferPayload> & { offer_image_url?: string | null; is_active?: boolean },
  token: string
): Promise<Offer> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/${offerId}`,
    token,
    {
      method: "PATCH",
      headers: APP_SOURCE_HEADER,
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to update offer");
  }
  const data = await res.json();
  return normalizeOfferFromApi((data as any).offer ?? {});
}

export async function deleteOffer(
  storeId: number,
  offerId: string | number,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/${offerId}`,
    token,
    { method: "DELETE", headers: APP_SOURCE_HEADER }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to delete offer");
  }
}

export type OfferInsightsApiResponse = {
  gross: number;
  discount: number;
  orders: number;
  total_store_orders: number;
  total_store_sales: number;
  monthly: Array<{
    key: string;
    label: string;
    offer_gross: number;
    offer_discount: number;
    offer_orders: number;
    store_gross: number;
    store_orders: number;
  }>;
  discount_types: Array<{
    offer_type: string;
    gross: number;
    discount: number;
    orders: number;
  }>;
  customers: { new_orders: number; repeat_orders: number; lapsed_orders: number };
};

export async function fetchOfferInsights(
  storeId: number,
  token: string,
  range: { startMs: number; endMs: number }
): Promise<OfferInsightsApiResponse> {
  const q = new URLSearchParams({
    start: new Date(range.startMs).toISOString(),
    end: new Date(range.endMs).toISOString(),
  });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/insights?${q.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to load offer insights");
  }
  const data = await res.json();
  const insights = (data as { insights?: OfferInsightsApiResponse }).insights;
  if (!insights) throw new Error("Invalid insights response");
  return insights;
}

export async function uploadOfferImage(
  storeId: number,
  offerId: string | number,
  token: string,
  file: { uri: string; type: string; name: string }
): Promise<{ image_url: string }> {
  const formData = new FormData();
  formData.append("file", { uri: file.uri, type: file.type, name: file.name } as any);
  formData.append("offerId", String(offerId));
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/offers/${offerId}/upload-image`,
    token,
    { method: "POST", body: formData }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to upload offer image");
  }
  const data = await res.json();
  return { image_url: (data as any).url ?? (data as any).image_url };
}
