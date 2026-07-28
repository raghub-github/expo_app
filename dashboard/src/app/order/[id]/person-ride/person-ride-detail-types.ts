/**
 * Person-ride-only detail page types (no food imports).
 */

import type { PersonRideOrderDetail } from "@/lib/orders/person-ride-order-types";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";

export type PersonRideDetailOrder = {
  id: number;
  formattedOrderId: string | null;
  orderId: string | null;
  orderType: string;
  orderSource: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  fareAmount: number | null;
  itemTotal: number | null;
  grandTotal: number | null;
  tipAmount: number | null;
  billingSnapshot: Record<string, unknown> | null;
  /** Latest CS agent email stamped on Routed To. */
  routedToEmail: string | null;
  customerId: number | null;
  customerExternalId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  customerRiskFlag: string | null;
  customerAccountStatus: string | null;
  customerTrustTierLabel: string | null;
  customerFraudReasons: string[];
  customerFeedback: OrderCustomerFeedback | null;
  distanceMismatchFlagged: boolean;
  pickupAddressDeviationMeters: number | null;
  dropAddressDeviationMeters: number | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  pickupAddressRaw: string | null;
  pickupAddressNormalized: string | null;
  pickupAddressGeocoded: string | null;
  dropAddressRaw: string | null;
  dropAddressNormalized: string | null;
  dropAddressGeocoded: string | null;
  pickupLat: number | null;
  pickupLon: number | null;
  dropLat: number | null;
  dropLon: number | null;
  distanceKm: number | null;
  etaSeconds: number | null;
  estimatedDeliveryTime: string | null;
  createdAt: string;
  updatedAt: string;
  rideDetail: PersonRideOrderDetail | null;
};

export function mapCoreRowToPersonRideDetail(
  row: Record<string, unknown>
): PersonRideDetailOrder {
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: row.id as number,
    formattedOrderId: (row.formattedOrderId as string | null) ?? null,
    orderId: (row.orderId as string | null) ?? null,
    orderType: (row.orderType as string) ?? "person_ride",
    orderSource: (row.orderSource as string | null) ?? null,
    status: String(row.status ?? ""),
    currentStatus: (row.currentStatus as string | null) ?? null,
    paymentStatus: (row.paymentStatus as string | null) ?? null,
    paymentMethod: (row.paymentMethod as string | null) ?? null,
    fareAmount: num(row.fareAmount),
    itemTotal: num(row.itemTotal),
    grandTotal: num(row.grandTotal),
    tipAmount: num(row.tipAmount),
    billingSnapshot:
      row.billingSnapshot != null && typeof row.billingSnapshot === "object"
        ? (row.billingSnapshot as Record<string, unknown>)
        : null,
    routedToEmail:
      row.routedToEmail != null
        ? String(row.routedToEmail)
        : row.routed_to_email != null
          ? String(row.routed_to_email)
          : null,
    customerId: (row.customerId as number | null) ?? null,
    customerExternalId:
      row.customerExternalId != null
        ? String(row.customerExternalId)
        : row.customer_external_id != null
          ? String(row.customer_external_id)
          : null,
    customerName: (row.customerName as string | null) ?? null,
    customerMobile: (row.customerMobile as string | null) ?? null,
    customerEmail: (row.customerEmail as string | null) ?? null,
    customerRiskFlag: (row.customerRiskFlag as string | null) ?? null,
    customerAccountStatus: (row.customerAccountStatus as string | null) ?? null,
    customerTrustTierLabel:
      row.customerTrustTierLabel != null
        ? String(row.customerTrustTierLabel)
        : row.customerUserType != null
          ? String(row.customerUserType)
          : null,
    customerFraudReasons: Array.isArray(row.customerFraudReasons)
      ? (row.customerFraudReasons as string[])
      : [],
    customerFeedback:
      row.customerFeedback && typeof row.customerFeedback === "object"
        ? (row.customerFeedback as OrderCustomerFeedback)
        : null,
    distanceMismatchFlagged: Boolean(row.distanceMismatchFlagged),
    pickupAddressDeviationMeters: num(row.pickupAddressDeviationMeters),
    dropAddressDeviationMeters: num(row.dropAddressDeviationMeters),
    riderId: (row.riderId as number | null) ?? null,
    riderName: (row.riderName as string | null) ?? null,
    riderMobile: (row.riderMobile as string | null) ?? null,
    pickupAddressRaw: (row.pickupAddressRaw as string | null) ?? null,
    pickupAddressNormalized: (row.pickupAddressNormalized as string | null) ?? null,
    pickupAddressGeocoded:
      row.pickupAddressGeocoded != null ? String(row.pickupAddressGeocoded) : null,
    dropAddressRaw: (row.dropAddressRaw as string | null) ?? null,
    dropAddressNormalized: (row.dropAddressNormalized as string | null) ?? null,
    dropAddressGeocoded:
      row.dropAddressGeocoded != null ? String(row.dropAddressGeocoded) : null,
    pickupLat: num(row.pickupLat),
    pickupLon: num(row.pickupLon),
    dropLat: num(row.dropLat),
    dropLon: num(row.dropLon),
    distanceKm: num(row.distanceKm),
    etaSeconds: num(row.etaSeconds),
    estimatedDeliveryTime:
      row.estimatedDeliveryTime != null ? String(row.estimatedDeliveryTime) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    rideDetail:
      row.rideDetail && typeof row.rideDetail === "object"
        ? (row.rideDetail as PersonRideOrderDetail)
        : null,
  };
}
