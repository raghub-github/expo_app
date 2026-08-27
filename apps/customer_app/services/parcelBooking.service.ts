/**
 * Parcel booking APIs — place parcel order.
 */

import api from "./api";
import { ORDER_PLACEMENT_TIMEOUT_MS } from "@/constants";

const PARCEL_PREFIX = "/v1/parcel";

export type PlaceParcelOrderPayload = {
  pickupAddress: string;
  pickupLabel?: string;
  pickupLat: number;
  pickupLng: number;
  dropAddress: string;
  dropLabel?: string;
  dropLat: number;
  dropLng: number;
  vehicleCategory: string;
  estimatedFare: number;
  tripKm?: number;
  payAt?: "pickup" | "drop";
  receiverName: string;
  receiverMobile: string;
  paymentMethod?: "cash" | "cod" | "online";
  couponCode?: string | null;
  selectedPlatformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  appliedOfferDiscount?: number | null;
};

export type PlaceParcelOrderResponse = {
  orderId: string;
  formattedOrderId?: string | null;
  coreOrderId: number;
  status: string;
  totalAmount: number;
  searchTimeoutSec: number;
  searchExpiresAt: string;
  createdAt: string;
  pickupOtp: string;
};

export async function placeParcelOrder(
  payload: PlaceParcelOrderPayload
): Promise<PlaceParcelOrderResponse> {
  const { data } = await api.post<PlaceParcelOrderResponse>(`${PARCEL_PREFIX}/`, payload, {
    timeout: ORDER_PLACEMENT_TIMEOUT_MS,
  });
  return data;
}

export async function cancelParcelOrder(
  orderId: string,
  options?: {
    reasonCode?: string;
    reasonText?: string;
    cancelMode?: "manual" | "auto" | "timeout";
  }
): Promise<{ orderId: string; status: string }> {
  const { data } = await api.post<{ orderId: string; status: string }>(
    `${PARCEL_PREFIX}/${encodeURIComponent(orderId)}/cancel`,
    {
      reasonCode: options?.reasonCode,
      reasonText: options?.reasonText,
      cancelMode: options?.cancelMode ?? "manual",
    }
  );
  return data;
}
