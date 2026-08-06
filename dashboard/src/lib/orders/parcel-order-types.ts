/**
 * Client-safe parcel order detail types (no DB / server-only imports).
 */

export type ParcelOrderDetail = {
  receiverName: string | null;
  receiverMobile: string | null;
  senderName: string | null;
  senderMobile: string | null;
  parcelType: string | null;
  vehicleCategory: string | null;
  vehicleTypeRequired: string | null;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  pickupLabel: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLon: number | null;
  dropLabel: string | null;
  dropAddress: string | null;
  dropLat: number | null;
  dropLon: number | null;
  pickupOtp: string | null;
  deliveryOtp: string | null;
  paymentMethod: string | null;
  payAt: string | null;
  isCod: boolean | null;
  codAmount: number | null;
  estimatedFare: number | null;
  finalFare: number | null;
  tripDistanceKm: number | null;
  couponCode: string | null;
  appliedOfferDiscount: number | null;
  requiresOtpVerification: boolean | null;
  cancellationReasonCode: string | null;
  cancellationReasonText: string | null;
  instructions: string | null;
};
