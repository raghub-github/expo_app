/** Order-scoped alternate delivery contact — alternate becomes primary for rider calls. */

export function canCustomerUpdateAlternateContact(statusUpper: string): boolean {
  const blocked = new Set([
    "OUT_FOR_DELIVERY",
    "ON_THE_WAY",
    "IN_TRANSIT",
    "PICKED_UP",
    "DELIVERED",
    "CANCELLED",
    "FAILED",
    "RTO",
    "PAYMENT_FAILED",
  ]);
  return !blocked.has(statusUpper);
}

/** Normalize Indian mobile to 10 digits; returns null when invalid. */
export function normalizeOrderContactPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return null;
}

export function maskOrderContactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}XXXX`;
  return `${digits.slice(0, 6)}XXXX`;
}

export type OrderAlternateContactRow = {
  alternateContactName?: string | null;
  alternateContactPhone?: string | null;
  deliveryPrimaryContactName?: string | null;
  deliveryPrimaryContactPhone?: string | null;
};

export function applyAlternateAsEffectiveDeliveryContact(input: {
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  alternate: OrderAlternateContactRow;
}): { deliveryContactName: string | null; deliveryContactPhone: string | null } {
  const alternatePhone = input.alternate.alternateContactPhone?.trim() || null;
  if (!alternatePhone) {
    return {
      deliveryContactName: input.deliveryContactName,
      deliveryContactPhone: input.deliveryContactPhone,
    };
  }
  return {
    deliveryContactName:
      input.alternate.alternateContactName?.trim() || input.deliveryContactName,
    deliveryContactPhone: alternatePhone,
  };
}

export type RiderCustomerContactFields = {
  customerPhone: string | null;
  customerName: string | null;
  customerPrimaryPhone: string | null;
  customerPrimaryName: string | null;
  customerAlternatePhone: string | null;
  customerAlternateName: string | null;
};

export function resolveRiderCustomerContactFields(input: {
  foodCustomerName: string | null;
  foodCustomerPhone: string | null;
  alternate: OrderAlternateContactRow;
}): RiderCustomerContactFields {
  const alternatePhone = input.alternate.alternateContactPhone?.trim() || null;
  const alternateName = input.alternate.alternateContactName?.trim() || null;

  if (!alternatePhone) {
    return {
      customerPhone: input.foodCustomerPhone?.trim() || null,
      customerName: input.foodCustomerName?.trim() || null,
      customerPrimaryPhone: null,
      customerPrimaryName: null,
      customerAlternatePhone: null,
      customerAlternateName: null,
    };
  }

  return {
    customerPhone: alternatePhone,
    customerName: alternateName || input.foodCustomerName?.trim() || null,
    customerPrimaryPhone: input.alternate.deliveryPrimaryContactPhone?.trim() || null,
    customerPrimaryName: input.alternate.deliveryPrimaryContactName?.trim() || null,
    customerAlternatePhone: alternatePhone,
    customerAlternateName: alternateName,
  };
}
