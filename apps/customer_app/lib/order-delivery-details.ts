import type { OrderDetail } from "@/services/order.service";

export type OrderDeliveryDetailsView = {
  contactTitle: string | null;
  contactSubtitle: string | null;
  addressTitle: string | null;
  addressLine: string | null;
  instructionItems: string[];
};

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}XXXX`;
  return `${digits.slice(0, 6)}XXXX`;
}

export function buildOrderDeliveryDetailsView(order: OrderDetail): OrderDeliveryDetailsView {
  const contactName = order.deliveryContactName?.trim() || null;
  const contactPhone = order.deliveryContactPhone?.trim() || null;
  const contactTitle =
    contactName && contactPhone
      ? `${contactName}, ${maskPhone(contactPhone)}`
      : contactName ?? (contactPhone ? maskPhone(contactPhone) : null);

  const addressLabel = order.deliveryAddressLabel?.trim() || null;
  const addressLine = order.deliveryAddress?.trim() || null;
  const addressTitle = addressLabel ? `Delivery at ${addressLabel}` : null;

  const instructionItems = (order.deliveryInstructionsList ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return {
    contactTitle,
    contactSubtitle: contactTitle ? "Delivery partner may call this number" : null,
    addressTitle,
    addressLine,
    instructionItems,
  };
}
