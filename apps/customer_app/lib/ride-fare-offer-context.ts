/** Offer / auto-offer context persisted at ride placement — reuse on payment screens. */
export function resolveRideFareBillOfferContext(
  checkoutMetadata?: Record<string, unknown> | null
): {
  platformOfferId?: number;
  forceNoAutoOffer?: boolean;
} {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return {};
  const rawOffer = checkoutMetadata.selectedPlatformOfferId;
  const offerNum = Number(rawOffer);
  const platformOfferId =
    rawOffer != null && Number.isFinite(offerNum) && offerNum > 0 ? offerNum : undefined;
  const forceNoAutoOffer =
    checkoutMetadata.forceNoAutoOffer === true ||
    String(checkoutMetadata.forceNoAutoOffer ?? "").toLowerCase() === "true";
  return {
    ...(platformOfferId != null ? { platformOfferId } : {}),
    ...(forceNoAutoOffer ? { forceNoAutoOffer: true } : {}),
  };
}

/** Booking-time payable (excludes tip) from persisted order fields. */
export function resolveRideBookingPayableTotal(order: {
  totalAmount?: number | null;
  tipAmount?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
  checkoutMetadata?: Record<string, unknown> | null;
}): number | null {
  const meta =
    order.checkoutMetadata != null && typeof order.checkoutMetadata === "object"
      ? order.checkoutMetadata
      : null;
  const fromMeta = meta ? Number(meta.quotedGrandTotal) : NaN;
  if (Number.isFinite(fromMeta) && fromMeta > 0) {
    const tip = Math.max(0, Number(order.tipAmount ?? meta?.customerTipAmount ?? 0));
    return Math.round((fromMeta - tip) * 100) / 100;
  }
  const snap =
    order.billingSnapshot != null && typeof order.billingSnapshot === "object"
      ? order.billingSnapshot
      : null;
  const fromSnap = snap ? Number(snap.final_amount) : NaN;
  if (Number.isFinite(fromSnap) && fromSnap > 0) {
    const tip = Math.max(0, Number(order.tipAmount ?? snap?.tip_amount ?? 0));
    return Math.round((fromSnap - tip) * 100) / 100;
  }
  const total = Number(order.totalAmount ?? 0);
  const tip = Math.max(0, Number(order.tipAmount ?? 0));
  const rideTotal = total - tip;
  return Number.isFinite(rideTotal) && rideTotal > 0 ? Math.round(rideTotal * 100) / 100 : null;
}
