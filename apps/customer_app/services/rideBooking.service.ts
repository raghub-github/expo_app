/**
 * Ride booking APIs — place ride order, poll status, cancel.
 */

import api from "./api";
import { ORDER_PLACEMENT_TIMEOUT_MS } from "@/constants";

const RIDES_PREFIX = "/v1/rides";

export type RideIntermediateStopPayload = {
  sequence: number;
  address: string;
  latitude: number;
  longitude: number;
};

export type PlaceRideOrderPayload = {
  pickupAddress: string;
  pickupLabel?: string;
  pickupLat: number;
  pickupLng: number;
  dropAddress: string;
  dropLabel?: string;
  dropLat: number;
  dropLng: number;
  intermediateStops?: RideIntermediateStopPayload[];
  rideType: string;
  vehicleTypeRequired?: string;
  estimatedFare: number;
  tripKm?: number;
  paymentMethod?: "cash" | "upi" | "card" | "wallet" | "online";
  bookedForSelf?: boolean;
  passengerName?: string | null;
  passengerPhone?: string | null;
  pickupDistanceFromBookerKm?: number | null;
  farPickupPromptShown?: boolean;
  farPickupAcknowledged?: boolean;
  searchTimeoutSec?: number;
  customerTipAmount?: number;
  pickupPincode?: string;
  pickupState?: string;
};

export type PlaceRideOrderResponse = {
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

export type RideOrderCaptainProfile = {
  name: string;
  phone?: string;
  photoUrl?: string | null;
  rating?: number | null;
  deliveredOrdersCount?: number | null;
  vehicleRegistration?: string | null;
  vehicleModel?: string | null;
};

export type RideOrderStatusResponse = {
  orderId: string;
  coreOrderId: number;
  status: string;
  appStatus: string;
  riderId: number | null;
  riderAssigned: boolean;
  /** Full captain profile when assigned — hydrate Captain Card without waiting on GET /orders. */
  rider: RideOrderCaptainProfile | null;
  totalAmount: number;
  searchExpiresAt: string | null;
  cancelled: boolean;
  pickupOtp: string | null;
  rideStarted: boolean;
  riderReachedPickupAt?: string | null;
  pickupOtpVerifiedAt?: string | null;
  pickupWaitSeconds?: number | null;
  pickupWaitFreeMinutes?: number;
  pickupWaitingChargePerMin?: number;
  estimatedPickupWaitingCharge?: number;
  awaitingTipBoost?: boolean;
  dispatchRetryCount?: number;
  dispatchDeclinedCount?: number;
  customerTipAmount?: number;
  prebookTipAmount?: number;
  searchBoostTip1?: number;
  searchBoostTip2?: number;
  estimatedFare?: number;
};

export type ExtendRideSearchResponse = {
  orderId: string;
  searchExpiresAt: string;
  searchExtendedUntil: string;
  dispatchRetryCount: number;
  customerTipAmount: number;
  prebookTipAmount: number;
  searchBoostTip1: number;
  searchBoostTip2: number;
  tipBoostApplied: boolean;
  higherDispatchPriority: boolean;
  extensionSec: number;
};

export async function placeRideOrder(
  payload: PlaceRideOrderPayload
): Promise<PlaceRideOrderResponse> {
  const { data } = await api.post<PlaceRideOrderResponse>(`${RIDES_PREFIX}`, payload, {
    timeout: ORDER_PLACEMENT_TIMEOUT_MS,
  });
  return data;
}

export async function getRideOrderStatus(orderId: string): Promise<RideOrderStatusResponse> {
  const { data } = await api.get<RideOrderStatusResponse>(`${RIDES_PREFIX}/${orderId}`);
  return data;
}

/** Captain accepted / assigned — customer should leave the searching screen. */
export function isRideCaptainAssigned(status: RideOrderStatusResponse): boolean {
  if (status.cancelled) return false;
  if (status.riderAssigned) return true;
  if (status.riderId != null && status.riderId > 0) return true;
  const app = (status.appStatus ?? "").trim().toUpperCase();
  return (
    app === "RIDER_ASSIGNED" ||
    app === "RIDE_IN_PROGRESS" ||
    app === "RIDER_AT_PICKUP" ||
    app === "REACHED_STORE"
  );
}

export async function cancelRideOrder(
  orderId: string,
  options?: {
    reasonCode?: string;
    reasonText?: string;
    cancelMode?: "manual" | "auto" | "timeout";
  }
): Promise<{ orderId: string; status: string }> {
  const { data } = await api.post<{ orderId: string; status: string }>(
    `${RIDES_PREFIX}/${orderId}/cancel`,
    {
      reasonCode: options?.reasonCode,
      reasonText: options?.reasonText,
      cancelMode: options?.cancelMode ?? "manual",
    }
  );
  return data;
}

export async function markRideSearchWindowEnded(
  orderId: string
): Promise<{ orderId: string; awaitingTipBoost: boolean; searchExpiresAt: string }> {
  const { data } = await api.post<{ orderId: string; awaitingTipBoost: boolean; searchExpiresAt: string }>(
    `${RIDES_PREFIX}/${orderId}/search-window-ended`,
    {}
  );
  return data;
}

export async function extendRideSearch(
  orderId: string,
  options?: { tipAmount?: number }
): Promise<ExtendRideSearchResponse> {
  const { data } = await api.post<ExtendRideSearchResponse>(
    `${RIDES_PREFIX}/${orderId}/extend-search`,
    { tipAmount: options?.tipAmount ?? 0 }
  );
  return data;
}
